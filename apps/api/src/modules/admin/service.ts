import { randomUUID } from 'node:crypto';
import type {
  AdminCreateEvent,
  AdminEvent,
  AdminEventPatch,
  AdminOverview,
  ConflictItem,
  ConflictValue,
  Coverage,
  DuplicatePair,
  EventDetail,
  MergeChoice,
  ReviewItem,
  SourceInfo,
  SyncInfo,
} from '@eii/shared';
import { ZONES, zoneOfState } from '@eii/shared';
import type { Db } from '../../db/client';
import { importFromUrl, MANUAL_SOURCE } from '../../ingestion/importUrl';
import { mergeEvent, newEventId, type OverridableField } from '../../ingestion/merge';
import { normalize } from '../../ingestion/normalize';
import type { SyncScheduler } from '../../jobs/syncScheduler';
import { HttpError, notFound } from '../../lib/http';
import type { EventRepository } from '../events/repository';
import { upsertEvent } from '../events/writer';
import { exportBackup } from './backup';

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

/** Which protected field each edit touches (field_overrides keys; see ingestion/merge.ts). */
const OVERRIDE_FOR: Record<keyof AdminEventPatch, OverridableField | undefined> = {
  title: 'title',
  description: 'description',
  eventType: 'eventType',
  startAt: 'startAt',
  endAt: 'endAt',
  allDay: 'startAt',
  cityId: 'city',
  venueName: 'venue',
  venueAddress: 'venue',
  attendanceMode: undefined,
  status: 'status',
  registrationUrl: 'registrationUrl',
  officialWebsite: 'officialWebsite',
  priceMin: 'price',
};

const firstSentence = (text: string | undefined) => text?.split('\n')[0]?.match(/^.{20,240}?[.!?](\s|$)/)?.[0]?.trim() ?? text?.split('\n')[0];

/**
 * Admin and researcher tools (docs/DEVELOPMENT_PLAN.md Phase 8): the review queue, edits that
 * syncs won't undo, adding events, merging duplicates, source conflicts, sync and sources.
 * Every action goes to the audit log.
 */
export class AdminService {
  constructor(
    private readonly db: Db,
    private readonly repo: EventRepository,
    private readonly sync: SyncScheduler,
  ) {}

  private async audit(actorId: string, action: string, entity: string, entityId: string, detail?: object) {
    await this.db.query(`insert into audit_log (actor_id, action, entity, entity_id, detail) values ($1, $2, $3, $4, $5)`, [
      actorId,
      action,
      entity,
      entityId,
      detail ? JSON.stringify(detail) : null,
    ]);
  }

  private async load(id: string): Promise<EventDetail> {
    const event = await this.repo.get(id, true);
    if (!event) throw notFound('Event');
    return event;
  }

  async overview(): Promise<AdminOverview> {
    const [row] = await this.db.query<{ review: number; duplicates: number; conflicts: number; failing: number }>(
      `select
         (select count(*)::int from event_occurrences where verification_status = 'needs_verification' and deleted_at is null and end_at > now()) as review,
         (select count(*)::int from duplicate_candidates d join event_occurrences a on a.id = d.occurrence_a join event_occurrences b on b.id = d.occurrence_b
            where d.status = 'open' and a.deleted_at is null and b.deleted_at is null) as duplicates,
         (select count(*)::int from source_conflicts c join event_occurrences o on o.id = c.occurrence_id where c.resolved_at is null and o.deleted_at is null) as conflicts,
         (select count(*)::int from sources where enabled and health = 'failed') as failing`,
    );
    const [last] = await this.db.query<{ completed_at: Date | null; status: string }>(`select completed_at, status from sync_runs where status <> 'running' order by started_at desc limit 1`);
    return {
      review: row!.review,
      duplicates: row!.duplicates,
      conflicts: row!.conflicts,
      failingSources: row!.failing,
      lastSyncAt: iso(last?.completed_at ?? null),
      lastSyncStatus: last?.status ?? null,
    };
  }

  // ── Review queue ────────────────────────────────────────────────────────

