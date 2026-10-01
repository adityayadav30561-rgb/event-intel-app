import { randomUUID } from 'node:crypto';
import type { EventDetail } from '@eii/shared';
import type { Db } from '../db/client';
import { EventRepository } from '../modules/events/repository';
import { upsertEvent } from '../modules/events/writer';
import { ADAPTERS } from './adapters';
import { createFetcher } from './fetcher';
import { findMatch, mergeEvent, newEventId } from './merge';
import { normalize, type SkipReason } from './normalize';
import { FetchError, type Fetcher, type RawEvent, type SourceAdapter, type SourceRow } from './types';

/**
 * The 12-hour sync (spec §60–62, §105–107; plan Phase 3):
 * fetch → store raw → normalise → classify → dedupe → merge (respecting overrides and source
 * priority) → detect changes → save. One failing source never stops the others, and running the
 * same sync twice creates nothing new.
 */

export type SyncSummary = {
  runId: string;
  status: 'success' | 'partial_success' | 'failed' | 'skipped';
  sourcesProcessed: number;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  cancelled: number;
  postponed: number;
  duplicates: number;
  skipped: number;
  skipReasons: Partial<Record<SkipReason, number>>;
  errors: { sourceId: string; message: string }[];
};

type Options = {
  now?: Date;
  fetcher?: Fetcher;
  adapters?: Record<string, SourceAdapter>;
  /** Only these sources (manual runs / tests). */
  sourceIds?: string[];
  /** Read and report, but write nothing. */
  dryRun?: boolean;
  /** Retry delays for a failing source; three attempts in total by default. */
  retryDelaysMs?: number[];
};

const LOCK_KEY = 'sync_lock';
const LOCK_STALE_MS = 60 * 60_000;

/** A row-based lock that works across pooled connections; stale locks (crashed runs) expire. */
async function acquireLock(db: Db, now: Date): Promise<boolean> {
  const rows = await db.query<{ key: string }>(
    `insert into app_state (key, value, updated_at) values ($1, $2, $3)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
       where app_state.updated_at < $4
     returning key`,
    [LOCK_KEY, JSON.stringify({ pid: process.pid }), now, new Date(now.getTime() - LOCK_STALE_MS)],
  );
  return rows.length > 0;
}

async function readWithRetries(adapter: SourceAdapter, source: SourceRow, fetcher: Fetcher, delays: number[]): Promise<RawEvent[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await adapter.read(source, fetcher);
    } catch (error) {
      lastError = error;
      if (error instanceof FetchError && !error.retryable) break;
      if (attempt < delays.length) await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastError;
}

