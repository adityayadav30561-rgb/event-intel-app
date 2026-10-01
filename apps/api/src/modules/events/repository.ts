import {
  datePresetRange,
  DEFAULT_PAGE_SIZE,
  expandCityIds,
  queryTokens,
  type EventDetail,
  type EventQuery,
  type EventSummary,
  type Page,
} from '@eii/shared';
import type { Db } from '../../db/client';
import { decodeCursor, encodeCursor } from '../../lib/cursor';
import { iso, isoOrUndefined, SUMMARY_COLUMNS, SUMMARY_FROM, toSummary, type SummaryRow } from './mappers';

/** Builds parameterised SQL fragments without string-concatenating user input. */
class Sql {
  params: unknown[] = [];
  where: string[] = [];
  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
  and(condition: string) {
    this.where.push(condition);
  }
  whereClause() {
    return this.where.length ? `where ${this.where.join(' and ')}` : '';
  }
}

/** Events a normal user may see (spec §65): verified and not removed. */
function visible(sql: Sql) {
  sql.and(`o.verification_status = 'verified'`);
  sql.and('o.deleted_at is null');
}

/**
 * Full-text query mirroring the shared keyword search: short words (SAP, AI) match whole words,
 * longer ones also match word starts ("manuf" → manufacturing).
 */
export function toTsQuery(q: string | undefined): string | undefined {
  const tokens = queryTokens(q ?? '');
  if (!tokens.length) return undefined;
  return tokens.map((t) => (t.length <= 3 ? t : `${t}:*`)).join(' & ');
}

function applyFilters(sql: Sql, query: EventQuery, now: Date) {
  visible(sql);
  if (!query.includePast) sql.and(`o.end_at >= ${sql.param(now)}`);
  const cities = expandCityIds(query.cityIds);
  if (cities) sql.and(`o.city_id = any(${sql.param([...cities])}::text[])`);
  const topic = (table: string, column: string, ids: string[] | undefined) => {
    if (ids?.length) sql.and(`exists (select 1 from ${table} t where t.occurrence_id = o.id and t.${column} = any(${sql.param(ids)}::text[]))`);
  };
  topic('occurrence_categories', 'category_id', query.categoryIds);
  topic('occurrence_technologies', 'technology_id', query.technologyIds);
  topic('occurrence_industries', 'industry_id', query.industryIds);
  if (query.eventTypes?.length) sql.and(`o.event_type = any(${sql.param(query.eventTypes)}::text[])`);
  if (query.organizerId) sql.and(`o.organizer_id = ${sql.param(query.organizerId)}`);
  const range = query.datePreset
    ? datePresetRange(query.datePreset, now)
    : query.from || query.to
      ? { from: query.from ? new Date(query.from) : new Date(0), to: query.to ? new Date(query.to) : new Date(8.64e15) }
      : undefined;
  if (range) {
    sql.and(`o.start_at < ${sql.param(range.to)}`);
    sql.and(`o.end_at >= ${sql.param(range.from)}`);
  }
}

const SORTS = {
  date: { order: 'o.start_at asc, o.id asc', key: 'o.start_at', dir: '>' as const, col: 'start_at' as const },
  recently_added: { order: 'o.created_at desc, o.id desc', key: 'o.created_at', dir: '<' as const, col: 'created_at' as const },
  recently_updated: { order: 'o.updated_at desc, o.id desc', key: 'o.updated_at', dir: '<' as const, col: 'updated_at' as const },
};

export class EventRepository {
  constructor(private readonly db: Db) {}

  /** Filtered, searched, sorted and paginated event list (GET /events). */
  async list(query: EventQuery, now: Date = new Date()): Promise<Page<EventSummary>> {
    const page = await this.listInternal(query, now, 'fts');
    // Nothing found with exact words? Try again tolerating typos ("hydrabad", "odo").
    if (page.items.length === 0 && !query.cursor && queryTokens(query.q ?? '').length) {
      const fuzzy = await this.listInternal(query, now, 'fuzzy');
      if (fuzzy.items.length) return fuzzy;
    }
    return page;
  }

