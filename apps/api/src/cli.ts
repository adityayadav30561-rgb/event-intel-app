import fs from 'node:fs';
import { formatDateRange, formatTimeRange } from '@eii/shared';
import { loadConfig } from './config';
import { createPgliteDb, createPostgresDb } from './db/client';
import { migrate } from './db/migrate';
import { seedReference } from './db/seed';
import { SOURCE_DEFINITIONS, syncSourceRegistry } from './ingestion/registry';
import { ADAPTERS } from './ingestion/adapters';
import { createFetcher } from './ingestion/fetcher';
import { importFromUrl } from './ingestion/importUrl';
import { normalize } from './ingestion/normalize';
import { exportBackup, restoreBackup } from './modules/admin/backup';
import { EventRepository } from './modules/events/repository';
import { runEventSync } from './ingestion/sync';
import type { SourceConfig, SourceRow } from './ingestion/types';

/**
 * Maintenance commands:
 *   npm run cli -w @eii/api -- try <adapter> <url> [--pattern <regex>] [--max <n>] [--any-topic]
 *       Reads a source without saving anything and shows what would be imported.
 *   npm run cli -w @eii/api -- try-source <id> [--show-skipped]
 *       Reads one registered source (src/ingestion/registry.ts) the same way, without saving.
 *   npm run cli -w @eii/api -- sync [--dry-run] [--source id1,id2]
 *       Runs the event sync against the configured database.
 *   npm run cli -w @eii/api -- import-url <url>
 *       Shows the draft "Add by URL" would create.
 *   npm run cli -w @eii/api -- backup [--out file.json]
 *       Saves the team's data (see src/modules/admin/backup.ts) from the configured database.
 *   npm run cli -w @eii/api -- restore <file.json>
 *       Puts a backup back. Run `sync` first on a new database so events from sources exist.
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
  await showTrial({ id: 'trial', name: 'Trial', adapter: adapterId!, kind: 'official_event', config, priority: 50, enabled: true, trusted: true }, url);
}

async function trySource() {
  const definition = SOURCE_DEFINITIONS.find((s) => s.id === rest[0]);
  if (!definition) throw new Error(`Usage: try-source <${SOURCE_DEFINITIONS.map((s) => s.id).join('|')}>`);
  const { compliance: _compliance, ...source } = definition;
  await showTrial({ ...source, enabled: true }, source.config.urls?.join(', ') ?? source.id);
}

async function showTrial(source: SourceRow, url: string) {
  const adapter = ADAPTERS[source.adapter];
  if (!adapter) throw new Error(`Unknown adapter ${source.adapter}`);
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
    case 'try-source':
      return trySource();
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
    case 'backup':
      return withDb(async (db) => {
        const backup = await exportBackup(db, new EventRepository(db));
        const out = flag('out') || `eii-backup-${backup.createdAt.slice(0, 10)}.json`;
        fs.writeFileSync(out, JSON.stringify(backup));
        console.log(`Saved ${backup.users.length} accounts and the team's data to ${out}`);
      });
    case 'restore':
      return withDb(async (db) => {
        if (!rest[0]) throw new Error('Usage: restore <file.json>');
        const report = await restoreBackup(db, JSON.parse(fs.readFileSync(rest[0], 'utf8')));
        console.log(JSON.stringify(report, null, 2));
        if (report.createdUsers.length) console.log('\nNew accounts have no password yet: reset each one in More → Admin → Team.');
        if (Object.keys(report.skipped).length) console.log('\nSome rows belong to events not synced yet: run `sync`, then restore again.');
      });
    default:
      console.log('Commands: try, try-source, sync, import-url, backup, restore (see src/cli.ts)');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