  async reviewQueue(): Promise<ReviewItem[]> {
    const rows = await this.db.query<{ id: string; source_name: string | null; source_url: string | null; candidate_id: string | null; other_id: string | null; score: number | null }>(
      `select o.id, s.name as source_name, os.source_url, d.id as candidate_id, d.occurrence_a as other_id, d.score
       from event_occurrences o
       left join sources s on s.id = o.primary_source_id
       left join occurrence_sources os on os.occurrence_id = o.id and os.source_id = o.primary_source_id
       left join duplicate_candidates d on d.occurrence_b = o.id and d.status = 'open'
       where o.verification_status = 'needs_verification' and o.deleted_at is null and o.end_at > now()
       order by o.start_at`,
    );
    const ids = [...new Set(rows.flatMap((r) => [r.id, r.other_id].filter((x): x is string => Boolean(x))))];
    const summaries = new Map((await this.repo.byIds(ids)).map((e) => [e.id, e]));
    return rows
      .filter((r) => summaries.has(r.id))
      .map((r) => ({
        event: summaries.get(r.id)!,
        reason: r.candidate_id ? ('possible_duplicate' as const) : ('unverified_source' as const),
        sourceName: r.source_name,
        sourceUrl: r.source_url,
        duplicate: r.candidate_id && r.other_id && summaries.has(r.other_id) ? { candidateId: r.candidate_id, score: Number(r.score), event: summaries.get(r.other_id)! } : undefined,
      }));
  }

  /** Approve: everyone sees it on their next refresh. A pending "possible duplicate" is closed as not a duplicate. */
  async verify(actorId: string, id: string): Promise<void> {
    await this.load(id);
    await this.db.query(`update event_occurrences set verification_status = 'verified', last_verified_at = now(), updated_at = now() where id = $1`, [id]);
    await this.db.query(`update duplicate_candidates set status = 'dismissed' where occurrence_b = $1 and status = 'open'`, [id]);
    await this.audit(actorId, 'event_verified', 'event', id);
  }

  /** Reject: hidden from everyone (kept for history; syncs won't bring it back). */
  async reject(actorId: string, id: string): Promise<void> {
    await this.load(id);
    await this.db.query(`update event_occurrences set verification_status = 'rejected', deleted_at = now() where id = $1`, [id]);
    await this.db.query(`update duplicate_candidates set status = 'dismissed' where (occurrence_a = $1 or occurrence_b = $1) and status = 'open'`, [id]);
    await this.audit(actorId, 'event_rejected', 'event', id);
  }

  // ── Edit and add ────────────────────────────────────────────────────────

  async event(id: string): Promise<AdminEvent> {
    const event = await this.load(id);
    const overrides = await this.db.query<{ field: string; edited_by: string | null; edited_at: Date }>(
      `select f.field, u.name as edited_by, f.edited_at from field_overrides f left join users u on u.id = f.edited_by where f.occurrence_id = $1 order by f.field`,
      [id],
    );
    const sources = await this.db.query<{ id: string; name: string; source_url: string | null; last_checked_at: Date | null }>(
      `select s.id, s.name, os.source_url, os.last_checked_at from occurrence_sources os join sources s on s.id = os.source_id where os.occurrence_id = $1 order by s.priority desc`,
      [id],
    );
    return {
      event,
      overrides: overrides.map((o) => ({ field: o.field, editedBy: o.edited_by, editedAt: iso(o.edited_at)! })),
      sources: sources.map((s) => ({ id: s.id, name: s.name, url: s.source_url, lastCheckedAt: iso(s.last_checked_at) })),
      deleted: false,
    };
  }

  private async applyPatch(existing: EventDetail, patch: AdminEventPatch): Promise<EventDetail> {
    const next: EventDetail = { ...existing };
    if (patch.title) next.title = patch.title;
    if (patch.description !== undefined) {
      next.description = patch.description ?? undefined;
      next.summary = firstSentence(patch.description ?? undefined);
    }
    if (patch.eventType) next.eventType = patch.eventType;
    if (patch.startAt) next.startAt = new Date(patch.startAt).toISOString();
    if (patch.endAt) next.endAt = new Date(patch.endAt).toISOString();
    if (patch.allDay !== undefined) next.allDay = patch.allDay;
    if (new Date(next.endAt) < new Date(next.startAt)) throw new HttpError(400, 'invalid_request', 'The end must be after the start.');
    if (patch.cityId && patch.cityId !== existing.cityId) {
      const [city] = await this.db.query<{ id: string; name: string; state: string }>('select id, name, state from cities where id = $1', [patch.cityId]);
      if (!city) throw new HttpError(400, 'invalid_request', 'Unknown city');
      Object.assign(next, { cityId: city.id, city: city.name, state: city.state });
    }
    if (patch.venueName !== undefined || patch.venueAddress !== undefined) {
      const name = patch.venueName === undefined ? existing.venueName : (patch.venueName ?? undefined);
      const address = patch.venueAddress === undefined ? existing.venue?.address : (patch.venueAddress ?? undefined);
      const sameVenue = name === existing.venueName;
      next.venueName = name;
      next.venue = name ? { name, address, latitude: sameVenue ? existing.venue?.latitude : undefined, longitude: sameVenue ? existing.venue?.longitude : undefined } : undefined;
    }
    if (patch.attendanceMode) next.attendanceMode = patch.attendanceMode;
    if (patch.status) next.status = patch.status;
    if (patch.registrationUrl !== undefined) next.registrationUrl = patch.registrationUrl ?? undefined;
    if (patch.officialWebsite !== undefined) next.officialWebsite = patch.officialWebsite ?? undefined;
    if (patch.priceMin !== undefined) next.price = patch.priceMin === null ? undefined : { min: patch.priceMin, currency: 'INR' };
    return next;
  }

