/**
 * Opaque pagination cursors. Date-like sorts use keyset pagination (stable while new events
 * arrive); relevance uses an offset because its ordering is computed per query.
 */
export type Cursor = { k: [string, string] } | { o: number };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if ('o' in parsed && Number.isInteger(parsed.o) && parsed.o >= 0) return parsed;
    if ('k' in parsed && Array.isArray(parsed.k) && parsed.k.length === 2 && parsed.k.every((v) => typeof v === 'string')) return parsed;
  } catch {
    /* fall through */
  }
  return undefined;
}
