import { z } from 'zod';
import { ATTENDANCE_MODES, EVENT_STATUSES, EVENT_TYPES, type EventDetail, type EventSummary } from '../domain/types';

/** Admin and researcher tools (Phase 8, docs/DEVELOPMENT_PLAN.md). Only admins and researchers see these. */

const url = z.url().max(1000);

/** An edit to an event. Every field given is kept against future syncs (a field override). */
export const adminEventPatchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
  startAt: z.iso.datetime({ offset: true }).optional(),
  endAt: z.iso.datetime({ offset: true }).optional(),
  allDay: z.boolean().optional(),
  cityId: z.string().min(1).max(60).optional(),
  venueName: z.string().trim().max(160).nullable().optional(),
  venueAddress: z.string().trim().max(300).nullable().optional(),
  attendanceMode: z.enum(ATTENDANCE_MODES).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  registrationUrl: url.nullable().optional(),
  officialWebsite: url.nullable().optional(),
  /** 0 = free; null = unknown. */
  priceMin: z.number().min(0).max(10_000_000).nullable().optional(),
});
export type AdminEventPatch = z.infer<typeof adminEventPatchSchema>;

/** A new event typed in or completed from a page ("Add Event"). */
export const adminCreateEventSchema = adminEventPatchSchema.extend({
  title: z.string().trim().min(3).max(200),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  cityId: z.string().min(1).max(60),
  /** The page it came from, if any. */
  sourceUrl: url.optional(),
  imageUrl: url.optional(),
});
export type AdminCreateEvent = z.infer<typeof adminCreateEventSchema>;

/** Fields an admin edit protects from later syncs. */
export const OVERRIDE_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  eventType: 'Type',
  startAt: 'Start',
  endAt: 'End',
  city: 'City',
  venue: 'Venue',
  status: 'Status',
  registrationUrl: 'Registration link',
  officialWebsite: 'Website',
  price: 'Price',
};

export type AdminOverview = { review: number; duplicates: number; conflicts: number; failingSources: number; lastSyncAt: string | null; lastSyncStatus: string | null };

export type ReviewItem = {
  event: EventSummary;
  /** Why it waits: a likely duplicate of another event, or from a source that isn't trusted yet. */
  reason: 'possible_duplicate' | 'unverified_source';
  sourceName: string | null;
  sourceUrl: string | null;
  duplicate?: { candidateId: string; score: number; event: EventSummary };
};

export type AdminEvent = {
  event: EventDetail;
  overrides: { field: string; editedBy: string | null; editedAt: string }[];
  sources: { id: string; name: string; url: string | null; lastCheckedAt: string | null }[];
  deleted: boolean;
};

export type DuplicatePair = { id: string; score: number; a: EventDetail; b: EventDetail };

/** For a merge: which event's value to keep, per field (the kept event's values by default). */
export const mergeSchema = z.object({
  keep: z.enum(['a', 'b']),
  take: z
    .object({
      title: z.enum(['a', 'b']).optional(),
      dates: z.enum(['a', 'b']).optional(),
      venue: z.enum(['a', 'b']).optional(),
      officialWebsite: z.enum(['a', 'b']).optional(),
    })
    .default({}),
});
export type MergeChoice = z.infer<typeof mergeSchema>;

export type ConflictValue = { sourceId: string | null; sourceName: string; label: string; patch: AdminEventPatch };
export type ConflictItem = { id: string; field: 'date' | 'venue'; event: EventSummary; values: ConflictValue[]; createdAt: string };

export type SyncRunInfo = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  skipped: number;
  sources: { sourceId: string; sourceName: string; status: string; fetched: number; error: string | null }[];
};

export type SourceInfo = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  /** Set from the app; null means the server setting (SOURCES_ENABLED) decides. */
  adminEnabled: boolean | null;
  health: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  eventsFound: number;
  compliance: string | null;
};

export type SyncInfo = { running: boolean; nextSyncAt: string | null; runs: SyncRunInfo[]; sources: SourceInfo[] };
