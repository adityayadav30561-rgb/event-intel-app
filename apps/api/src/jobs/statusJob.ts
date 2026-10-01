import type { Db } from '../db/client';

/**
 * Moves events through time-based statuses (spec §42): upcoming → ongoing → completed.
 * Cancelled and postponed events are left alone. These are routine transitions, so they don't
 * create change records or notifications.
 */
export async function updateStatuses(db: Db, now: Date = new Date()): Promise<{ ongoing: number; completed: number }> {
  const ongoing = await db.query(
    `update event_occurrences set status = 'ongoing'
     where status in ('upcoming', 'registration_closed', 'rescheduled') and start_at <= $1 and end_at >= $1 and deleted_at is null
     returning id`,
    [now],
  );
  const completed = await db.query(
    `update event_occurrences set status = 'completed'
     where status in ('upcoming', 'ongoing', 'registration_closed', 'rescheduled') and end_at < $1 and deleted_at is null
     returning id`,
    [now],
  );
  return { ongoing: ongoing.length, completed: completed.length };
}
