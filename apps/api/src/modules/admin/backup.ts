import { randomBytes } from 'node:crypto';
import type { EventDetail } from '@eii/shared';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { MANUAL_SOURCE } from '../../ingestion/importUrl';
import type { EventRepository } from '../events/repository';
import { upsertEvent } from '../events/writer';

/**
 * Team backup (spec §128). Events from sources come back by running the sync, so a backup holds
 * only what the team made: accounts (never passwords), interests, saves and follows, visit plans,
 * notes, checklists, reminders, saved searches, alert settings, events added by hand, edits that
 * protect a field, review and merge decisions, and source on/off choices.
 *
 * Event ids from sources are derived from the source and its own event id, so they are the same
 * after a fresh sync and rows can be matched back by id.
 */

type Table = {
  name: string;
  columns: string[];
  /** jsonb columns: stored as text in the file and cast back on restore. */
  json?: string[];
  /** date columns: kept as YYYY-MM-DD so no time zone can shift them. */
  dates?: string[];
  /** Columns holding a user id, rewritten when an account is matched by email. */
  users?: string[];
  /** Rows that belong to one event are kept only when that event exists. */
  event?: boolean;
};

const TABLES: Table[] = [
  { name: 'user_preferences', columns: ['user_id', 'city_ids', 'category_ids', 'technology_ids', 'industry_ids', 'event_types', 'updated_at'], users: ['user_id'] },
  { name: 'notification_settings', columns: ['user_id', 'types', 'quiet_start', 'quiet_end', 'updated_at'], json: ['types'], users: ['user_id'] },
  {
    name: 'user_event_tracking',
    columns: ['user_id', 'occurrence_id', 'saved', 'following', 'status', 'visit_date', 'travel_notes', 'visited_at', 'field_at', 'updated_at'],
    json: ['field_at'],
    dates: ['visit_date'],
    users: ['user_id'],
    event: true,
  },
  { name: 'event_notes', columns: ['user_id', 'occurrence_id', 'body', 'updated_at'], users: ['user_id'], event: true },
  { name: 'checklist_items', columns: ['user_id', 'occurrence_id', 'item_id', 'label', 'is_default', 'done', 'sort', 'deleted', 'updated_at'], users: ['user_id'], event: true },
  { name: 'reminders', columns: ['id', 'user_id', 'occurrence_id', 'offset_minutes', 'sent_at', 'created_at'], users: ['user_id'], event: true },
  { name: 'saved_searches', columns: ['id', 'user_id', 'name', 'query', 'notify', 'last_matched_at', 'created_at', 'updated_at'], json: ['query'], users: ['user_id'] },
  { name: 'field_overrides', columns: ['occurrence_id', 'field', 'value', 'edited_by', 'edited_at'], json: ['value'], users: ['edited_by'], event: true },
];

type Row = Record<string, unknown>;

const backupSchema = z.object({
  format: z.literal('eii-backup'),
  version: z.literal(1),
  createdAt: z.string(),
  users: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.string(), is_active: z.boolean(), onboarded_at: z.string().nullable(), created_at: z.string() })),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  manualEvents: z.array(z.record(z.string(), z.unknown())),
  decisions: z.array(z.object({ id: z.string(), verification_status: z.string().nullable(), merged_into: z.string().nullable(), deleted_at: z.string().nullable() })),
  sources: z.array(z.object({ id: z.string(), admin_enabled: z.boolean() })),
});
export type Backup = z.infer<typeof backupSchema>;

export type RestoreReport = {
  /** Accounts that did not exist: they can't sign in until the admin resets their password in Team. */
  createdUsers: string[];
  restored: Record<string, number>;
  /** Rows whose event isn't in this database yet; run the sync, then restore again. */
  skipped: Record<string, number>;
  manualEvents: number;
  decisions: number;
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

export async function exportBackup(db: Db, repo: EventRepository, now = new Date()): Promise<Backup> {
  const users = await db.query<Backup['users'][number]>(
    `select id, name, email, role, is_active, onboarded_at, created_at from users order by created_at`,
  );
  const tables: Backup['tables'] = {};
  for (const t of TABLES) {
    const select = t.columns.map((c) => (t.json?.includes(c) ? `${c}::text as ${c}` : t.dates?.includes(c) ? `${c}::text as ${c}` : c)).join(', ');
    const rows = await db.query<Row>(`select ${select} from ${t.name}`);
    tables[t.name] = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, iso(v)])));
  }
  const manualIds = await db.query<{ id: string }>(`select id from event_occurrences where primary_source_id = $1 and deleted_at is null order by created_at`, [MANUAL_SOURCE.id]);
  const manualEvents: Row[] = [];
  for (const { id } of manualIds) {
    const event = await repo.get(id, true);
    if (event) manualEvents.push(event as unknown as Row);
  }
  const decisions = await db.query<Backup['decisions'][number]>(
    `select id, verification_status, merged_into, deleted_at from event_occurrences
     where merged_into is not null or verification_status in ('verified', 'rejected')`,
  );
  const sources = await db.query<Backup['sources'][number]>(`select id, admin_enabled from sources where admin_enabled is not null`);
  return {
    format: 'eii-backup',
    version: 1,
    createdAt: now.toISOString(),
    users: users.map((u) => ({ ...u, onboarded_at: iso(u.onboarded_at) as string | null, created_at: iso(u.created_at) as string })),
    tables,
    manualEvents,
    decisions: decisions.map((d) => ({ ...d, deleted_at: iso(d.deleted_at) as string | null })),
    sources,
  };
}

