import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z, type ZodType } from 'zod';

/** An error with an HTTP status and a stable machine-readable code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);

/** Validates and parses input with a zod schema; invalid input becomes a 400 with details. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, 'invalid_request', 'Some parameters are invalid', z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}

/** Consistent error envelope: { error: { code, message, details? } }. Never leaks stack traces. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
    return;
  }
  req.log?.error({ err: error }, 'Unhandled error');
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint' } });
};

/** Short caching on the person's own device only (responses are per signed-in user). */
export const cacheFor =
  (seconds: number): RequestHandler =>
  (_req, res, next) => {
    res.set('Cache-Control', `private, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);
    next();
  };
