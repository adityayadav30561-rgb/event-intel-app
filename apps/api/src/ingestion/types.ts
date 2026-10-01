import type { AttendanceMode, EventStatus } from '@eii/shared';
import type { CardSelectors } from './extract/cards';

/**
 * An event as read from a source, before any cleanup (spec §99). Adapters fill what the
 * source provides; everything else stays undefined. Provenance is never thrown away.
 */
export type RawEvent = {
  /** Stable id within the source (feed UID, GUID, or canonical URL). */
  sourceEventId: string;
  sourceUrl?: string;
  title: string;
  description?: string;
  /** ISO strings, Dates, or plain date strings ("2026-11-12"); the normalizer decides. */
  start?: string | Date;
  end?: string | Date;
  timezone?: string;
  venueName?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  organizerName?: string;
  organizerUrl?: string;
  imageUrl?: string;
  officialUrl?: string;
  registrationUrl?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  isFree?: boolean;
  priceText?: string;
  attendanceMode?: AttendanceMode;
  status?: EventStatus;
  /** e.g. "ExhibitionEvent", "Conference", "trade fair". */
  typeHint?: string;
  tags?: string[];
  /** Original payload, stored for provenance. */
  raw: unknown;
};

export type SourceKind = 'official_organizer' | 'official_event' | 'official_venue' | 'platform' | 'directory' | 'curated';

/** A row of the `sources` table. */
export type SourceRow = {
  id: string;
  name: string;
  adapter: string;
  kind: SourceKind | 'demo';
  config: SourceConfig;
  priority: number;
  enabled: boolean;
  trusted: boolean;
  /** Last successful read, so sitemaps can fetch only pages changed since then. */
  lastSuccessAt?: Date | null;
};

export type SourceConfig = {
  /** Pages or feeds to read. */
  urls?: string[];
  /** For listing pages: follow links matching this pattern to event detail pages. */
  followLinks?: { pattern: string; max?: number };
  /** Sitemaps: only pages whose URL matches, at most `max` new or changed pages per run. */
  sitemap?: { pattern: string; max?: number };
  /** Open-data JSON (e.g. confs.tech): keep only entries in this country. */
  country?: string;
  /** Keep only events that match at least one topic (default true): venue calendars also list weddings and consumer fairs. */
  requireTopic?: boolean;
  /** Topics every event from this source has (e.g. everything on Zoho's events site is about Zoho). */
  topics?: { technologyIds?: string[]; categoryIds?: string[] };
  /** Defaults applied when the source doesn't say (e.g. a venue's own address). */
  defaults?: Partial<Pick<RawEvent, 'venueName' | 'address' | 'city' | 'organizerName' | 'organizerUrl' | 'typeHint'>>;
  /** Pages without structured data: where each fact sits on an event card (see extract/cards.ts). */
  cards?: CardSelectors;
};

/** Polite HTTP access shared by all adapters. */
export interface Fetcher {
  /** Returns the body, or throws FetchError. Respects robots.txt and per-host pacing. */
  text(url: string, accept?: string): Promise<string>;
}

export interface SourceAdapter {
  readonly id: string;
  read(source: SourceRow, fetcher: Fetcher): Promise<RawEvent[]>;
}

export class FetchError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    readonly retryable = true,
  ) {
    super(message);
  }
}