  /**
   * Edits an event. Changes are recorded (followers are alerted after the next sync, like any
   * change) and each edited field is protected: later syncs keep the team's value.
   */
  async edit(actorId: string, id: string, patch: AdminEventPatch, now = new Date()): Promise<AdminEvent> {
    const existing = await this.load(id);
    const edited = await this.applyPatch(existing, patch);
    const { merged } = mergeEvent({ existing, incoming: edited, incomingWins: true, overrides: new Set(), now });
    // mergeEvent keeps existing values when the new one is empty; clearing a field is deliberate here.
    for (const key of ['description', 'summary', 'venue', 'venueName', 'registrationUrl', 'officialWebsite', 'price'] as const) {
      if (edited[key] === undefined) (merged as Record<string, unknown>)[key] = undefined;
    }
    merged.updatedAt = now.toISOString();
    await upsertEvent(this.db, merged, MANUAL_SOURCE.id);
    const fields = [...new Set(Object.keys(patch).map((k) => OVERRIDE_FOR[k as keyof AdminEventPatch]).filter((f): f is OverridableField => Boolean(f)))];
    for (const field of fields) {
      await this.db.query(
        `insert into field_overrides (occurrence_id, field, value, edited_by, edited_at) values ($1, $2, $3, $4, $5)
         on conflict (occurrence_id, field) do update set value = excluded.value, edited_by = excluded.edited_by, edited_at = excluded.edited_at`,
        [id, field, JSON.stringify(patch), actorId, now],
      );
    }
    await this.audit(actorId, 'event_edited', 'event', id, { fields: Object.keys(patch) });
    return this.event(id);
  }

  /** Lets syncs update a field again. */
  async clearOverride(actorId: string, id: string, field: string): Promise<AdminEvent> {
    await this.db.query('delete from field_overrides where occurrence_id = $1 and field = $2', [id, field]);
    await this.audit(actorId, 'override_removed', 'event', id, { field });
    return this.event(id);
  }

  /** "Add by URL": what the page says, ready to save or to complete by hand. */
  importUrl(url: string) {
    return importFromUrl(url);
  }

