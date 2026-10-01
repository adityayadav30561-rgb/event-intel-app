import {
  EVENT_TYPE_LABELS,
  getCategory,
  getCity,
  getIndustry,
  getTechnology,
  normalizeText,
  REGIONS,
  type EventDetail,
  type Topic,
} from '@eii/shared';

const topicWords = (topic: Topic | undefined) => (topic ? [topic.name, ...(topic.keywords ?? [])] : []);

/**
 * Text indexed for full-text search, by weight (A strongest). Mirrors the shared keyword search:
 * title first; topics, place and organizer next; venue and people; then descriptions.
 * Everything is normalised the same way queries are, so "S/4HANA" and "s 4hana" meet.
 */
export function searchDocument(event: EventDetail) {
  const city = getCity(event.cityId);
  const region = city?.region ? REGIONS.find((r) => r.id === city.region) : undefined;
  const b = [
    ...event.tags,
    ...event.categoryIds.flatMap((id) => topicWords(getCategory(id))),
    ...event.technologyIds.flatMap((id) => topicWords(getTechnology(id))),
    ...event.industryIds.flatMap((id) => topicWords(getIndustry(id))),
    event.city,
    event.state,
    ...(city?.aliases ?? []),
    // Only short region codes ("ncr"): "delhi" must keep meaning New Delhi.
    ...(region ? region.aliases.filter((a) => /^[a-z0-9]+$/.test(a)) : []),
    event.organizer?.name ?? '',
    EVENT_TYPE_LABELS[event.eventType],
  ];
  const c = [
    event.venue?.name ?? event.venueName ?? '',
    ...event.speakers.flatMap((s) => [s.name, s.company ?? '']),
    ...event.exhibitors.map((x) => x.company),
  ];
  const d = [event.summary ?? '', event.description ?? ''];
  return {
    a: normalizeText(event.title),
    b: normalizeText(b.join(' ')),
    c: normalizeText(c.join(' ')),
    d: normalizeText(d.join(' ')),
    /** Short text for typo-tolerant trigram matching. */
    trigram: normalizeText([event.title, event.city, event.organizer?.name ?? '', ...event.tags].join(' ')),
  };
}
