import type { EventDetail } from '@eii/shared';
import { extractJsonLdEvents, extractMeta } from './extract/jsonld';
import { createFetcher } from './fetcher';
import { normalize, type SkipReason } from './normalize';
import type { Fetcher, RawEvent, SourceRow } from './types';

/**
 * "Add by URL" (plan Phase 3): read an official event page and prepare a draft.
 * Structured event data gives a complete draft; otherwise only the title, description and image
 * are pre-filled, and the person adding it supplies the dates and place — never guessed.
 */
export type ImportResult =
  | { kind: 'ready'; event: EventDetail; raw: RawEvent }
  | { kind: 'needs_details'; draft: Partial<RawEvent>; missing: SkipReason | 'no_event_data' };

const MANUAL_SOURCE: SourceRow = {
  id: 'manual',
  name: 'Added by the team',
  adapter: 'manual',
  kind: 'curated',
  config: { requireTopic: false },
  priority: 90,
  enabled: false,
  trusted: true,
};

export async function importFromUrl(url: string, options: { fetcher?: Fetcher; now?: Date } = {}): Promise<ImportResult> {
  const fetcher = options.fetcher ?? createFetcher();
  const html = await fetcher.text(url);
  const { events } = extractJsonLdEvents(html, url);
  const meta = extractMeta(html, url);
  const raw = events[0];
  if (!raw) return { kind: 'needs_details', draft: meta, missing: 'no_event_data' };
  const merged: RawEvent = { ...raw, imageUrl: raw.imageUrl ?? meta.imageUrl, description: raw.description ?? meta.description, sourceUrl: url };
  const result = normalize(merged, MANUAL_SOURCE, options.now ?? new Date());
  if (!result.ok) return { kind: 'needs_details', draft: { ...meta, ...merged }, missing: result.reason };
  return { kind: 'ready', event: result.event, raw: merged };
}
