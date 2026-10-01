import {
  DATE_PRESET_LABELS,
  EVENT_TYPE_LABELS,
  getCategory,
  getTechnology,
  getZone,
  REGIONS,
  parseSearch,
  searchPartsToQuery,
  type AttendanceMode,
  type DatePreset,
  type EventQuery,
  type EventSort,
  type EventType,
  type SavedSearchQuery,
  type SearchPart,
} from '@eii/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';
import { placeName, type Place } from './placeStore';

/** Explore's search text and filters (client state). */
export type ExploreFilters = {
  q: string;
  place: Place | null;
  datePreset: DatePreset | null;
  categoryId: string | null;
  eventType: EventType | null;
  technologyIds: string[];
  industryIds: string[];
  attendanceModes: AttendanceMode[];
  price: 'free' | 'paid' | null;
  minMatch: 'strong' | 'good' | null;
  sort: EventSort | null;
  /** "Use my location": only after the person taps it. */
  near: { lat: number; lng: number; radiusKm: number } | null;
};

export const EMPTY_FILTERS: ExploreFilters = {
  q: '',
  place: null,
  datePreset: null,
  categoryId: null,
  eventType: null,
  technologyIds: [],
  industryIds: [],
  attendanceModes: [],
  price: null,
  minMatch: null,
  sort: null,
  near: null,
};

type ExploreState = ExploreFilters & {
  view: 'list' | 'map';
  set: (patch: Partial<ExploreFilters> & { view?: 'list' | 'map' }) => void;
  reset: () => void;
};

export const useExploreStore = create<ExploreState>((set) => ({
  ...EMPTY_FILTERS,
  view: 'list',
  set: (patch) => set(patch),
  reset: () => set(EMPTY_FILTERS),
}));

/** Filters in the "Filters" sheet (beyond the quick chips), for the badge count. */
export const extraFilterCount = (f: ExploreFilters) =>
  f.technologyIds.length + f.industryIds.length + f.attendanceModes.length + (f.price ? 1 : 0) + (f.minMatch ? 1 : 0);

export const hasAnyFilter = (f: ExploreFilters) =>
  Boolean(f.place || f.datePreset || f.categoryId || f.eventType || f.near || extraFilterCount(f) > 0);

const unique = <T>(list: T[]) => [...new Set(list)];

/** The query Explore runs: chosen filters plus what the typed text says ("SAP in Delhi"). */
export function exploreQuery(f: ExploreFilters, parsedText: string, parts: SearchPart[]): EventQuery {
  const typed = searchPartsToQuery(parts);
  const cityIds = unique([...(f.place && f.place.kind !== 'india' ? [f.place.id] : []), ...(typed.cityIds ?? [])]);
  return {
    q: parsedText || undefined,
    cityIds: f.near ? undefined : cityIds.length ? cityIds : undefined,
    datePreset: f.datePreset ?? typed.datePreset,
    from: f.datePreset ? undefined : typed.from,
    to: f.datePreset ? undefined : typed.to,
    categoryIds: unique([...(f.categoryId ? [f.categoryId] : []), ...(typed.categoryIds ?? [])]),
    technologyIds: unique([...f.technologyIds, ...(typed.technologyIds ?? [])]),
    industryIds: unique([...f.industryIds, ...(typed.industryIds ?? [])]),
    eventTypes: unique([...(f.eventType ? [f.eventType] : []), ...(typed.eventTypes ?? [])]),
    attendanceModes: f.attendanceModes.length ? f.attendanceModes : typed.attendanceModes,
    price: f.price ?? typed.price,
    minMatch: f.minMatch ?? undefined,
    sort: f.sort ?? (f.near ? 'distance' : undefined),
    lat: f.near?.lat,
    lng: f.near?.lng,
    radiusKm: f.near?.radiusKm,
  };
}

/** What a saved search keeps: the typed text as typed, and the chosen filters (not your location). */
export function toSavedQuery(f: ExploreFilters): SavedSearchQuery {
  const q: SavedSearchQuery = {};
  if (f.q.trim()) q.q = f.q.trim();
  if (f.place && f.place.kind !== 'india') q.cityIds = [f.place.id];
  if (f.datePreset) q.datePreset = f.datePreset;
  if (f.categoryId) q.categoryIds = [f.categoryId];
  if (f.eventType) q.eventTypes = [f.eventType];
  if (f.technologyIds.length) q.technologyIds = f.technologyIds;
  if (f.industryIds.length) q.industryIds = f.industryIds;
  if (f.attendanceModes.length) q.attendanceModes = f.attendanceModes;
  if (f.price) q.price = f.price;
  if (f.minMatch) q.minMatch = f.minMatch;
  if (f.sort && f.sort !== 'distance') q.sort = f.sort;
  return q;
}

function placeFromId(id: string): Place {
  if (getZone(id)) return { kind: 'zone', id: id as Extract<Place, { kind: 'zone' }>['id'] };
  if (REGIONS.some((r) => r.id === id)) return { kind: 'region', id: id as Extract<Place, { kind: 'region' }>['id'] };
  return { kind: 'city', id };
}

/** Explore filters from a saved search (re-running it). */
export function fromSavedQuery(q: SavedSearchQuery): ExploreFilters {
  return {
    ...EMPTY_FILTERS,
    q: q.q ?? '',
    place: q.cityIds?.[0] ? placeFromId(q.cityIds[0]) : null,
    datePreset: q.datePreset ?? null,
    categoryId: q.categoryIds?.[0] ?? null,
    eventType: q.eventTypes?.[0] ?? null,
    technologyIds: q.technologyIds ?? [],
    industryIds: q.industryIds ?? [],
    attendanceModes: q.attendanceModes ?? [],
    price: q.price ?? null,
    minMatch: q.minMatch === 'possible' ? null : (q.minMatch ?? null),
    sort: q.sort ?? null,
  };
}

/** A readable name for a search: "SAP · Delhi NCR · Next 3 Months". */
export function describeSearch(f: ExploreFilters): string {
  // Typed text reads as its recognised parts ("SAP · New Delhi · Next Month"), plus any other words.
  const typed = parseSearch(f.q.trim());
  const parts = [
    typed.text ? `“${typed.text}”` : undefined,
    ...typed.parts.map((p) => p.label),
    ...f.technologyIds.map((id) => getTechnology(id)?.name),
    f.categoryId ? getCategory(f.categoryId)?.name : undefined,
    f.eventType ? EVENT_TYPE_LABELS[f.eventType] : undefined,
    f.place ? placeName(f.place) : undefined,
    f.datePreset ? DATE_PRESET_LABELS[f.datePreset] : undefined,
    f.price === 'free' ? 'Free' : undefined,
    f.attendanceModes.includes('online') ? 'Online' : undefined,
  ].filter((p): p is string => Boolean(p));
  return parts.slice(0, 4).join(' · ') || 'All Events';
}

// Recent searches stay on this phone only (§87).
type RecentState = { recent: string[]; add: (q: string) => void; clear: () => void };
export const useRecentSearches = create<RecentState>()(
  persist(
    (set) => ({
      recent: [],
      add: (q) => set((s) => ({ recent: [q, ...s.recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 8) })),
      clear: () => set({ recent: [] }),
    }),
    { name: 'eii.recentSearches', storage: createJSONStorage(() => safeStorage) },
  ),
);
