import { Router } from 'express';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { cacheFor } from '../../lib/http';

/** Simple freshness for users (spec §96): when event data was last updated and whether it's current. */
export function syncRoutes(db: Db, config: Config): Router {
  const router = Router();
  router.get('/sync/status', cacheFor(60), async (_req, res) => {
    const [lastRun] = await db.query<{ completed_at: Date | null; status: string }>(
      `select completed_at, status from sync_runs where status <> 'running' order by started_at desc limit 1`,
    );
    const [demo] = await db.query<{ updated_at: Date }>(`select updated_at from app_state where key = 'demo_seed'`);
    // Sample mode until real sources replace the generated events.
    const live = !config.DEMO_DATA;
    const lastUpdatedAt = (live ? lastRun?.completed_at : (demo?.updated_at ?? lastRun?.completed_at)) ?? null;
    const staleAfterMs = config.EVENT_SYNC_INTERVAL_HOURS * 2 * 3_600_000;
    // Health of each source that's switched on, so a failing site is visible without server logs.
    const sources = await db.query<{ id: string; name: string; health: string; last_success_at: Date | null; last_error: string | null; events_found: number }>(
      `select id, name, health, last_success_at, last_error, events_found from sources where enabled and kind <> 'demo' order by name`,
    );
    res.json({
      mode: live ? 'live' : 'sample',
      lastUpdatedAt: lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : null,
      status: !lastUpdatedAt ? 'never' : Date.now() - new Date(lastUpdatedAt).getTime() > staleAfterMs ? 'stale' : 'up_to_date',
      lastRunStatus: lastRun?.status ?? null,
      intervalHours: config.EVENT_SYNC_INTERVAL_HOURS,
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        health: s.health,
        lastSuccessAt: s.last_success_at ? new Date(s.last_success_at).toISOString() : null,
        lastError: s.last_error,
        eventsFound: s.events_found,
      })),
    });
  });
  return router;
}
