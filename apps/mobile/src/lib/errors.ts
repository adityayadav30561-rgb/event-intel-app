import { ApiError } from '@/repositories';

/** One plain sentence for any failure, with what to do about it (spec §89). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
    if (error.kind === 'timeout') return 'The server is waking up. Try again in a moment.';
    if (error.kind === 'network') return 'Can’t reach the server. Check your connection and try again.';
    if (error.kind === 'server') return 'Something went wrong on the server. Try again in a moment.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
