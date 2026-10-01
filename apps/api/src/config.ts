import { z } from 'zod';

/**
 * Server configuration from environment variables. Secrets live only in the host's environment
 * (Render dashboard / local .env), never in the repository or the app.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  /** Postgres connection string (Neon in production). Without it, an embedded PGlite database is used. */
  DATABASE_URL: z.string().optional(),
  /** Folder for the embedded development database; "memory" keeps it in memory. */
  PGLITE_DIR: z.string().default('.data/pglite'),
  /** Comma-separated extra origins allowed to call the API (the app's own origins are always allowed). */
  CORS_ORIGINS: z.string().default(''),
  /** Shared secret the cron service sends to POST /internal/tick. */
  CRON_SECRET: z.string().optional(),
  /** Signs access tokens. Optional: without it one is generated once and kept in the database. */
  JWT_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).optional()),
  /** First admin account, created on start if this email has no account yet (set in the host's dashboard, never in git). */
  ADMIN_EMAIL: z.preprocess((v) => (v === '' ? undefined : v), z.string().email().optional()),
  ADMIN_PASSWORD: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
  ADMIN_NAME: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(80).optional()),
  /** Seed and refresh clearly-labelled sample events (until real sources are connected in Phase 3). */
  DEMO_DATA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  EVENT_SYNC_INTERVAL_HOURS: z.coerce.number().positive().default(12),
  /** Comma-separated ids of sources to read (see src/ingestion/registry.ts and docs/SOURCES.md). */
  SOURCES_ENABLED: z.string().default(''),
  /** Optional team Google Sheet, published as CSV (File → Share → Publish to web → CSV). */
  CURATED_SHEET_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }
  return parsed.data;
}
