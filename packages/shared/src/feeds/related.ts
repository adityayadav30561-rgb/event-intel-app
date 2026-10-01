import type { EventSummary } from '../domain/types';

/**
 * Related events (spec §74): same organizer, technology, category, industry or city.
 * Returns upcoming, verified events, best matches first.
 */
export function relatedEvents<T extends EventSummary>(target: EventSummary, events: T[], now: Date = new Date(), limit = 8): T[] {
  const shared = (a: string[], b: string[]) => a.filter((id) => b.includes(id)).length;
  return events
    .filter((e) => e.id !== target.id && e.verificationStatus === 'verified' && new Date(e.endAt) >= now && e.status !== 'cancelled')
    .map((e) => ({
      event: e,
      score:
        (e.organizer?.id && e.organizer.id === target.organizer?.id ? 3 : 0) +
        shared(e.technologyIds, target.technologyIds) * 3 +
        shared(e.categoryIds, target.categoryIds) * 2 +
        shared(e.industryIds, target.industryIds) +
        (e.cityId === target.cityId ? 2 : 0),
    }))
    .filter((m) => m.score >= 3)
    .sort((a, b) => b.score - a.score || a.event.startAt.localeCompare(b.event.startAt))
    .slice(0, limit)
    .map((m) => m.event);
}