  private async listInternal(query: EventQuery, now: Date, mode: 'fts' | 'fuzzy'): Promise<Page<EventSummary>> {
    const sql = new Sql();
    applyFilters(sql, query, now);
    const tsq = toTsQuery(query.q);
    let rank = '0';
    let tsParam: string | undefined;
    if (tsq && mode === 'fts') {
      tsParam = sql.param(tsq);
      sql.and(`o.search_vector @@ to_tsquery('simple', ${tsParam})`);
    } else if (tsq) {
      const scores = queryTokens(query.q ?? '').map((t) => `word_similarity(${sql.param(t)}, o.search_text)`);
      scores.forEach((s) => sql.and(`${s} >= 0.5`));
      rank = scores.join(' + ');
    }

    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const sortName = query.sort ?? (tsq ? 'relevance' : 'date');
    const cursor = decodeCursor(query.cursor);
    // Snapshot for the count before ordering adds parameters the count doesn't use.
    const countSql = `select count(*)::int as total ${SUMMARY_FROM} ${sql.whereClause()}`;
    const countParams = [...sql.params];

    if (tsParam) {
      // Words found in the title count most (as in the shared search); ts_rank breaks ties.
      const titleHits = (tsq ?? '')
        .split(' & ')
        .map((term) => `(ts_filter(o.search_vector, '{a}') @@ to_tsquery('simple', ${sql.param(term)}))::int`)
        .join(' + ');
      rank = `(${titleHits}) * 10 + ts_rank(o.search_vector, to_tsquery('simple', ${tsParam}))`;
    }

    let orderBy: string;
    if (sortName === 'relevance') {
      orderBy = `${rank} desc, o.start_at asc, o.id asc`;
    } else {
      const sort = SORTS[sortName];
      orderBy = sort.order;
      if (cursor && 'k' in cursor) sql.and(`(${sort.key}, o.id) ${sort.dir} (${sql.param(cursor.k[0])}::timestamptz, ${sql.param(cursor.k[1])})`);
    }
    const offset = sortName === 'relevance' && cursor && 'o' in cursor ? cursor.o : 0;

    const rows = await this.db.query<SummaryRow>(
      `select ${SUMMARY_COLUMNS} ${SUMMARY_FROM} ${sql.whereClause()} order by ${orderBy} limit ${sql.param(limit + 1)} offset ${sql.param(offset)}`,
      sql.params,
    );
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    let nextCursor: string | null = null;
    if (hasMore) {
      if (sortName === 'relevance') nextCursor = encodeCursor({ o: offset + limit });
      else {
        const last = items[items.length - 1]!;
        nextCursor = encodeCursor({ k: [iso(last[SORTS[sortName].col]), last.id] });
      }
    }
    // Counting costs a second query, so only the first page reports a total.
    const total = query.cursor ? undefined : (await this.db.query<{ total: number }>(countSql, countParams))[0]?.total;
    return { items: items.map(toSummary), nextCursor, total };
  }

  /** Summaries matching extra SQL conditions (used by Home sections). */
  async select(conditions: (sql: Sql) => void, orderBy: string, limit: number, now: Date): Promise<EventSummary[]> {
    const sql = new Sql();
    visible(sql);
    sql.and(`o.end_at >= ${sql.param(now)}`);
    conditions(sql);
    const rows = await this.db.query<SummaryRow>(
      `select ${SUMMARY_COLUMNS} ${SUMMARY_FROM} ${sql.whereClause()} order by ${orderBy} limit ${sql.param(limit)}`,
      sql.params,
    );
    return rows.map(toSummary);
  }

  async categoryCounts(cityIds: string[] | undefined, now: Date): Promise<{ id: string; count: number }[]> {
    const sql = new Sql();
    visible(sql);
    sql.and(`o.end_at >= ${sql.param(now)}`);
    sql.and(`o.status not in ('cancelled', 'completed')`);
    const cities = expandCityIds(cityIds);
    if (cities) sql.and(`o.city_id = any(${sql.param([...cities])}::text[])`);
    return this.db.query<{ id: string; count: number }>(
      `select oc.category_id as id, count(*)::int as count
       from event_occurrences o join occurrence_categories oc on oc.occurrence_id = o.id
       ${sql.whereClause()} group by oc.category_id order by count desc, oc.category_id limit 8`,
      sql.params,
    );
  }

