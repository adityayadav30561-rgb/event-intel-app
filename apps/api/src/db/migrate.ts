import type { Db } from './client';
import { sql as init } from './migrations/001_init';
import { sql as ingestion } from './migrations/002_ingestion';
import { sql as users } from './migrations/003_users';
import { sql as tracking } from './migrations/004_tracking';
import { sql as savedSearches } from './migrations/005_saved_searches';
import { sql as notifications } from './migrations/006_notifications';

/** Ordered migrations, embedded in the bundle so the server can migrate itself on start. */
const MIGRATIONS: { id: string; sql: string }[] = [
  { id: '001_init', sql: init },
  { id: '002_ingestion', sql: ingestion },
  { id: '003_users', sql: users },
  { id: '004_tracking', sql: tracking },
  { id: '005_saved_searches', sql: savedSearches },
  { id: '006_notifications', sql: notifications },
];

/** Arbitrary constant for the advisory lock: only one instance migrates at a time. */
const LOCK_KEY = 482_901;

/** Applies pending migrations in one transaction. Safe to run on every start. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query('create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())');
  return db.transaction(async (tx) => {
    // Transaction-scoped lock: released automatically on commit or rollback.
    await tx.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
    const applied = new Set((await tx.query<{ id: string }>('select id from schema_migrations')).map((r) => r.id));
    const ran: string[] = [];
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      await tx.exec(migration.sql);
      await tx.query('insert into schema_migrations (id) values ($1)', [migration.id]);
      ran.push(migration.id);
    }
    return ran;
  });
}
