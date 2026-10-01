import { pino } from 'pino';

/** Structured JSON logs (readable in the Render dashboard). */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'req.headers["x-cron-secret"]', 'req.headers.cookie'],
});
