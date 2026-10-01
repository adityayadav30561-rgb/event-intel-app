import type { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

/**
 * Minimal database interface shared by production Postgres (node-postgres) and the embedded
 * PGlite used for development and tests. Queries are plain parameterised SQL.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs a script of several statements without parameters (migrations). */
  exec(script: string): Promise<void>;
  /** Runs `fn` in a transaction; everything inside uses the same connection. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: 'postgres' | 'pglite';
}

export async function first<T>(db: Db, text: string, params?: unknown[]): Promise<T | undefined> {
  const rows = await db.query<T>(text, params);
  return rows[0];
}

export function createPostgresDb(connectionString: string): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    // Managed Postgres (Neon) requires TLS.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: true },
  });
  const wrap = (client: pg.Pool | pg.PoolClient): Db => ({
    kind: 'postgres',
    query: async <T>(text: string, params?: unknown[]) => (await client.query(text, params as unknown[])).rows as T[],
    exec: async (script: string) => {
      await client.query(script);
    },
    transaction: async <T>(fn: (tx: Db) => Promise<T>) => {
      if (!('release' in client)) {
        const conn = await pool.connect();
        try {
          await conn.query('BEGIN');
          const result = await fn(wrap(conn));
          await conn.query('COMMIT');
          return result;
        } catch (error) {
          await conn.query('ROLLBACK');
          throw error;
        } finally {
          conn.release();
        }
      }
      return fn(wrap(client));
    },
    close: async () => {
      if (!('release' in client)) await pool.end();
    },
  });
  return wrap(pool);
}

/** Embedded Postgres for development and tests; loaded lazily so production never pulls it in. */
export async function createPgliteDb(dir: string): Promise<Db> {
  const [{ PGlite }, { pg_trgm }, { unaccent }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/contrib/pg_trgm'),
    import('@electric-sql/pglite/contrib/unaccent'),
  ]);
  const lite = await PGlite.create(dir === 'memory' ? undefined : dir, { extensions: { pg_trgm, unaccent } });
  const wrap = (conn: Pick<PGlite, 'query' | 'exec'>, inTx: boolean): Db => ({
    kind: 'pglite',
    query: async <T>(text: string, params?: unknown[]) => (await conn.query<T>(text, params)).rows,
    exec: async (script: string) => {
      await conn.exec(script);
    },
    transaction: async <T>(fn: (tx: Db) => Promise<T>) => (inTx ? fn(wrap(conn, true)) : lite.transaction((tx) => fn(wrap(tx, true)))),
    close: async () => {
      if (!inTx) await lite.close();
    },
  });
  return wrap(lite, false);
}
