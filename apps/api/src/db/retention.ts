import type { Db } from './client';

/**
 * Keeps the free database small (runs after each sync): expired sign-ins a week after they end,
 * and notifications after six months. Events, tracking and the audit log are kept.
 */
export async function pruneOldData(db: Db, now = new Date()): Promise<{ refreshTokens: number; notifications: number }> {
  const refreshTokens = await db.query(`delete from refresh_tokens where expires_at < $1::timestamptz - interval '7 days' returning 1`, [now]);
  const notifications = await db.query(`delete from notifications where created_at < $1::timestamptz - interval '180 days' returning 1`, [now]);
  return { refreshTokens: refreshTokens.length, notifications: notifications.length };
}
