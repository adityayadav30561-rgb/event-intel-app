import { timingSafeEqual } from 'node:crypto';
import { istParts } from '@eii/shared';
import { Router, type RequestHandler } from 'express';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { refreshDemoData } from '../../db/seed';
import { updateStatuses } from '../../jobs/statusJob';
import { HttpError } from '../../lib/http';

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
 * statuses hourly, sample data once a day. Phase 3 adds the 12-hour sync; Phase 7 adds reminders.
 */
export function internalRoutes(db: Db, config: Config): Router {
  const router = Router();
  let running = false;
  let lastStatusRun = 0;
  let lastDemoDay = '';

  router.post('/tick', requireCronSecret(config.CRON_SECRET), async (_req, res) => {
    if (running) {
      res.status(202).json({ status: 'already_running' });
      return;
    }
    running = true;
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
      res.json({ status: 'ok', durationMs: Date.now() - started, touchedDatabase: Object.keys(result).length > 0, ...result });
    } finally {
      running = false;
    }
  });
  return router;
}
