import { getCity, REGIONS } from '../taxonomy/cities';
import { EVENT_TYPE_LABELS, getCategory, getIndustry, getTechnology, type Topic } from '../taxonomy/taxonomy';
import type { EventDetail, EventSummary } from '../domain/types';

/**
 * Keyword search used by the demo repository and as the reference behaviour for the server's
 * full-text search (Phase 2). Every query word must match a word in the event:
 *  - short words (≤ 3 letters, e.g. "SAP", "AI") must match a whole word, so "SAP" never matches "Sapphire";
 *  - longer words may match the start of a word ("manuf" → "Manufacturing").
 */

const STOP_WORDS = new Set(['event', 'events', 'in', 'at', 'the', 'and', 'for', 'of', 'near', 'on', 'a', 'an', 'to']);

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function queryTokens(query: string): string[] {
  return normalizeText(query)
    .split(' ')
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

const topicWords = (topic: Topic | undefined) => (topic ? [topic.name, ...(topic.keywords ?? [])] : []);

/** All searchable words of an event, weighted fields first. */
export function searchFields(event: EventSummary | EventDetail): { title: string; other: string } {
  const city = getCity(event.cityId);
  const region = city?.region ? REGIONS.find((r) => r.id === city.region) : undefined;
  const detail = 'speakers' in event ? event : undefined;
  const other = [
    event.city,
    event.state,
    ...(city?.aliases ?? []),
    // Only the short region code: "ncr" finds Noida and Gurugram, while "delhi" stays New Delhi.
    ...(region ? region.aliases.filter((a) => /^[a-z0-9]+$/.test(a)) : []),
    event.venueName ?? '',
    event.organizer?.name ?? '',
    EVENT_TYPE_LABELS[event.eventType],
    ...event.tags,
    ...event.categoryIds.flatMap((id) => topicWords(getCategory(id))),
    ...event.technologyIds.flatMap((id) => topicWords(getTechnology(id))),
    ...event.industryIds.flatMap((id) => topicWords(getIndustry(id))),
    ...(detail?.speakers.flatMap((s) => [s.name, s.company ?? '']) ?? []),
    ...(detail?.exhibitors.map((e) => e.company) ?? []),
  ].join(' ');
  return { title: normalizeText(event.title), other: normalizeText(other) };
}

const tokenMatches = (token: string, words: string[]) =>
  words.some((word) => (token.length <= 3 ? word === token : word.startsWith(token)));

/**
 * Returns a score > 0 when every token matches, otherwise 0.
 * Title matches count more, so "SAP Transformation Forum" ranks above an expo that merely lists SAP.
 */
export function scoreEvent(fields: { title: string; other: string }, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const titleWords = fields.title.split(' ');
  const otherWords = fields.other.split(' ');
  let score = 0;
  for (const token of tokens) {
    if (tokenMatches(token, titleWords)) score += 3;
    else if (tokenMatches(token, otherWords)) score += 1;
    else return 0;
  }
  return score;
}
