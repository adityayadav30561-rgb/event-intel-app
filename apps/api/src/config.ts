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
  /** Seed and refresh clearly-labelled sample events (until real sources are connected in Phase 3). */
  DEMO_DATA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  EVENT_SYNC_INTERVAL_HOURS: z.coerce.number().positive().default(12),
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
