import { DEFAULT_PAGE_SIZE, type EventQuery, type Page } from '../contracts/events';
import { datePresetRange, overlapsRange, type DateRange } from '../dates';
import type { EventDetail, EventSummary } from '../domain/types';
import { CITIES, getCity } from '../taxonomy/cities';
import { getZone } from '../taxonomy/zones';
import { queryTokens, scoreEvent, searchFields } from './search';

/**
 * In-memory implementation of the event query (filters, search, sort, cursor pagination).
 * The demo repository uses it directly; the server implements the same rules in SQL.
 */

/** Expands region ids ("delhi-ncr") and zone ids ("zone-south") into their known cities. */
export function expandCityIds(ids: string[] | undefined): Set<string> | undefined {
  if (!ids?.length) return undefined;
  const out = new Set<string>();
  for (const id of ids) {
    const zone = getZone(id);
    const cities = zone ? CITIES.filter((city) => (zone.states as readonly string[]).includes(city.state)) : CITIES.filter((city) => city.region === id);
    if (cities.length) cities.forEach((city) => out.add(city.id));
    else if (!zone) out.add(id);
  }
  return out;
}

/** States of the zones among the place ids, so cities not in the built-in list still match. */
export function zoneStates(ids: string[] | undefined): string[] {
  return (ids ?? []).flatMap((id) => [...(getZone(id)?.states ?? [])]);
}

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function queryRange(query: EventQuery, now: Date): DateRange | undefined {
  if (query.datePreset) return datePresetRange(query.datePreset, now);
  if (query.from || query.to) {
    return {
      from: query.from ? new Date(query.from) : new Date(0),
      to: query.to ? new Date(query.to) : new Date(8.64e15),
    };
  }
  return undefined;
}

const anyOf = (wanted: string[] | undefined, actual: string[]) => !wanted?.length || wanted.some((id) => actual.includes(id));

type Indexed<T> = { event: T; fields: ReturnType<typeof searchFields> };

/** Pre-computes search fields once per event. */
export function indexEvents<T extends EventSummary | EventDetail>(events: T[]): Indexed<T>[] {
  return events.map((event) => ({ event, fields: searchFields(event) }));
}

export function runEventQuery<T extends EventSummary | EventDetail>(
  index: Indexed<T>[],
  query: EventQuery,
  now: Date = new Date(),
): Page<T> {
  const tokens = queryTokens(query.q ?? '');
  const cities = expandCityIds(query.cityIds);
  const states = new Set(zoneStates(query.cityIds));
  const range = queryRange(query, now);
  const near = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng, km: query.radiusKm ?? 50 } : undefined;

  const matches: { event: T; score: number; distance?: number }[] = [];
  for (const { event, fields } of index) {
    if (event.verificationStatus !== 'verified') continue;
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    if (!query.includePast && end < now) continue;
    if (cities && !cities.has(event.cityId) && !states.has(event.state)) continue;
    if (query.attendanceModes?.length && !query.attendanceModes.includes(event.attendanceMode)) continue;
    if (query.price === 'free' && event.price?.min !== 0) continue;
    if (query.price === 'paid' && !(event.price?.min && event.price.min > 0)) continue;
    let distance: number | undefined;
    if (near) {
      const city = getCity(event.cityId);
      if (!city || event.attendanceMode === 'online') continue;
      distance = distanceKm(near.lat, near.lng, city.latitude, city.longitude);
      if (distance > near.km) continue;
    }
    if (!anyOf(query.categoryIds, event.categoryIds)) continue;
    if (!anyOf(query.technologyIds, event.technologyIds)) continue;
    if (!anyOf(query.industryIds, event.industryIds)) continue;
    if (query.eventTypes?.length && !query.eventTypes.includes(event.eventType)) continue;
    if (query.organizerId && event.organizer?.id !== query.organizerId) continue;
    if (range && !overlapsRange(start, end, range)) continue;
    const score = scoreEvent(fields, tokens);
    if (score === 0) continue;
    matches.push({ event: distance !== undefined ? { ...event, distanceKm: Math.round(distance) } : event, score, distance });
  }

  // Best fit for your interests is worked out on the server; sample data falls back to date order.
  const sort = query.sort === 'match' ? 'date' : query.sort === 'distance' && !near ? 'date' : (query.sort ?? (tokens.length ? 'relevance' : 'date'));
  const byDate = (a: { event: T }, b: { event: T }) =>
    a.event.startAt.localeCompare(b.event.startAt) || a.event.id.localeCompare(b.event.id);
  const comparators = {
    date: byDate,
    relevance: (a: { event: T; score: number }, b: { event: T; score: number }) => b.score - a.score || byDate(a, b),
    recently_added: (a: { event: T }, b: { event: T }) => b.event.createdAt.localeCompare(a.event.createdAt) || byDate(a, b),
    recently_updated: (a: { event: T }, b: { event: T }) => b.event.updatedAt.localeCompare(a.event.updatedAt) || byDate(a, b),
    distance: (a: { event: T; distance?: number }, b: { event: T; distance?: number }) => (a.distance ?? 0) - (b.distance ?? 0) || byDate(a, b),
  };
  matches.sort(comparators[sort]);

  const limit = query.limit ?? DEFAULT_PAGE_SIZE;
  const offset = query.cursor ? Math.max(0, Number.parseInt(query.cursor, 10) || 0) : 0;
  const items = matches.slice(offset, offset + limit).map((m) => m.event);
  const next = offset + limit;
  return { items, nextCursor: next < matches.length ? String(next) : null, total: matches.length };
}