  async create(actorId: string, input: AdminCreateEvent, now = new Date()): Promise<string> {
    const [city] = await this.db.query<{ name: string }>('select name from cities where id = $1', [input.cityId]);
    if (!city) throw new HttpError(400, 'invalid_request', 'Unknown city');
    const sourceEventId = `manual:${randomUUID()}`;
    const istDate = (s: string) => new Date(new Date(s).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const result = normalize(
      {
        sourceEventId,
        sourceUrl: input.sourceUrl,
        title: input.title,
        description: input.description ?? undefined,
        start: input.allDay ? istDate(input.startAt) : input.startAt,
        end: input.allDay ? istDate(input.endAt) : input.endAt,
        city: city.name,
        venueName: input.venueName ?? undefined,
        address: input.venueAddress ?? undefined,
        attendanceMode: input.attendanceMode,
        status: input.status,
        registrationUrl: input.registrationUrl ?? undefined,
        officialUrl: input.officialWebsite ?? input.sourceUrl,
        priceMin: input.priceMin ?? undefined,
        isFree: input.priceMin === 0,
        imageUrl: input.imageUrl,
        typeHint: input.eventType,
        raw: { addedBy: actorId },
      },
      MANUAL_SOURCE,
      now,
    );
    if (!result.ok) throw new HttpError(400, 'invalid_request', result.reason === 'past' ? 'That event has already ended.' : `The event can’t be added (${result.reason}).`);
    const event = { ...result.event, id: newEventId(MANUAL_SOURCE.id, sourceEventId), eventType: input.eventType ?? result.event.eventType, verificationStatus: 'verified' as const };
    await upsertEvent(this.db, event, MANUAL_SOURCE.id);
    await this.db.query('update event_occurrences set primary_source_id = $2 where id = $1', [event.id, MANUAL_SOURCE.id]);
    await this.audit(actorId, 'event_created', 'event', event.id, { title: event.title });
    return event.id;
  }

  // ── Duplicates ──────────────────────────────────────────────────────────

  async duplicates(): Promise<DuplicatePair[]> {
    const rows = await this.db.query<{ id: string; score: number; a: string; b: string }>(
      `select d.id, d.score, d.occurrence_a as a, d.occurrence_b as b from duplicate_candidates d
       join event_occurrences x on x.id = d.occurrence_a join event_occurrences y on y.id = d.occurrence_b
       where d.status = 'open' and x.deleted_at is null and y.deleted_at is null order by d.score desc, d.created_at`,
    );
    const pairs: DuplicatePair[] = [];
    for (const r of rows) {
      const [a, b] = await Promise.all([this.repo.get(r.a, true), this.repo.get(r.b, true)]);
      if (a && b) pairs.push({ id: r.id, score: Number(r.score), a, b });
    }
    return pairs;
  }

  /**
   * Merges a duplicate into the event kept: its sources, and everyone's saves, follows, plans,
   * notes, checklists and reminders move over. The other event stays hidden, for history.
   */
  async merge(actorId: string, candidateId: string, choice: MergeChoice): Promise<string> {
    const [pair] = await this.db.query<{ a: string; b: string }>(`select occurrence_a as a, occurrence_b as b from duplicate_candidates where id = $1 and status = 'open'`, [candidateId]);
    if (!pair) throw notFound('Duplicate');
    const keep = choice.keep === 'a' ? pair.a : pair.b;
    const drop = choice.keep === 'a' ? pair.b : pair.a;
    const [kept, dropped] = await Promise.all([this.load(keep), this.load(drop)]);

    await this.db.transaction(async (tx) => {
      const p = [keep, drop];
      // Tracking: rows only on the dropped event move; rows on both are combined.
      await tx.query(
        `update user_event_tracking w set saved = w.saved or l.saved, following = w.following or l.following, status = coalesce(w.status, l.status),
           visit_date = coalesce(w.visit_date, l.visit_date), travel_notes = coalesce(w.travel_notes, l.travel_notes), visited_at = coalesce(w.visited_at, l.visited_at),
           field_at = l.field_at || w.field_at, updated_at = now()
         from user_event_tracking l where l.occurrence_id = $2 and w.occurrence_id = $1 and w.user_id = l.user_id`,
        p,
      );
      await tx.query(`update user_event_tracking t set occurrence_id = $1 where occurrence_id = $2 and not exists (select 1 from user_event_tracking x where x.user_id = t.user_id and x.occurrence_id = $1)`, p);
      await tx.query('delete from user_event_tracking where occurrence_id = $1', [drop]);
      // Notes: both kept, one after the other.
      await tx.query(
        `update event_notes w set body = w.body || E'\\n\\n' || l.body, updated_at = greatest(w.updated_at, l.updated_at)
         from event_notes l where l.occurrence_id = $2 and w.occurrence_id = $1 and w.user_id = l.user_id`,
        p,
      );
      await tx.query(`update event_notes n set occurrence_id = $1 where occurrence_id = $2 and not exists (select 1 from event_notes x where x.user_id = n.user_id and x.occurrence_id = $1)`, p);
      await tx.query('delete from event_notes where occurrence_id = $1', [drop]);
      // Checklists: union; a tick on either counts.
      await tx.query(
        `insert into checklist_items (user_id, occurrence_id, item_id, label, is_default, done, sort, deleted, updated_at)
         select user_id, $1, item_id, label, is_default, done, sort, deleted, updated_at from checklist_items where occurrence_id = $2
         on conflict (user_id, occurrence_id, item_id) do update set done = checklist_items.done or excluded.done`,
        p,
      );
      await tx.query('delete from checklist_items where occurrence_id = $1', [drop]);
      // Reminders.
      await tx.query(
        `update reminders r set occurrence_id = $1 where occurrence_id = $2
           and not exists (select 1 from reminders x where x.user_id = r.user_id and x.occurrence_id = $1 and x.offset_minutes = r.offset_minutes)`,
        p,
      );
      await tx.query('delete from reminders where occurrence_id = $1', [drop]);
      // Sources: future syncs find the kept event.
      await tx.query('update source_records set occurrence_id = $1 where occurrence_id = $2', p);
      await tx.query(
        `insert into occurrence_sources (occurrence_id, source_id, source_url, last_checked_at)
         select $1, source_id, source_url, last_checked_at from occurrence_sources where occurrence_id = $2 on conflict do nothing`,
        p,
      );
      await tx.query('update notifications set occurrence_id = $1 where occurrence_id = $2', p);
      await tx.query(`delete from source_conflicts where occurrence_id = $1 and resolved_at is null`, [drop]);
      await tx.query(`update event_occurrences set deleted_at = now(), merged_into = $1 where id = $2`, p);
      await tx.query(`update duplicate_candidates set status = 'merged' where id = $1`, [candidateId]);
      await tx.query(`update duplicate_candidates set status = 'dismissed' where status = 'open' and (occurrence_a = $1 or occurrence_b = $1)`, [drop]);
      await tx.query(`update event_occurrences set verification_status = 'verified', last_verified_at = now() where id = $1`, [keep]);
    });

    // Values taken from the other event become protected edits on the kept one.
    const other = dropped;
    const patch: AdminEventPatch = {};
    const take = choice.take;
    const fromOther = (field: keyof MergeChoice['take']) => take[field] !== undefined && take[field] !== choice.keep;
    if (fromOther('title')) patch.title = other.title;
    if (fromOther('dates')) Object.assign(patch, { startAt: other.startAt, endAt: other.endAt, allDay: other.allDay });
    if (fromOther('venue')) Object.assign(patch, { cityId: other.cityId, venueName: other.venueName ?? null, venueAddress: other.venue?.address ?? null });
    if (fromOther('officialWebsite')) patch.officialWebsite = other.officialWebsite ?? null;
    if (Object.keys(patch).length) await this.edit(actorId, keep, patch);
    await this.audit(actorId, 'events_merged', 'event', keep, { merged: drop, title: kept.title });
    return keep;
  }

  /** Not the same event: both stay, and the pending one is approved. */
  async dismissDuplicate(actorId: string, candidateId: string): Promise<void> {
    const [pair] = await this.db.query<{ b: string }>(`update duplicate_candidates set status = 'dismissed' where id = $1 and status = 'open' returning occurrence_b as b`, [candidateId]);
    if (!pair) throw notFound('Duplicate');
    await this.db.query(`update event_occurrences set verification_status = 'verified', last_verified_at = now() where id = $1 and verification_status = 'needs_verification'`, [pair.b]);
    await this.audit(actorId, 'duplicate_dismissed', 'event', pair.b, { candidateId });
  }

  // ── Source conflicts ────────────────────────────────────────────────────

  async conflicts(): Promise<ConflictItem[]> {
    const rows = await this.db.query<{ id: string; occurrence_id: string; field: 'date' | 'venue'; values_json: ConflictValue[]; created_at: Date }>(
      `select c.id, c.occurrence_id, c.field, c.values_json, c.created_at from source_conflicts c join event_occurrences o on o.id = c.occurrence_id
       where c.resolved_at is null and o.deleted_at is null order by c.created_at desc`,
    );
    const events = new Map((await this.repo.byIds(rows.map((r) => r.occurrence_id))).map((e) => [e.id, e]));
    return rows
      .filter((r) => events.has(r.occurrence_id))
      .map((r) => ({ id: r.id, field: r.field, event: events.get(r.occurrence_id)!, values: r.values_json, createdAt: iso(r.created_at)! }));
  }

  /** Picks the correct value: applied as a protected edit, so sources can't flip it back. */
  async resolveConflict(actorId: string, id: string, index: number): Promise<void> {
    const [row] = await this.db.query<{ occurrence_id: string; values_json: ConflictValue[] }>(`select occurrence_id, values_json from source_conflicts where id = $1 and resolved_at is null`, [id]);
    const value = row?.values_json[index];
    if (!row || !value) throw notFound('Conflict');
    await this.edit(actorId, row.occurrence_id, value.patch);
    await this.db.query('update source_conflicts set resolved_by = $2, resolved_at = now() where id = $1', [id, actorId]);
  }

  // ── Sync and sources ────────────────────────────────────────────────────

  async syncInfo(): Promise<SyncInfo> {
    const runs = await this.db.query<{ id: string; started_at: Date; completed_at: Date | null; status: string; fetched: number; created: number; updated: number; unchanged: number; duplicates: number; skipped: number }>(
      `select id, started_at, completed_at, status, fetched, created, updated, unchanged, duplicates, skipped from sync_runs order by started_at desc limit 10`,
    );
    const perSource = await this.db.query<{ sync_run_id: string; source_id: string; name: string; status: string; fetched: number; error: string | null }>(
      `select r.sync_run_id, r.source_id, s.name, r.status, r.fetched, r.error from sync_run_sources r join sources s on s.id = r.source_id
       where r.sync_run_id = any($1::text[]) order by s.name`,
      [runs.map((r) => r.id)],
    );
    const sources = await this.db.query<{
      id: string;
      name: string;
      kind: string;
      enabled: boolean;
      admin_enabled: boolean | null;
      health: string;
      last_success_at: Date | null;
      last_failure_at: Date | null;
      last_error: string | null;
      events_found: number;
      compliance_note: string | null;
    }>(`select id, name, kind, enabled, admin_enabled, health, last_success_at, last_failure_at, last_error, events_found, compliance_note from sources where kind not in ('demo') and id <> 'manual' order by enabled desc, name`);
    return {
      coverage: await this.coverage(),
      running: this.sync.isRunning,
      nextSyncAt: iso(this.sync.nextAt),
      runs: runs.map((r) => ({
        id: r.id,
        startedAt: iso(r.started_at)!,
        completedAt: iso(r.completed_at),
        status: r.status,
        fetched: r.fetched,
        created: r.created,
        updated: r.updated,
        unchanged: r.unchanged,
        duplicates: r.duplicates,
        skipped: r.skipped,
        sources: perSource.filter((s) => s.sync_run_id === r.id).map((s) => ({ sourceId: s.source_id, sourceName: s.name, status: s.status, fetched: s.fetched, error: s.error })),
      })),
      sources: sources.map(
        (s): SourceInfo => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          enabled: s.enabled,
          adminEnabled: s.admin_enabled,
          health: s.health,
          lastSuccessAt: iso(s.last_success_at),
          lastFailureAt: iso(s.last_failure_at),
          lastError: s.last_error,
          eventsFound: s.events_found,
          compliance: s.compliance_note,
        }),
      ),
    };
  }

  /** Upcoming events everyone can see, by zone (from the city's state) and online. */
  private async coverage(): Promise<Coverage> {
    const rows = await this.db.query<{ state: string | null; online: boolean; n: number }>(
      `select c.state, o.attendance_mode = 'online' as online, count(*)::int as n
       from event_occurrences o join cities c on c.id = o.city_id
       where o.verification_status = 'verified' and o.deleted_at is null and o.merged_into is null and not o.is_demo and o.end_at >= now()
       group by 1, 2`,
    );
    const zones = ZONES.map((z) => ({ id: z.id as string, name: z.name as string, upcoming: 0 }));
    let online = 0;
    for (const r of rows) {
      if (r.online) {
        online += r.n;
        continue;
      }
      const zone = zones.find((z) => z.id === zoneOfState(r.state ?? undefined)?.id);
      if (zone) zone.upcoming += r.n;
    }
    return { zones, online };
  }

  async runSyncNow(actorId: string): Promise<boolean> {
    const started = this.sync.start();
    if (started) await this.audit(actorId, 'sync_started', 'sync', 'manual');
    return started;
  }

  /** On, off, or back to the server setting (null). Survives restarts. */
  async backup(actorId: string) {
    const backup = await exportBackup(this.db, this.repo);
    await this.audit(actorId, 'backup_downloaded', 'backup', backup.createdAt);
    return backup;
  }

  async setSourceEnabled(actorId: string, id: string, enabled: boolean | null): Promise<void> {
    const [row] = await this.db.query<{ id: string }>(
      `update sources set admin_enabled = $2, enabled = coalesce($2, enabled) where id = $1 and kind <> 'demo' and id <> 'manual' returning id`,
      [id, enabled],
    );
    if (!row) throw notFound('Source');
    await this.audit(actorId, enabled === null ? 'source_reset' : enabled ? 'source_enabled' : 'source_disabled', 'source', id);
  }
}