  async get(id: string): Promise<EventDetail | null> {
    const sql = new Sql();
    visible(sql);
    sql.and(`o.id = ${sql.param(id)}`);
    const rows = await this.db.query<
      SummaryRow & {
        summary: string | null;
        description: string | null;
        audience: string[];
        registration_url: string | null;
        official_website: string | null;
        venue_address: string | null;
        venue_latitude: number | null;
        venue_longitude: number | null;
        organizer_website: string | null;
        organizer_description: string | null;
        last_verified_at: Date | null;
      }
    >(
      `select ${SUMMARY_COLUMNS}, o.summary, o.description, o.audience, o.registration_url, o.official_website,
         v.address as venue_address, v.latitude as venue_latitude, v.longitude as venue_longitude,
         org.website as organizer_website, org.description as organizer_description, o.last_verified_at
       ${SUMMARY_FROM} ${sql.whereClause()}`,
      sql.params,
    );
    const row = rows[0];
    if (!row) return null;

    const [speakers, exhibitors, agenda, sources, changes] = await Promise.all([
      this.db.query<{ id: string; name: string; designation: string | null; company: string | null; topic: string | null }>(
        `select s.id, s.name, s.designation, s.company, os.topic from occurrence_speakers os join speakers s on s.id = os.speaker_id
         where os.occurrence_id = $1 order by os.position`,
        [id],
      ),
      this.db.query<{ id: string; company: string; industry: string | null; website: string | null; booth: string | null }>(
        `select x.id, x.company, x.industry, x.website, ox.booth from occurrence_exhibitors ox join exhibitors x on x.id = ox.exhibitor_id
         where ox.occurrence_id = $1 order by x.company`,
        [id],
      ),
      this.db.query<{ id: string; day: number; starts_at: Date; ends_at: Date | null; title: string; description: string | null; room: string | null; speaker_ids: string[] }>(
        `select id, day, starts_at, ends_at, title, description, room, speaker_ids from agenda_items where occurrence_id = $1 order by starts_at, id`,
        [id],
      ),
      this.db.query<{ name: string; kind: string; source_url: string | null; last_checked_at: Date }>(
        `select s.name, s.kind, os.source_url, os.last_checked_at from occurrence_sources os join sources s on s.id = os.source_id
         where os.occurrence_id = $1 order by s.priority desc`,
        [id],
      ),
      this.db.query<{ id: string; field: string; significance: string; old_value: string | null; new_value: string | null; detected_at: Date }>(
        `select id, field, significance, old_value, new_value, detected_at from event_changes where occurrence_id = $1 order by detected_at desc limit 20`,
        [id],
      ),
    ]);

    const summary = toSummary(row);
    return {
      ...summary,
      summary: row.summary ?? undefined,
      description: row.description ?? undefined,
      venue: row.venue_name
        ? { name: row.venue_name, address: row.venue_address ?? undefined, latitude: row.venue_latitude ?? undefined, longitude: row.venue_longitude ?? undefined }
        : undefined,
      organizerDetail: summary.organizer
        ? { ...summary.organizer, website: row.organizer_website ?? undefined, description: row.organizer_description ?? undefined }
        : undefined,
      audience: row.audience ?? [],
      speakers: speakers.map((s) => ({ id: s.id, name: s.name, designation: s.designation ?? undefined, company: s.company ?? undefined, topic: s.topic ?? undefined })),
      exhibitors: exhibitors.map((x) => ({ id: x.id, company: x.company, industry: x.industry ?? undefined, website: x.website ?? undefined, booth: x.booth ?? undefined })),
      agenda: agenda.map((a) => ({
        id: a.id,
        day: a.day,
        startsAt: iso(a.starts_at),
        endsAt: isoOrUndefined(a.ends_at),
        title: a.title,
        description: a.description ?? undefined,
        room: a.room ?? undefined,
        speakerIds: a.speaker_ids?.length ? a.speaker_ids : undefined,
      })),
      registrationUrl: row.registration_url ?? undefined,
      officialWebsite: row.official_website ?? undefined,
      sources: sources.map((s) => ({ name: s.name, kind: s.kind as EventDetail['sources'][number]['kind'], url: s.source_url ?? undefined, lastCheckedAt: iso(s.last_checked_at) })),
      changes: changes.map((c) => ({
        id: c.id,
        field: c.field as EventDetail['changes'][number]['field'],
        significance: c.significance as EventDetail['changes'][number]['significance'],
        previous: c.old_value ?? undefined,
        current: c.new_value ?? undefined,
        detectedAt: iso(c.detected_at),
      })),
      lastVerifiedAt: isoOrUndefined(row.last_verified_at),
    };
  }

