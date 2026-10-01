import { z } from 'zod';
import type { EventSummary } from '../domain/types';

/**
 * Personal tracking (Phase 5, spec §43–48, §133–135): save, follow, visit plans, one note and a
 * checklist per event. The phone applies every change at once and queues it; the queue is sent
 * to POST /me/sync. Each change has an id (resending is harmless) and a time: for each field
 * the latest change wins, so two phones editing different things never overwrite each other.
 */

export const VISIT_STATUSES = ['planning', 'confirmed', 'visiting', 'visited', 'not_visited'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  planning: 'Planning to Visit',
  confirmed: 'Visit Confirmed',
  visiting: 'Visiting Now',
  visited: 'Visited',
  not_visited: 'Didn’t Visit',
};

export const TRACKING_FIELDS = ['saved', 'following', 'status', 'visitDate', 'travelNotes'] as const;
export type TrackingField = (typeof TRACKING_FIELDS)[number];

/** Suggested preparation for a visit (§48, §82). Stored only once ticked; custom items always. */
export const DEFAULT_CHECKLIST: { key: string; label: string }[] = [
  { key: 'registration', label: 'Register' },
  { key: 'calendar', label: 'Add to calendar' },
  { key: 'agenda', label: 'Review the agenda' },
  { key: 'speakers', label: 'Pick sessions and speakers' },
  { key: 'exhibitors', label: 'Shortlist exhibitors to visit' },
  { key: 'venue', label: 'Check the venue and entry' },
  { key: 'directions', label: 'Plan travel and directions' },
  { key: 'notes', label: 'Write down goals for the visit' },
];
export const defaultChecklistId = (key: string) => `default:${key}`;

const base = {
  id: z.string().min(8).max(64),
  /** When the change was made on the phone (ISO). */
  at: z.iso.datetime(),
  eventId: z.string().min(1).max(120),
};

export const trackingChangeSchema = z.union([
  z.object({ ...base, type: z.literal('tracking'), field: z.literal('saved'), value: z.boolean() }),
  z.object({ ...base, type: z.literal('tracking'), field: z.literal('following'), value: z.boolean() }),
  z.object({ ...base, type: z.literal('tracking'), field: z.literal('status'), value: z.enum(VISIT_STATUSES).nullable() }),
  z.object({ ...base, type: z.literal('tracking'), field: z.literal('visitDate'), value: z.iso.date().nullable() }),
  z.object({ ...base, type: z.literal('tracking'), field: z.literal('travelNotes'), value: z.string().max(2000).nullable() }),
  z.object({ ...base, type: z.literal('note'), body: z.string().max(10_000) }),
  z.object({
    ...base,
    type: z.literal('checklist'),
    itemId: z.string().min(1).max(80),
    label: z.string().trim().min(1).max(200).optional(),
    done: z.boolean().optional(),
    sort: z.number().int().min(0).max(10_000).optional(),
    deleted: z.boolean().optional(),
  }),
]);
export type TrackingChange = z.infer<typeof trackingChangeSchema>;

export const trackingSyncSchema = z.object({ changes: z.array(trackingChangeSchema).max(500) });

export type TrackedEvent = {
  eventId: string;
  saved: boolean;
  following: boolean;
  status: VisitStatus | null;
  /** The day you plan to go (YYYY-MM-DD, India). */
  visitDate: string | null;
  travelNotes: string | null;
  visitedAt: string | null;
  /** When each field last changed (ISO), for latest-wins merging. */
  fieldAt: Partial<Record<TrackingField, string>>;
};

export type EventNote = { eventId: string; body: string; updatedAt: string };

export type ChecklistItem = {
  id: string;
  eventId: string;
  label: string;
  isDefault: boolean;
  done: boolean;
  sort: number;
  deleted: boolean;
  updatedAt: string;
};

export type TrackingSnapshot = {
  tracking: TrackedEvent[];
  notes: EventNote[];
  checklist: ChecklistItem[];
  /** Summaries of every tracked event, including past ones (My Events works offline). */
  events: EventSummary[];
  serverTime: string;
};

export type PlannedVisitor = { name: string; status: VisitStatus; isYou: boolean };

