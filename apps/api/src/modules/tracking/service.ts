import type { ChecklistItem, EventNote, PlannedVisitor, TrackedEvent, TrackingChange, TrackingSnapshot, VisitStatus } from '@eii/shared';
import type { Db } from '../../db/client';
import type { EventRepository } from '../events/repository';

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const day = (d: Date | string | null) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  // A DATE column arrives as local midnight; read back the calendar day it stores.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const COLUMN: Record<Extract<TrackingChange, { type: 'tracking' }>['field'], string> = {
  saved: 'saved',
  following: 'following',
  status: 'status',
  visitDate: 'visit_date',
  travelNotes: 'travel_notes',
};

/** Personal tracking, synced from phones (docs/DEVELOPMENT_PLAN.md Phase 5). */
export class TrackingService {
  constructor(
    private readonly db: Db,
    private readonly events: EventRepository,
  ) {}

  /** Applies a phone's queued changes (idempotent, latest-wins per field) and returns everything. */
  async sync(userId: string, changes: TrackingChange[]): Promise<TrackingSnapshot> {
    if (changes.length) {
      await this.db.transaction(async (tx) => {
        const eventIds = [...new Set(changes.map((c) => c.eventId))];
        const existing = new Set(
          (await tx.query<{ id: string }>('select id from event_occurrences where id = any($1::text[]) and deleted_at is null', [eventIds])).map((r) => r.id),
        );
        const done = new Set(
          (await tx.query<{ change_id: string }>('select change_id from applied_changes where user_id = $1 and change_id = any($2::text[])', [userId, changes.map((c) => c.id)])).map(
            (r) => r.change_id,
          ),
        );
        for (const change of changes) {
          if (done.has(change.id)) continue;
          done.add(change.id);
          // An event that no longer exists is skipped; the change still counts as handled.
          if (existing.has(change.eventId)) await this.apply(tx, userId, change);
          await tx.query('insert into applied_changes (user_id, change_id) values ($1, $2) on conflict do nothing', [userId, change.id]);
        }
        await tx.query(`delete from applied_changes where user_id = $1 and applied_at < now() - interval '30 days'`, [userId]);
      });
    }
    return this.snapshot(userId);
  }

  private async apply(tx: Db, userId: string, change: TrackingChange) {
    if (change.type === 'tracking') {
      const column = COLUMN[change.field];
      // Insert a blank row if needed, then update the field only if this change is newer than the stored one.
      await tx.query('insert into user_event_tracking (user_id, occurrence_id) values ($1, $2) on conflict do nothing', [userId, change.eventId]);
      const cast = change.field === 'saved' || change.field === 'following' ? 'boolean' : change.field === 'visitDate' ? 'date' : 'text';
      // Each parameter has one type: $4 the change time as text (stored per field), $6 the same as a timestamp.
      const visited = change.field === 'status' ? ', visited_at = case when $7::boolean then $6::timestamptz else null end' : '';
      await tx.query(
        `update user_event_tracking set ${column} = $3::${cast}${visited},
           field_at = field_at || jsonb_build_object($5::text, $4::text), updated_at = now()
         where user_id = $1 and occurrence_id = $2
           and coalesce((field_at ->> $5::text)::timestamptz, '-infinity'::timestamptz) < $6::timestamptz`,
        [userId, change.eventId, change.value, change.at, change.field, change.at, ...(change.field === 'status' ? [change.value === 'visited'] : [])],
      );
      return;
    }
    if (change.type === 'note') {
      await tx.query(
        `insert into event_notes (user_id, occurrence_id, body, updated_at) values ($1, $2, $3, $4)
         on conflict (user_id, occurrence_id) do update set body = excluded.body, updated_at = excluded.updated_at
         where event_notes.updated_at < excluded.updated_at`,
        [userId, change.eventId, change.body, change.at],
      );
      return;
    }
    const isDefault = change.itemId.startsWith('default:');
    await tx.query(
      `insert into checklist_items (user_id, occurrence_id, item_id, label, is_default, done, sort, deleted, updated_at)
       values ($1, $2, $3, coalesce($4, ''), $5, coalesce($6, false), coalesce($7, 0), coalesce($8, false), $9)
       on conflict (user_id, occurrence_id, item_id) do update set
         label = coalesce($4, checklist_items.label), done = coalesce($6, checklist_items.done), sort = coalesce($7, checklist_items.sort),
         deleted = coalesce($8, checklist_items.deleted), updated_at = $9
       where checklist_items.updated_at < $9`,
      [userId, change.eventId, change.itemId, change.label ?? null, isDefault, change.done ?? null, change.sort ?? null, change.deleted ?? null, change.at],
    );
  }

  async snapshot(userId: string): Promise<TrackingSnapshot> {
    const [tracking, notes, checklist] = await Promise.all([
      this.db.query<{ occurrence_id: string; saved: boolean; following: boolean; status: VisitStatus | null; visit_date: Date | string | null; travel_notes: string | null; visited_at: Date | null; field_at: TrackedEvent['fieldAt'] }>(
        `select occurrence_id, saved, following, status, visit_date, travel_notes, visited_at, field_at from user_event_tracking where user_id = $1 order by occurrence_id`,
        [userId],
      ),
      this.db.query<{ occurrence_id: string; body: string; updated_at: Date }>('select occurrence_id, body, updated_at from event_notes where user_id = $1', [userId]),
      this.db.query<{ occurrence_id: string; item_id: string; label: string; is_default: boolean; done: boolean; sort: number; deleted: boolean; updated_at: Date }>(
        'select occurrence_id, item_id, label, is_default, done, sort, deleted, updated_at from checklist_items where user_id = $1',
        [userId],
      ),
    ]);
    const ids = [...new Set([...tracking.map((t) => t.occurrence_id), ...notes.map((n) => n.occurrence_id), ...checklist.map((c) => c.occurrence_id)])];
    return {
      tracking: tracking.map((t) => ({
        eventId: t.occurrence_id,
        saved: t.saved,
        following: t.following,
        status: t.status,
        visitDate: day(t.visit_date),
        travelNotes: t.travel_notes,
        visitedAt: iso(t.visited_at),
        fieldAt: t.field_at ?? {},
      })),
      notes: notes.map((n): EventNote => ({ eventId: n.occurrence_id, body: n.body, updatedAt: iso(n.updated_at)! })),
      checklist: checklist.map(
        (c): ChecklistItem => ({
          id: c.item_id,
          eventId: c.occurrence_id,
          label: c.label,
          isDefault: c.is_default,
          done: c.done,
          sort: c.sort,
          deleted: c.deleted,
          updatedAt: iso(c.updated_at)!,
        }),
      ),
      events: await this.events.byIds(ids),
      serverTime: new Date().toISOString(),
    };
  }

  /** Who on the team plans to go (§134), so two people don't make the same trip unknowingly. */
  async visitors(eventId: string, userId: string): Promise<PlannedVisitor[]> {
    const rows = await this.db.query<{ id: string; name: string; status: VisitStatus }>(
      `select u.id, u.name, t.status from user_event_tracking t join users u on u.id = t.user_id
       where t.occurrence_id = $1 and t.status in ('planning', 'confirmed', 'visiting', 'visited') and u.is_active
       order by (u.id = $2) desc, lower(u.name)`,
      [eventId, userId],
    );
    return rows.map((r) => ({ name: r.name, status: r.status, isYou: r.id === userId }));
  }
}
