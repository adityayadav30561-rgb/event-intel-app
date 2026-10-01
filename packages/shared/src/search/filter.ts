import { DEFAULT_PAGE_SIZE, type EventQuery, type Page } from '../contracts/events';
import { datePresetRange, overlapsRange, type DateRange } from '../dates';
import type { EventDetail, EventSummary } from '../domain/types';
import { CITIES } from '../taxonomy/cities';
import { queryTokens, scoreEvent, searchFields } from './search';

/**
 * In-memory implementation of the event query (filters, search, sort, cursor pagination).
 * The demo repository uses it directly; the server implements the same rules in SQL.
 */

/** Expands region ids (e.g. "delhi-ncr") into their cities. */
export function expandCityIds(ids: string[] | undefined): Set<string> | undefined {
  if (!ids?.length) return undefined;
  const out = new Set<string>();
  for (const id of ids) {
    const regionCities = CITIES.filter((city) => city.region === id);
    if (regionCities.length) regionCities.forEach((city) => out.add(city.id));
    else out.add(id);
  }
  return out;
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
  const range = queryRange(query, now);

  const matches: { event: T; score: number }[] = [];
  for (const { event, fields } of index) {
    if (event.verificationStatus !== 'verified') continue;
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    if (!query.includePast && end < now) continue;
    if (cities && !cities.has(event.cityId)) continue;
    if (!anyOf(query.categoryIds, event.categoryIds)) continue;
    if (!anyOf(query.technologyIds, event.technologyIds)) continue;
    if (!anyOf(query.industryIds, event.industryIds)) continue;
    if (query.eventTypes?.length && !query.eventTypes.includes(event.eventType)) continue;
    if (query.organizerId && event.organizer?.id !== query.organizerId) continue;
    if (range && !overlapsRange(start, end, range)) continue;
    const score = scoreEvent(fields, tokens);
    if (score === 0) continue;
    matches.push({ event, score });
  }

  const sort = query.sort ?? (tokens.length ? 'relevance' : 'date');
  const byDate = (a: { event: T }, b: { event: T }) =>
    a.event.startAt.localeCompare(b.event.startAt) || a.event.id.localeCompare(b.event.id);
  const comparators = {
    date: byDate,
    relevance: (a: { event: T; score: number }, b: { event: T; score: number }) => b.score - a.score || byDate(a, b),
    recently_added: (a: { event: T }, b: { event: T }) => b.event.createdAt.localeCompare(a.event.createdAt) || byDate(a, b),
    recently_updated: (a: { event: T }, b: { event: T }) => b.event.updatedAt.localeCompare(a.event.updatedAt) || byDate(a, b),
  };
  matches.sort(comparators[sort]);

  const limit = query.limit ?? DEFAULT_PAGE_SIZE;
  const offset = query.cursor ? Math.max(0, Number.parseInt(query.cursor, 10) || 0) : 0;
  const items = matches.slice(offset, offset + limit).map((m) => m.event);
  const next = offset + limit;
  return { items, nextCursor: next < matches.length ? String(next) : null, total: matches.length };
}