/** Local state on the phone: the last snapshot with not-yet-sent changes applied on top. */
export type TrackingState = {
  tracking: Record<string, TrackedEvent>;
  notes: Record<string, EventNote>;
  /** eventId → itemId → item */
  checklist: Record<string, Record<string, ChecklistItem>>;
};

export const EMPTY_TRACKING: TrackingState = { tracking: {}, notes: {}, checklist: {} };

const blankTracked = (eventId: string): TrackedEvent => ({
  eventId,
  saved: false,
  following: false,
  status: null,
  visitDate: null,
  travelNotes: null,
  visitedAt: null,
  fieldAt: {},
});

const newer = (at: string, than: string | undefined) => !than || at > than;

/** Applies one change, latest-wins per field. Pure: the same rule the server applies in SQL. */
export function applyTrackingChange(state: TrackingState, change: TrackingChange): TrackingState {
  if (change.type === 'tracking') {
    const current = state.tracking[change.eventId] ?? blankTracked(change.eventId);
    if (!newer(change.at, current.fieldAt[change.field])) return state;
    const next: TrackedEvent = { ...current, [change.field]: change.value, fieldAt: { ...current.fieldAt, [change.field]: change.at } };
    if (change.field === 'status') next.visitedAt = change.value === 'visited' ? change.at : null;
    return { ...state, tracking: { ...state.tracking, [change.eventId]: next } };
  }
  if (change.type === 'note') {
    const current = state.notes[change.eventId];
    if (current && !newer(change.at, current.updatedAt)) return state;
    return { ...state, notes: { ...state.notes, [change.eventId]: { eventId: change.eventId, body: change.body, updatedAt: change.at } } };
  }
  const items = state.checklist[change.eventId] ?? {};
  const current = items[change.itemId];
  if (current && !newer(change.at, current.updatedAt)) return state;
  const isDefault = change.itemId.startsWith('default:');
  const defaultLabel = isDefault ? DEFAULT_CHECKLIST.find((d) => defaultChecklistId(d.key) === change.itemId)?.label : undefined;
  const next: ChecklistItem = {
    id: change.itemId,
    eventId: change.eventId,
    label: change.label ?? current?.label ?? defaultLabel ?? '',
    isDefault,
    done: change.done ?? current?.done ?? false,
    sort: change.sort ?? current?.sort ?? 0,
    deleted: change.deleted ?? current?.deleted ?? false,
    updatedAt: change.at,
  };
  return { ...state, checklist: { ...state.checklist, [change.eventId]: { ...items, [change.itemId]: next } } };
}

export function snapshotToState(snapshot: Pick<TrackingSnapshot, 'tracking' | 'notes' | 'checklist'>): TrackingState {
  const checklist: TrackingState['checklist'] = {};
  for (const item of snapshot.checklist) (checklist[item.eventId] ??= {})[item.id] = item;
  return {
    tracking: Object.fromEntries(snapshot.tracking.map((t) => [t.eventId, t])),
    notes: Object.fromEntries(snapshot.notes.map((n) => [n.eventId, n])),
    checklist,
  };
}

/** The checklist to show: the default items (ticked or not) then custom ones, without deleted items. */
export function checklistFor(state: TrackingState, eventId: string): ChecklistItem[] {
  const stored = state.checklist[eventId] ?? {};
  const defaults = DEFAULT_CHECKLIST.map((d, i): ChecklistItem => {
    const id = defaultChecklistId(d.key);
    // Suggested items always use their own wording (the server stores only whether they're ticked).
    const item = stored[id];
    return item ? { ...item, label: d.label, sort: i } : { id, eventId, label: d.label, isDefault: true, done: false, sort: i, deleted: false, updatedAt: '' };
  });
  const custom = Object.values(stored)
    .filter((item) => !item.isDefault)
    .sort((a, b) => a.sort - b.sort || a.updatedAt.localeCompare(b.updatedAt));
  return [...defaults, ...custom].filter((item) => !item.deleted);
}

/** Which My Events list an event belongs in (§45). An event can be in several. */
export function isTracked(t: TrackedEvent | undefined): boolean {
  return Boolean(t && (t.saved || t.following || t.status));
}
