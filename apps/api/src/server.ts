import { mkdirSync } from 'node:fs';
import { createApp } from './app';
import { loadConfig } from './config';
import { createPgliteDb, createPostgresDb, type Db } from './db/client';
import { migrate } from './db/migrate';
import { refreshDemoData, seedReference } from './db/seed';
import { logger } from './lib/logger';

/** Boots the API: connect → migrate → seed reference data (+ sample events) → listen. */
async function main() {
  const config = loadConfig();
  let db: Db;
  if (config.DATABASE_URL) {
    db = createPostgresDb(config.DATABASE_URL);
  } else {
    if (config.PGLITE_DIR !== 'memory') mkdirSync(config.PGLITE_DIR, { recursive: true });
    db = await createPgliteDb(config.PGLITE_DIR);
    logger.info({ dir: config.PGLITE_DIR }, 'Using embedded PGlite database');
  }

  const ran = await migrate(db);
  if (ran.length) logger.info({ migrations: ran }, 'Applied migrations');
  await seedReference(db);
  if (config.DEMO_DATA && (await refreshDemoData(db))) logger.info('Refreshed sample events');

  const app = createApp(db, config);
  const server = app.listen(config.PORT, () => logger.info(`API listening on port ${config.PORT}`));

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start');
  process.exit(1);
});