  /** Upcoming events sharing an organizer, topic or city — the candidates for "related". */
  async relatedCandidates(target: EventSummary, now: Date): Promise<EventSummary[]> {
    return this.select(
      (sql) => {
        sql.and(`o.id <> ${sql.param(target.id)}`);
        sql.and(`(
          o.organizer_id = ${sql.param(target.organizer?.id ?? '')}
          or o.city_id = ${sql.param(target.cityId)}
          or exists (select 1 from occurrence_technologies t where t.occurrence_id = o.id and t.technology_id = any(${sql.param(target.technologyIds)}::text[]))
          or exists (select 1 from occurrence_categories t where t.occurrence_id = o.id and t.category_id = any(${sql.param(target.categoryIds)}::text[]))
        )`);
      },
      'o.start_at asc',
      200,
      now,
    );
  }

  /** Events within `radiusKm` of a point (venue position, or the city centre when unknown). */
  async nearby(lat: number, lng: number, radiusKm: number, limit: number, now: Date): Promise<EventSummary[]> {
    const sql = new Sql();
    visible(sql);
    sql.and(`o.end_at >= ${sql.param(now)}`);
    // Online events have no place to be near.
    sql.and(`o.attendance_mode <> 'online'`);
    const pLat = sql.param(lat);
    const pLng = sql.param(lng);
    const latExpr = 'coalesce(v.latitude, c.latitude)';
    const lngExpr = 'coalesce(v.longitude, c.longitude)';
    const distance = `(6371 * acos(least(1, cos(radians(${pLat})) * cos(radians(${latExpr})) * cos(radians(${lngExpr}) - radians(${pLng})) + sin(radians(${pLat})) * sin(radians(${latExpr})))))`;
    // Cheap bounding box first, exact great-circle distance second.
    const degLat = radiusKm / 111;
    const degLng = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
    sql.and(`${latExpr} between ${sql.param(lat - degLat)} and ${sql.param(lat + degLat)}`);
    sql.and(`${lngExpr} between ${sql.param(lng - degLng)} and ${sql.param(lng + degLng)}`);
    sql.and(`${distance} <= ${sql.param(radiusKm)}`);
    const rows = await this.db.query<SummaryRow>(
      `select ${SUMMARY_COLUMNS}, ${distance} as distance_km ${SUMMARY_FROM} ${sql.whereClause()} order by distance_km asc, o.start_at asc limit ${sql.param(limit)}`,
      sql.params,
    );
    return rows.map(toSummary);
  }

  /** Incremental refresh (spec §61): what changed since a moment, including removals. */
  async changesSince(since: Date, limit = 500): Promise<{ updated: EventSummary[]; removedIds: string[] }> {
    const rows = await this.db.query<SummaryRow>(
      `select ${SUMMARY_COLUMNS} ${SUMMARY_FROM}
       where o.updated_at > $1 and o.verification_status = 'verified' and o.deleted_at is null
       order by o.updated_at asc limit $2`,
      [since, limit],
    );
    const removed = await this.db.query<{ id: string }>(
      `select id from event_occurrences where (deleted_at > $1) or (verification_status = 'rejected' and updated_at > $1) limit $2`,
      [since, limit],
    );
    return { updated: rows.map(toSummary), removedIds: removed.map((r) => r.id) };
  }

  async cityCounts(now: Date): Promise<{ cityId: string; count: number }[]> {
    return this.db.query<{ cityId: string; count: number }>(
      `select o.city_id as "cityId", count(*)::int as count from event_occurrences o
       where o.verification_status = 'verified' and o.deleted_at is null and o.end_at >= $1
       group by o.city_id order by count desc`,
      [now],
    );
  }

  /** Every event (past and upcoming) linked to an organizer, speaker or exhibitor. */
  async byLink(link: 'organizer' | 'speaker' | 'exhibitor', id: string): Promise<EventSummary[]> {
    const condition = {
      organizer: 'o.organizer_id = $1',
      speaker: 'exists (select 1 from occurrence_speakers s where s.occurrence_id = o.id and s.speaker_id = $1)',
      exhibitor: 'exists (select 1 from occurrence_exhibitors x where x.occurrence_id = o.id and x.exhibitor_id = $1)',
    }[link];
    const rows = await this.db.query<SummaryRow>(
      `select ${SUMMARY_COLUMNS} ${SUMMARY_FROM}
       where ${condition} and o.verification_status = 'verified' and o.deleted_at is null
       order by o.start_at asc limit 200`,
      [id],
    );
    return rows.map(toSummary);
  }
}

export type { Sql };
