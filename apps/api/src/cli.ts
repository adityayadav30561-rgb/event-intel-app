import { formatDateRange, formatTimeRange } from '@eii/shared';
import { loadConfig } from './config';
import { createPgliteDb, createPostgresDb } from './db/client';
import { migrate } from './db/migrate';
import { seedReference } from './db/seed';
import { syncSourceRegistry } from './ingestion/registry';
import { ADAPTERS } from './ingestion/adapters';
import { createFetcher } from './ingestion/fetcher';
import { importFromUrl } from './ingestion/importUrl';
import { normalize } from './ingestion/normalize';
import { runEventSync } from './ingestion/sync';
import type { SourceConfig, SourceRow } from './ingestion/types';

/**
 * Maintenance commands:
 *   npm run cli -w @eii/api -- try <adapter> <url> [--pattern <regex>] [--max <n>] [--any-topic]
 *       Reads a source without saving anything and shows what would be imported.
 *   npm run cli -w @eii/api -- sync [--dry-run] [--source id1,id2]
 *       Runs the event sync against the configured database.
 *   npm run cli -w @eii/api -- import-url <url>
 *       Shows the draft "Add by URL" would create.
 */
const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? (rest[i + 1] ?? '') : undefined;
};
const has = (name: string) => rest.includes(`--${name}`);

async function tryAdapter() {
  const [adapterId, url] = rest;
  const adapter = ADAPTERS[adapterId ?? ''];
  if (!adapter || !url) throw new Error(`Usage: try <${Object.keys(ADAPTERS).join('|')}> <url> [--pattern <regex>] [--max <n>] [--any-topic]`);
  const pattern = flag('pattern');
  const max = flag('max') ? Number(flag('max')) : undefined;
  const config: SourceConfig = {
    urls: [url],
    requireTopic: !has('any-topic'),
    defaults: { city: flag('city'), venueName: flag('venue') },
    ...(pattern && adapterId === 'sitemap' ? { sitemap: { pattern, max } } : pattern ? { followLinks: { pattern, max } } : {}),
  };
  const source: SourceRow = { id: 'trial', name: 'Trial', adapter: adapterId!, kind: 'official_event', config, priority: 50, enabled: true, trusted: true };
  const raws = await adapter.read(source, createFetcher());
  const now = new Date();
  const skipped: Record<string, number> = {};
  console.log(`\nRead ${raws.length} raw events from ${url}\n`);
  for (const raw of raws) {
    const r = normalize(raw, source, now);
    if (!r.ok) {
      skipped[r.reason] = (skipped[r.reason] ?? 0) + 1;
      if (has('show-skipped')) console.log(`· skipped (${r.reason}): ${raw.title} | city=${raw.city ?? '-'} | address=${raw.address ?? '-'} | venue=${raw.venueName ?? '-'} | start=${String(raw.start ?? '-')}`);
      continue;
    }
    const e = r.event;
    console.log(`✓ ${e.title}\n    ${formatDateRange(new Date(e.startAt), new Date(e.endAt))}${e.allDay ? '' : ` ${formatTimeRange(new Date(e.startAt), new Date(e.endAt))} IST`} · ${e.city}${e.venueName ? ` · ${e.venueName}` : ''} · ${e.eventType} · ${[...e.technologyIds, ...e.categoryIds].join(', ')}`);
  }
  console.log(`\nSkipped: ${JSON.stringify(skipped)}`);
}

async function withDb<T>(fn: (db: Awaited<ReturnType<typeof createPgliteDb>>) => Promise<T>) {
  const config = loadConfig();
  const db = config.DATABASE_URL ? createPostgresDb(config.DATABASE_URL) : await createPgliteDb(config.PGLITE_DIR);
  try {
    await migrate(db);
    await seedReference(db);
    await syncSourceRegistry(db, config.SOURCES_ENABLED.split(',').map((id) => id.trim()).filter(Boolean), config.CURATED_SHEET_URL);
    return await fn(db);
  } finally {
    await db.close();
  }
}

async function main() {
  switch (command) {
    case 'try':
      return tryAdapter();
    case 'sync':
      return withDb(async (db) => {
        const ids = flag('source')?.split(',').filter(Boolean);
        const summary = await runEventSync(db, { dryRun: has('dry-run'), sourceIds: ids });
        console.log(JSON.stringify(summary, null, 2));
      });
    case 'import-url': {
      const result = await importFromUrl(rest[0] ?? '');
      console.log(JSON.stringify(result.kind === 'ready' ? { kind: result.kind, event: result.event } : result, null, 2));
      return;
    }
    default:
      console.log('Commands: try, sync, import-url (see src/cli.ts)');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
