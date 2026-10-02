import type { Db } from '../db/client';
import { pruneOldData } from '../db/retention';
import { runEventSync } from '../ingestion/sync';
import { logger } from '../lib/logger';
import type { NotificationService } from '../modules/notifications/service';

/**
 * When the event sync runs (every EVENT_SYNC_INTERVAL_HOURS, from the cron tick) and "Run Now"
 * from the admin tools. One sync at a time; alerts go out right after each one.
 */
export class SyncScheduler {
  /** When the next sync is due; read from the database once after a restart. */
  private nextSyncAt: number | null = null;
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly everyMs: number,
    private readonly notifications: NotificationService,
  ) {}

  get isRunning() {
    return this.running;
  }

  get nextAt(): Date | null {
    return this.nextSyncAt ? new Date(this.nextSyncAt) : null;
  }

  /** From the tick: starts a sync if one is due. */
  async runIfDue(now = new Date()): Promise<boolean> {
    if (this.running) return false;
    if (this.nextSyncAt === null) {
      const [last] = await this.db.query<{ started_at: Date }>(`select started_at from sync_runs where status <> 'running' order by started_at desc limit 1`);
      this.nextSyncAt = last ? new Date(last.started_at).getTime() + this.everyMs : 0;
    }
    if (now.getTime() < this.nextSyncAt) return false;
    return this.start(now);
  }

  /** From the admin tools: runs now (unless one is already running). The sync runs in the background. */
  start(now = new Date()): boolean {
    if (this.running) return false;
    this.nextSyncAt = now.getTime() + this.everyMs;
    this.running = true;
    void runEventSync(this.db, { now })
      .then(async (summary) => {
        logger.info({ summary }, 'Event sync finished');
        // Changes to followed events and new matches go out right after the data changes.
        const alerts = await this.notifications.afterSync(new Date());
        logger.info({ alerts }, 'Alerts after sync');
        logger.info({ pruned: await pruneOldData(this.db) }, 'Old data removed');
      })
      .catch((error) => logger.error({ err: error }, 'Event sync failed'))
      .finally(() => {
        this.running = false;
      });
    return true;
  }
}
