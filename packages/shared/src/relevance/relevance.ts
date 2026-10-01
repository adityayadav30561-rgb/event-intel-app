import type { EventSummary, EventType } from '../domain/types';
import { CITIES } from '../taxonomy/cities';
import { EVENT_TYPE_LABELS, getCategory, getIndustry, getTechnology } from '../taxonomy/taxonomy';

/**
 * Relevance (docs/DEVELOPMENT_PLAN.md §10.1): how well an event fits what someone follows, with
 * plain reasons. The same rules run on the phone (badges, re-ranking as soon as interests
 * change, offline) and on the server ("Events you may want to track").
 */

export type Preferences = {
  cityIds: string[];
  categoryIds: string[];
  technologyIds: string[];
  industryIds: string[];
  eventTypes: EventType[];
};

export const EMPTY_PREFERENCES: Preferences = { cityIds: [], categoryIds: [], technologyIds: [], industryIds: [], eventTypes: [] };

export type RelevanceLevel = 'strong' | 'good' | 'possible';

export type Relevance = {
  level: RelevanceLevel;
  score: number;
  /** Most important first, at most four ("SAP-focused", "In Hyderabad"). */
  reasons: string[];
};

export const RELEVANCE_LABELS: Record<RelevanceLevel, string> = {
  strong: 'Strong match',
  good: 'Good match',
  possible: 'Possible match',
};

/** Points per signal. One place to tune them with real use. */
export const RELEVANCE_WEIGHTS = {
  technology: 3,
  maxTechnologies: 2,
  category: 2,
  maxCategories: 2,
  industry: 2,
  place: 2,
  eventType: 1,
  strongFrom: 7,
  goodFrom: 4,
} as const;

const regionOf = (cityId: string) => CITIES.find((c) => c.id === cityId)?.region;

export const hasPreferences = (p: Preferences | undefined): p is Preferences =>
  Boolean(p && (p.cityIds.length || p.categoryIds.length || p.technologyIds.length || p.industryIds.length || p.eventTypes.length));

/** Relevance of one event, or undefined when nothing matches (no badge). */
export function scoreRelevance(
  event: Pick<EventSummary, 'technologyIds' | 'categoryIds' | 'industryIds' | 'cityId' | 'city' | 'eventType'>,
  prefs: Preferences | undefined,
): Relevance | undefined {
  if (!hasPreferences(prefs)) return undefined;
  const w = RELEVANCE_WEIGHTS;
  const signals: { points: number; reason: string }[] = [];

  const techs = event.technologyIds.filter((id) => prefs.technologyIds.includes(id)).slice(0, w.maxTechnologies);
  for (const id of techs) signals.push({ points: w.technology, reason: `${getTechnology(id)?.name ?? id}-focused` });

  const categories = event.categoryIds.filter((id) => prefs.categoryIds.includes(id)).slice(0, w.maxCategories);
  for (const id of categories) signals.push({ points: w.category, reason: `About ${getCategory(id)?.name ?? id}` });

  const industry = event.industryIds.find((id) => prefs.industryIds.includes(id));
  if (industry) signals.push({ points: w.industry, reason: `${getIndustry(industry)?.name ?? industry} audience` });

  if (prefs.cityIds.includes(event.cityId)) signals.push({ points: w.place, reason: event.cityId === 'online' ? 'Online' : `In ${event.city}` });
  else {
    // A preferred city's metro region counts too: following New Delhi includes Noida and Gurugram.
    const region = regionOf(event.cityId);
    if (region && prefs.cityIds.some((id) => regionOf(id) === region)) signals.push({ points: w.place, reason: `In ${event.city}, near you` });
  }

  if (prefs.eventTypes.includes(event.eventType)) signals.push({ points: w.eventType, reason: `${EVENT_TYPE_LABELS[event.eventType]}, a format you follow` });

  const score = signals.reduce((sum, s) => sum + s.points, 0);
  if (score === 0) return undefined;
  const level: RelevanceLevel = score >= w.strongFrom ? 'strong' : score >= w.goodFrom ? 'good' : 'possible';
  // Stable sort: equal points keep the order above (technology, topic, industry, place, format).
  const reasons = [...signals].sort((a, b) => b.points - a.points).slice(0, 4).map((s) => s.reason);
  return { level, score, reasons };
}

/** Events sorted best match first (then by date), each with its relevance; non-matches dropped. */
export function rankByRelevance<T extends EventSummary>(events: T[], prefs: Preferences | undefined): (T & { relevance: Relevance })[] {
  return events
    .map((event) => ({ ...event, relevance: scoreRelevance(event, prefs) }))
    .filter((e): e is T & { relevance: Relevance } => Boolean(e.relevance))
    .sort((a, b) => b.relevance.score - a.relevance.score || a.startAt.localeCompare(b.startAt));
}

/** "Because you follow SAP and Manufacturing": a one-line summary of the user's interests. */
export function describePreferences(prefs: Preferences | undefined, max = 2): string | undefined {
  if (!hasPreferences(prefs)) return undefined;
  const names = [
    ...prefs.technologyIds.map((id) => getTechnology(id)?.name),
    ...prefs.categoryIds.map((id) => getCategory(id)?.name),
    ...prefs.industryIds.map((id) => getIndustry(id)?.name),
  ].filter((n): n is string => Boolean(n));
  if (!names.length) return undefined;
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(' and ');
}