export function parseBackup(input: unknown): Backup {
  const result = backupSchema.safeParse(input);
  if (!result.success) throw new Error('This file is not an Event Intelligence India backup.');
  return result.data;
}

/**
 * Puts a backup back. Nothing already in the database is overwritten, so restoring twice, or into
 * a database that has been used since, is safe. Run migrations and a sync first.
 */
export async function restoreBackup(db: Db, input: unknown): Promise<RestoreReport> {
  const backup = parseBackup(input);
  return db.transaction(async (tx) => {
    const report: RestoreReport = { createdUsers: [], restored: {}, skipped: {}, manualEvents: 0, decisions: 0 };

    // Accounts are matched by email; a missing one is created with no usable password.
    const userIds = new Map<string, string>();
    for (const u of backup.users) {
      const [existing] = await tx.query<{ id: string }>('select id from users where lower(email) = lower($1)', [u.email]);
      if (existing) {
        userIds.set(u.id, existing.id);
        continue;
      }
      await tx.query(
        `insert into users (id, name, email, password_hash, role, is_active, must_change_password, onboarded_at, created_at)
         values ($1, $2, $3, $4, $5, $6, true, $7, $8)`,
        [u.id, u.name, u.email, `disabled$${randomBytes(16).toString('hex')}`, u.role, u.is_active, u.onboarded_at, u.created_at],
      );
      userIds.set(u.id, u.id);
      report.createdUsers.push(u.email);
    }

    for (const raw of backup.manualEvents) {
      const event = raw as unknown as EventDetail;
      const [exists] = await tx.query('select 1 from event_occurrences where id = $1', [event.id]);
      if (exists) continue;
      await upsertEvent(tx, event, MANUAL_SOURCE.id);
      await tx.query(`update event_occurrences set primary_source_id = $2, verification_status = 'verified' where id = $1`, [event.id, MANUAL_SOURCE.id]);
      report.manualEvents += 1;
    }

    const known = new Set((await tx.query<{ id: string }>('select id from event_occurrences')).map((r) => r.id));

    for (const t of TABLES) {
      const rows = backup.tables[t.name] ?? [];
      let restored = 0;
      let skipped = 0;
      for (const row of rows) {
        if (t.event && !known.has(String(row.occurrence_id))) {
          skipped += 1;
          continue;
        }
        const mapped = { ...row };
        for (const c of t.users ?? []) if (mapped[c] != null) mapped[c] = userIds.get(String(mapped[c])) ?? null;
        if (t.users?.includes('user_id') && !mapped.user_id) {
          skipped += 1;
          continue;
        }
        const values = t.columns.map((c) => mapped[c] ?? null);
        const params = t.columns.map((c, i) => (t.json?.includes(c) ? `$${i + 1}::jsonb` : t.dates?.includes(c) ? `$${i + 1}::date` : `$${i + 1}`));
        const inserted = await tx.query(
          `insert into ${t.name} (${t.columns.join(', ')}) values (${params.join(', ')}) on conflict do nothing returning 1`,
          values,
        );
        restored += inserted.length;
      }
      report.restored[t.name] = restored;
      if (skipped) report.skipped[t.name] = skipped;
    }

    // Review and merge decisions, for events that exist (a merge target must exist too).
    for (const d of backup.decisions) {
      if (!known.has(d.id) || (d.merged_into && !known.has(d.merged_into))) continue;
      await tx.query(
        `update event_occurrences set verification_status = coalesce($2, verification_status), merged_into = coalesce($3, merged_into),
           deleted_at = coalesce(deleted_at, $4::timestamptz) where id = $1`,
        [d.id, d.verification_status, d.merged_into, d.deleted_at],
      );
      report.decisions += 1;
    }

    for (const s of backup.sources) await tx.query('update sources set admin_enabled = $2 where id = $1', [s.id, s.admin_enabled]);
    return report;
  });
}
