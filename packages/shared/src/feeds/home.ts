import type { HomeFeed, HomeQuery } from '../contracts/events';
import { datePresetRange, overlapsRange } from '../dates';
import type { EventDetail, EventSummary } from '../domain/types';
import { expandCityIds } from '../search/filter';

/**
 * Builds the Home feed (spec §9–13) from a set of events. Used by the demo repository;
 * the server builds the same sections with SQL in Phase 2.
 */
export function buildHomeFeed<T extends EventSummary | EventDetail>(
  events: T[],
  query: HomeQuery,
  now: Date = new Date(),
  toSummary: (event: T) => EventSummary = (event) => event,
): HomeFeed {
  const cities = expandCityIds(query.cityIds);
  const visible = events.filter(
    (event) =>
      event.verificationStatus === 'verified' &&
      new Date(event.endAt) >= now &&
      (!cities || cities.has(event.cityId)),
  );
  const byStart = [...visible].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const active = byStart.filter((event) => event.status !== 'cancelled' && event.status !== 'completed');

  const week = datePresetRange('this_week', now);
  const thisWeek = active.filter((event) => overlapsRange(new Date(event.startAt), new Date(event.endAt), week));

  // Featured: the next notable events (larger formats first), skipping what's already in This Week.
  const notable = new Set(['conference', 'summit', 'expo', 'exhibition', 'trade_show', 'industry_forum', 'convention']);
  const thisWeekIds = new Set(thisWeek.map((event) => event.id));
  const upcoming = active.filter((event) => notable.has(event.eventType) && !thisWeekIds.has(event.id)).slice(0, 6);

  const newlyAdded = [...visible]
    .filter((event) => event.status !== 'cancelled')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const recentCutoff = now.getTime() - 7 * 86_400_000;
  const recentlyUpdated = visible
    .filter((event) => event.lastChange && new Date(event.lastChange.detectedAt).getTime() >= recentCutoff)
    .sort((a, b) => (b.lastChange?.detectedAt ?? '').localeCompare(a.lastChange?.detectedAt ?? ''))
    .slice(0, 5);

  const counts = new Map<string, number>();
  for (const event of active) for (const id of event.categoryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const categories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => ({ id, count }));

  return {
    upcoming: upcoming.map(toSummary),
    thisWeek: thisWeek.map(toSummary),
    newlyAdded: newlyAdded.map(toSummary),
    recentlyUpdated: recentlyUpdated.map(toSummary),
    categories,
    generatedAt: now.toISOString(),
  };
}

/** Strips detail-only fields, so lists carry only what cards need. */
export function toEventSummary(event: EventDetail | EventSummary): EventSummary {
  if (!('speakers' in event)) return event;
  const {
    summary: _summary,
    description: _description,
    venue: _venue,
    organizerDetail: _organizerDetail,
    audience: _audience,
    speakers: _speakers,
    exhibitors: _exhibitors,
    agenda: _agenda,
    registrationUrl: _registrationUrl,
    officialWebsite: _officialWebsite,
    sources: _sources,
    changes: _changes,
    lastVerifiedAt: _lastVerifiedAt,
    ...summary
  } = event;
  return summary;
}
