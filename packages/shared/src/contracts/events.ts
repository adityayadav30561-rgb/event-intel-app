import { z } from 'zod';
import { DATE_PRESETS } from '../dates';
import { EVENT_TYPES } from '../domain/types';
import type { EventSummary, Organizer } from '../domain/types';

/**
 * API contracts. The same schemas validate requests on the server (Phase 2) and describe
 * what the app's repositories return, so the mock and live data sources stay interchangeable.
 */

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
    z.array(item).optional(),
  );

export const EVENT_SORTS = ['date', 'relevance', 'recently_added', 'recently_updated'] as const;
export type EventSort = (typeof EVENT_SORTS)[number];

export const eventQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  cityIds: csv(z.string().max(60)),
  categoryIds: csv(z.string().max(60)),
  technologyIds: csv(z.string().max(60)),
  industryIds: csv(z.string().max(60)),
  eventTypes: csv(z.enum(EVENT_TYPES)),
  organizerId: z.string().max(80).optional(),
  datePreset: z.enum(DATE_PRESETS).optional(),
  /** ISO dates; used when no preset is given. */
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  /** Include events that have already ended (history, organizer pages). */
  includePast: z.preprocess((value) => value === true || value === 'true', z.boolean()).optional(),
  sort: z.enum(EVENT_SORTS).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type EventQuery = z.infer<typeof eventQuerySchema>;

export const DEFAULT_PAGE_SIZE = 25;

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
  /** Total matches, when cheap to compute. */
  total?: number;
};

export const homeQuerySchema = z.object({ cityIds: csv(z.string().max(60)) });
export type HomeQuery = z.infer<typeof homeQuerySchema>;

export type HomeFeed = {
  /** Notable upcoming events for the featured carousel. */
  upcoming: EventSummary[];
  /** Events running at any point this week (Monday–Sunday, India time). */
  thisWeek: EventSummary[];
  /** Most recently discovered events. */
  newlyAdded: EventSummary[];
  /** Events with a meaningful change in the last days, newest change first. */
  recentlyUpdated: EventSummary[];
  /** Categories with the most upcoming events. */
  categories: { id: string; count: number }[];
  generatedAt: string;
};

export type CityCount = { cityId: string; count: number };

/** Event data freshness shown to users (spec §96). */
export type SyncStatus = {
  /** "sample" until real sources are connected. */
  mode: 'sample' | 'live';
  lastUpdatedAt: string | null;
  status: 'up_to_date' | 'stale' | 'never';
  lastRunStatus: string | null;
  intervalHours: number;
  /** Health of each source that's switched on (live mode). */
  sources?: SourceHealth[];
};

export type SourceHealth = {
  id: string;
  name: string;
  health: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  eventsFound: number;
};

export type OrganizerProfile = {
  organizer: Organizer;
  upcoming: EventSummary[];
  past: EventSummary[];
};
