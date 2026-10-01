import { z } from 'zod';
import { DATE_PRESETS } from '../dates';
import { ATTENDANCE_MODES, EVENT_TYPES } from '../domain/types';
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

/** relevance: best text match · match: best fit for your interests · distance: nearest first (needs lat/lng). */
export const EVENT_SORTS = ['date', 'relevance', 'match', 'distance', 'recently_added', 'recently_updated'] as const;
export type EventSort = (typeof EVENT_SORTS)[number];

export const eventQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  cityIds: csv(z.string().max(60)),
  categoryIds: csv(z.string().max(60)),
  technologyIds: csv(z.string().max(60)),
  industryIds: csv(z.string().max(60)),
  eventTypes: csv(z.enum(EVENT_TYPES)),
  organizerId: z.string().max(80).optional(),
  attendanceModes: csv(z.enum(ATTENDANCE_MODES)),
  price: z.enum(['free', 'paid']).optional(),
  /** Near a point (only when the person taps "Use my location"). */
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).optional(),
  /** Only events matching your interests at least this well (signed-in person's interests). */
  minMatch: z.enum(['strong', 'good', 'possible']).optional(),
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

/** GET /events/map: the visible box and zoom, plus the same filters as the list. */
export const mapQuerySchema = eventQuerySchema.omit({ cursor: true, limit: true, sort: true }).extend({
  west: z.coerce.number().min(-180).max(180),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  north: z.coerce.number().min(-90).max(90),
  zoom: z.coerce.number().min(0).max(22),
});

export type MapQuery = z.infer<typeof mapQuerySchema>;

export type MapPin = { id: string; title: string; startAt: string; endAt: string; eventType: EventSummary['eventType']; city: string; lat: number; lng: number };
export type MapCluster = {
  key: string;
  count: number;
  lat: number;
  lng: number;
  /** Set when every event in the cluster is at the same point: list them instead of zooming. */
  events?: MapPin[];
  label?: string;
};
export type MapResponse = { pins: MapPin[]; clusters: MapCluster[]; total: number };

/** A search you keep (§68): the typed text and filters, re-run when opened. */
export const savedSearchQuerySchema = eventQuerySchema.omit({ cursor: true, limit: true, lat: true, lng: true, radiusKm: true });
export type SavedSearchQuery = z.infer<typeof savedSearchQuerySchema>;
export const savedSearchSchema = z.object({
  name: z.string().trim().min(1).max(80),
  query: savedSearchQuerySchema,
  /** Alerts about new matches (sent from Phase 7). */
  notify: z.boolean().default(true),
});
export type SavedSearch = { id: string; name: string; query: SavedSearchQuery; notify: boolean; createdAt: string; updatedAt: string };