export async function runEventSync(db: Db, options: Options = {}): Promise<SyncSummary> {
  const now = options.now ?? new Date();
  const runId = `sync_${randomUUID()}`;
  const summary: SyncSummary = {
    runId,
    status: 'success',
    sourcesProcessed: 0,
    fetched: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    cancelled: 0,
    postponed: 0,
    duplicates: 0,
    skipped: 0,
    skipReasons: {},
    errors: [],
  };

  const sources = await db.query<SourceRow>(
    `select id, name, adapter, kind, config, priority, enabled, trusted, last_success_at as "lastSuccessAt" from sources
     where enabled and adapter <> 'demo' ${options.sourceIds ? 'and id = any($1::text[])' : ''} order by priority desc, id`,
    options.sourceIds ? [options.sourceIds] : [],
  );
  // Nothing to read yet: no run record, no lock.
  if (sources.length === 0) return { ...summary, status: 'skipped' };
  if (!options.dryRun && !(await acquireLock(db, now))) return { ...summary, status: 'skipped' };
  const fetcher = options.fetcher ?? createFetcher();
  const adapters = options.adapters ?? ADAPTERS;
  const delays = options.retryDelaysMs ?? [2_000, 8_000];
  const repo = new EventRepository(db);
  const failedSources = new Set<string>();

  try {
    if (!options.dryRun) await db.query('insert into sync_runs (id, started_at) values ($1, $2)', [runId, now]);

    for (const source of sources) {
      summary.sourcesProcessed++;
      const adapter = adapters[source.adapter];
      let raws: RawEvent[] = [];
      try {
        if (!adapter) throw new Error(`Unknown adapter "${source.adapter}"`);
        raws = await readWithRetries(adapter, source, fetcher, delays);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push({ sourceId: source.id, message });
        failedSources.add(source.id);
        if (!options.dryRun) {
          await db.query(`update sources set health = 'failed', last_failure_at = $2, last_error = $3 where id = $1`, [source.id, now, message.slice(0, 500)]);
          await db.query(`insert into sync_run_sources (sync_run_id, source_id, status, error, attempts) values ($1, $2, 'failed', $3, $4)`, [runId, source.id, message.slice(0, 500), delays.length + 1]);
        }
        continue;
      }

      summary.fetched += raws.length;
      let kept = 0;
      for (const raw of raws) {
        const result = normalize(raw, source, now);
        if (!result.ok) {
          summary.skipped++;
          summary.skipReasons[result.reason] = (summary.skipReasons[result.reason] ?? 0) + 1;
          continue;
        }
        kept++;
        if (options.dryRun) continue;
        try {
          await db.transaction((tx) => processEvent(tx, repo.withDb(tx), source, raw, result.event, result.hash, result.newCity, now, summary));
        } catch (error) {
          summary.errors.push({ sourceId: source.id, message: `${raw.title}: ${error instanceof Error ? error.message : String(error)}` });
        }
      }

      if (!options.dryRun) {
        // A source that returns nothing usable is "warning", not "healthy": its page may have changed.
        const health = kept > 0 ? 'healthy' : 'warning';
        await db.query(
          `update sources set health = $2, last_success_at = $3, last_error = null, events_found = $4 where id = $1`,
          [source.id, health, now, kept],
        );
        await db.query(`insert into sync_run_sources (sync_run_id, source_id, status, fetched) values ($1, $2, $3, $4)`, [runId, source.id, health === 'healthy' ? 'success' : 'empty', raws.length]);
      }
    }

    // Failed: every source failed. Partial: some sources (or single events) failed.
    summary.status =
      failedSources.size > 0 && failedSources.size === summary.sourcesProcessed ? 'failed' : summary.errors.length ? 'partial_success' : 'success';
    return summary;
  } finally {
    if (!options.dryRun) {
      await db.query(
        `update sync_runs set completed_at = now(), status = $2, sources_processed = $3, fetched = $4, created = $5, updated = $6,
           unchanged = $7, cancelled = $8, postponed = $9, duplicates = $10, skipped = $11, skip_reasons = $12, errors = $13
         where id = $1`,
        [
          runId,
          summary.status === 'skipped' ? 'failed' : summary.status,
          summary.sourcesProcessed,
          summary.fetched,
          summary.created,
          summary.updated,
          summary.unchanged,
          summary.cancelled,
          summary.postponed,
          summary.duplicates,
          summary.skipped,
          JSON.stringify(summary.skipReasons),
          JSON.stringify(summary.errors.slice(0, 50)),
        ],
      );
      await db.query('delete from app_state where key = $1', [LOCK_KEY]);
    }
  }
}

