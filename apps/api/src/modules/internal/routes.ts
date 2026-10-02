import { timingSafeEqual } from 'node:crypto';
import { istParts } from '@eii/shared';
import { Router, type RequestHandler } from 'express';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { refreshDemoData } from '../../db/seed';
import { updateStatuses } from '../../jobs/statusJob';
import { HttpError } from '../../lib/http';
import type { SyncScheduler } from '../../jobs/syncScheduler';
import type { NotificationService } from '../notifications/service';

/** Constant-time check of the cron secret sent in the X-Cron-Secret header. */
const requireCronSecret =
  (secret: string | undefined): RequestHandler =>
  (req, _res, next) => {
    const given = req.get('x-cron-secret') ?? '';
    const ok = secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) throw new HttpError(401, 'unauthorized', 'Missing or invalid cron secret');
    next();
  };

const STATUS_EVERY_MS = 60 * 60_000;

const istDay = (d: Date) => {
  const p = istParts(d);
  return `${p.year}-${p.month}-${p.day}`;
};

/**
 * POST /internal/tick — called every 10 minutes by a free external cron service (plan §5).
 *
 * The ping keeps the free API awake, but the free database has a monthly compute allowance and
 * sleeps after 5 idle minutes, so the tick only touches the database when work is actually due:
 * statuses hourly, sample data once a day, the event sync every EVENT_SYNC_INTERVAL_HOURS.
 * The sync can take minutes, so it runs in the background and the tick answers at once.
 */
export function internalRoutes(db: Db, config: Config, notifications: NotificationService, sync: SyncScheduler): Router {
  const router = Router();
  let busy = false;
  let lastStatusRun = 0;
  let lastDemoDay = '';
  let lastTomorrowDay = '';

  router.post('/tick', requireCronSecret(config.CRON_SECRET), async (_req, res) => {
    if (busy) {
      res.status(202).json({ status: 'already_running' });
      return;
    }
    busy = true;
    const started = Date.now();
    try {
      const now = new Date();
      const result: Record<string, unknown> = {};
      if (config.DEMO_DATA && istDay(now) !== lastDemoDay) {
        result.demoRefreshed = await refreshDemoData(db, now);
        lastDemoDay = istDay(now);
      }
      if (started - lastStatusRun >= STATUS_EVERY_MS) {
        result.statuses = await updateStatuses(db, now);
        lastStatusRun = started;
      }
      if (!sync.nextAt || started >= sync.nextAt.getTime()) {
        result.syncStarted = await sync.runIfDue(now);
      }
      // Reminders: the due time is kept in memory, so this only touches the database when one is due.
      const reminders = await notifications.remindersIfDue(now);
      if (reminders) result.reminders = reminders;
      // "Starts tomorrow" once a day, in the evening (India time).
      if (istParts(now).hour >= 18 && istDay(now) !== lastTomorrowDay) {
        result.startsTomorrow = await notifications.startsTomorrow(now);
        lastTomorrowDay = istDay(now);
      }
      res.json({ status: 'ok', durationMs: Date.now() - started, touchedDatabase: Object.keys(result).length > 0, ...result });
    } finally {
      busy = false;
    }
  });
  return router;
}
