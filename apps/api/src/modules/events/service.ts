import {
  CATEGORIES,
  CITIES,
  datePresetRange,
  expandCityIds,
  normalizeText,
  relatedEvents,
  REGIONS,
  TECHNOLOGIES,
  type EventDetail,
  type EventQuery,
  type EventSummary,
  type HomeFeed,
  type HomeQuery,
  type OrganizerProfile,
  type Page,
} from '@eii/shared';
import type { Db } from '../../db/client';
import { EventRepository } from './repository';

const NOTABLE_TYPES = ['conference', 'summit', 'expo', 'exhibition', 'trade_show', 'industry_forum', 'convention'];

/** Event business logic. Routes stay thin; SQL stays in the repository. */
export class EventService {
  readonly repo: EventRepository;

  constructor(private readonly db: Db) {
    this.repo = new EventRepository(db);
  }

  list(query: EventQuery, now = new Date()): Promise<Page<EventSummary>> {
    return this.repo.list(query, now);
  }

  get(id: string): Promise<EventDetail | null> {
    return this.repo.get(id);
  }

  /** Home sections (spec §9–13), the same rules as the app's sample-data feed. */
  async home(query: HomeQuery, now = new Date()): Promise<HomeFeed> {
    const cities = expandCityIds(query.cityIds);
    const inPlace = (sql: { and: (c: string) => void; param: (v: unknown) => string }) => {
      if (cities) sql.and(`o.city_id = any(${sql.param([...cities])}::text[])`);
    };
    const week = datePresetRange('this_week', now);

    const [thisWeek, newlyAdded, recentlyUpdated, categories] = await Promise.all([
      this.repo.select(
        (sql) => {
          inPlace(sql);
          sql.and(`o.status not in ('cancelled', 'completed')`);
          sql.and(`o.start_at < ${sql.param(week.to)}`);
          sql.and(`o.end_at >= ${sql.param(week.from)}`);
        },
        'o.start_at asc, o.id asc',
        20,
        now,
      ),
      this.repo.select(
        (sql) => {
          inPlace(sql);
          sql.and(`o.status <> 'cancelled'`);
        },
        'o.created_at desc, o.id desc',
        8,
        now,
      ),
      this.repo.select(
        (sql) => {
          inPlace(sql);
          sql.and(`o.last_change_at >= ${sql.param(new Date(now.getTime() - 7 * 86_400_000))}`);
        },
        'o.last_change_at desc',
        5,
        now,
      ),
      this.repo.categoryCounts(query.cityIds, now),
    ]);

    const weekIds = thisWeek.map((e) => e.id);
    const upcoming = await this.repo.select(
      (sql) => {
        inPlace(sql);
        sql.and(`o.status not in ('cancelled', 'completed')`);
        sql.and(`o.event_type = any(${sql.param(NOTABLE_TYPES)}::text[])`);
        if (weekIds.length) sql.and(`not (o.id = any(${sql.param(weekIds)}::text[]))`);
      },
      'o.start_at asc, o.id asc',
      6,
      now,
    );

    return { upcoming, thisWeek, newlyAdded, recentlyUpdated, categories, generatedAt: now.toISOString() };
  }

  async related(id: string, now = new Date()): Promise<EventSummary[]> {
    const target = await this.repo.get(id);
    if (!target) return [];
    const candidates = await this.repo.relatedCandidates(target, now);
    return relatedEvents(target, candidates, now);
  }

  async organizer(id: string, now = new Date()): Promise<OrganizerProfile | null> {
    const rows = await this.db.query<{ id: string; name: string; website: string | null; description: string | null }>(
      'select id, name, website, description from organizers where id = $1',
      [id],
    );
    const org = rows[0];
    if (!org) return null;
    const events = await this.repo.byLink('organizer', id);
    return {
      organizer: { id: org.id, name: org.name, website: org.website ?? undefined, description: org.description ?? undefined },
      upcoming: events.filter((e) => new Date(e.endAt) >= now),
      past: events.filter((e) => new Date(e.endAt) < now).reverse(),
    };
  }

  async person(kind: 'speaker' | 'exhibitor', id: string, now = new Date()) {
    const row =
      kind === 'speaker'
        ? (await this.db.query<Record<string, string | null>>('select id, name, designation, company from speakers where id = $1', [id]))[0]
        : (await this.db.query<Record<string, string | null>>('select id, company, industry, website from exhibitors where id = $1', [id]))[0];
    if (!row) return null;
    const events = await this.repo.byLink(kind, id);
    return {
      [kind]: Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)),
      upcoming: events.filter((e) => new Date(e.endAt) >= now),
      past: events.filter((e) => new Date(e.endAt) < now).reverse(),
    };
  }

  /** Global search grouped by kind (spec §87). Events are the main result. */
  async searchGrouped(q: string, now = new Date()) {
    const text = normalizeText(q);
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const [events, organizers, speakers, exhibitors] = await Promise.all([
      this.repo.list({ q, limit: 10 }, now),
      this.db.query<{ id: string; name: string }>(
        `select id, name from organizers where name ilike $1 or word_similarity($2, name) >= 0.5 order by word_similarity($2, name) desc limit 5`,
        [like, q],
      ),
      this.db.query<{ id: string; name: string; company: string | null }>(
        `select id, name, company from speakers where name ilike $1 order by name limit 5`,
        [like],
      ),
      this.db.query<{ id: string; company: string }>(
        `select distinct on (company) id, company from exhibitors where company ilike $1 order by company limit 5`,
        [like],
      ),
    ]);
    const matches = (name: string, aliases: string[] = []) => text.length > 1 && [name, ...aliases].some((n) => normalizeText(n).includes(text));
    return {
      events: events.items,
      organizers,
      speakers,
      exhibitors,
      cities: [
        ...REGIONS.filter((r) => matches(r.name, r.aliases)).map((r) => ({ id: r.id, name: r.name })),
        ...CITIES.filter((c) => matches(c.name, c.aliases)).map((c) => ({ id: c.id, name: c.name })),
      ].slice(0, 5),
      categories: [...TECHNOLOGIES, ...CATEGORIES]
        .filter((t) => matches(t.name, t.keywords))
        .slice(0, 5)
        .map((t) => ({ id: t.id, name: t.name })),
    };
  }
}