async function processEvent(
  db: Db,
  repo: EventRepository,
  source: SourceRow,
  raw: RawEvent,
  candidate: EventDetail,
  hash: string,
  newCity: { id: string; name: string; state: string } | undefined,
  now: Date,
  summary: SyncSummary,
): Promise<void> {
  if (newCity) {
    await db.query(`insert into cities (id, name, state) values ($1, $2, $3) on conflict (id) do nothing`, [newCity.id, newCity.name, newCity.state]);
  }

  const match = await findMatch(db, source.id, raw.sourceEventId, candidate);
  let occurrenceId: string;

  if (match.kind === 'existing') {
    occurrenceId = match.id;
    // Unchanged at the source: only record that we checked.
    const previous = await db.query<{ content_hash: string }>('select content_hash from source_records where source_id = $1 and source_event_id = $2', [source.id, raw.sourceEventId]);
    const existing = await repo.get(occurrenceId, true);
    if (!existing) throw new Error(`Matched event ${occurrenceId} not found`);
    if (previous[0]?.content_hash === hash && match.via === 'source_record') {
      summary.unchanged++;
      await db.query(
        `insert into occurrence_sources (occurrence_id, source_id, source_url, last_checked_at) values ($1, $2, $3, $4)
         on conflict (occurrence_id, source_id) do update set last_checked_at = excluded.last_checked_at`,
        [occurrenceId, source.id, raw.sourceUrl ?? null, now],
      );
      return;
    }
    const [primary] = await db.query<{ priority: number | null }>(
      'select s.priority from event_occurrences o left join sources s on s.id = o.primary_source_id where o.id = $1',
      [occurrenceId],
    );
    const incomingWins = source.priority >= (primary?.priority ?? -1);
    const overrides = new Set((await db.query<{ field: string }>('select field from field_overrides where occurrence_id = $1', [occurrenceId])).map((r) => r.field));
    const { merged, changed } = mergeEvent({ existing, incoming: { ...candidate, id: occurrenceId }, incomingWins, overrides, now });
    if (match.via !== 'source_record') summary.duplicates++;
    if (changed) {
      await upsertEvent(db, merged, source.id);
      summary.updated++;
      if (merged.status === 'cancelled' && existing.status !== 'cancelled') summary.cancelled++;
      if (merged.status === 'postponed' && existing.status !== 'postponed') summary.postponed++;
    } else {
      summary.unchanged++;
      await db.query(
        `insert into occurrence_sources (occurrence_id, source_id, source_url, last_checked_at) values ($1, $2, $3, $4)
         on conflict (occurrence_id, source_id) do update set last_checked_at = excluded.last_checked_at`,
        [occurrenceId, source.id, raw.sourceUrl ?? null, now],
      );
    }
    if (incomingWins) await db.query('update event_occurrences set primary_source_id = $2 where id = $1', [occurrenceId, source.id]);
  } else {
    occurrenceId = newEventId(source.id, raw.sourceEventId);
    const event = {
      ...candidate,
      id: occurrenceId,
      // A possible duplicate waits for review instead of appearing twice.
      verificationStatus: match.possibleDuplicateOf ? ('needs_verification' as const) : candidate.verificationStatus,
    };
    await upsertEvent(db, event, source.id);
    await db.query('update event_occurrences set primary_source_id = $2 where id = $1', [occurrenceId, source.id]);
    if (match.possibleDuplicateOf) {
      await db.query(
        `insert into duplicate_candidates (id, occurrence_a, occurrence_b, score, signals) values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
        [`dup_${occurrenceId}_${match.possibleDuplicateOf.id}`, match.possibleDuplicateOf.id, occurrenceId, match.possibleDuplicateOf.score, JSON.stringify({ via: 'title_city_date' })],
      );
      summary.duplicates++;
    }
    summary.created++;
  }

  await db.query(
    `insert into source_records (id, source_id, source_event_id, source_url, raw_title, raw_description, raw_date, raw_venue, raw_organizer, raw_image, raw_payload, content_hash, fetched_at, occurrence_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (source_id, source_event_id) do update set
       source_url = excluded.source_url, raw_title = excluded.raw_title, raw_description = excluded.raw_description,
       raw_date = excluded.raw_date, raw_venue = excluded.raw_venue, raw_organizer = excluded.raw_organizer,
       raw_image = excluded.raw_image, raw_payload = excluded.raw_payload, content_hash = excluded.content_hash,
       fetched_at = excluded.fetched_at, occurrence_id = excluded.occurrence_id`,
    [
      `rec_${randomUUID()}`,
      source.id,
      raw.sourceEventId,
      raw.sourceUrl ?? null,
      raw.title,
      raw.description?.slice(0, 5000) ?? null,
      [raw.start, raw.end].filter(Boolean).map(String).join(' → ') || null,
      [raw.venueName, raw.address].filter(Boolean).join(', ') || null,
      raw.organizerName ?? null,
      raw.imageUrl ?? null,
      JSON.stringify(raw.raw ?? null),
      hash,
      now,
      occurrenceId,
    ],
  );
}
