import { createHash } from 'node:crypto';
import { CITIES, formatDateRange, formatTime, type ChangeField, type ChangeSignificance, type EventChange, type EventDetail } from '@eii/shared';
import type { Db } from '../db/client';

/**
 * Deduplication, merging and change detection (spec §63–66, §101–104; plan §10.2–10.3).
 */

export type Match =
  | { kind: 'existing'; id: string; via: 'source_record' | 'url' | 'similar' }
  | { kind: 'new'; possibleDuplicateOf?: { id: string; score: number } };

/** Comparable form of a URL: no scheme, "www.", query, fragment or trailing slash. */
export const normalizeUrl = (url: string | undefined) =>
  url
    ? url
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '')
    : undefined;

const DAY = 86_400_000;

export async function findMatch(db: Db, sourceId: string, sourceEventId: string, candidate: EventDetail): Promise<Match> {
  // 1. The same source has given us this event before.
  const known = await db.query<{ occurrence_id: string }>(
    `select r.occurrence_id from source_records r join event_occurrences o on o.id = r.occurrence_id
     where r.source_id = $1 and r.source_event_id = $2 and o.deleted_at is null`,
    [sourceId, sourceEventId],
  );
  if (known[0]) return { kind: 'existing', id: known[0].occurrence_id, via: 'source_record' };

  // 2. Another source pointed at the same official page.
  const urls = [candidate.officialWebsite, candidate.registrationUrl].map(normalizeUrl).filter((u): u is string => Boolean(u));
  if (urls.length) {
    const byUrl = await db.query<{ id: string }>(
      `select id from event_occurrences
       where deleted_at is null and not is_demo
         and (regexp_replace(regexp_replace(lower(coalesce(official_website, '')), '^https?://(www\\.)?', ''), '[?#].*$|/+$', '') = any($1::text[])
           or regexp_replace(regexp_replace(lower(coalesce(registration_url, '')), '^https?://(www\\.)?', ''), '[?#].*$|/+$', '') = any($1::text[]))
         and abs(extract(epoch from (start_at - $2::timestamptz))) < $3
       limit 1`,
      [urls, candidate.startAt, 7 * 86_400],
    );
    if (byUrl[0]) return { kind: 'existing', id: byUrl[0].id, via: 'url' };
  }

  // 3. A similar title in the same city (or metro region) within three days.
  const region = CITIES.find((c) => c.id === candidate.cityId)?.region;
  const cityIds = region ? CITIES.filter((c) => c.region === region).map((c) => c.id) : [candidate.cityId];
  const start = new Date(candidate.startAt);
  const rows = await db.query<{ id: string; sim: number; venue: number; org: number; same_day: number }>(
    `select o.id,
       similarity(lower(o.title), lower($1)) as sim,
       (v.name is not null and lower(v.name) = lower($2))::int as venue,
       (org.name is not null and lower(org.name) = lower($3))::int as org,
       ((o.start_at at time zone 'Asia/Kolkata')::date = ($4::timestamptz at time zone 'Asia/Kolkata')::date)::int as same_day
     from event_occurrences o
     left join venues v on v.id = o.venue_id
     left join organizers org on org.id = o.organizer_id
     where o.deleted_at is null and not o.is_demo
       and o.city_id = any($5::text[])
       and o.start_at between $6 and $7
     order by sim desc limit 5`,
    [candidate.title, candidate.venueName ?? '', candidate.organizer?.name ?? '', candidate.startAt, cityIds, new Date(start.getTime() - 3 * DAY), new Date(start.getTime() + 3 * DAY)],
  );
  let best: { id: string; score: number } | undefined;
  for (const r of rows) {
    const sim = Number(r.sim);
    // Near-identical title on the same day in the same place is the same event.
    const score = sim >= 0.9 && r.same_day ? 1 : 0.5 * sim + 0.2 * r.venue + 0.2 * r.org + 0.1 * r.same_day;
    if (!best || score > best.score) best = { id: r.id, score };
  }
  if (best && best.score >= 0.85) return { kind: 'existing', id: best.id, via: 'similar' };
  if (best && best.score >= 0.6) return { kind: 'new', possibleDuplicateOf: best };
  return { kind: 'new' };
}

/** Stable id for an event first seen from a source, so re-running a sync never creates duplicates. */
export const newEventId = (sourceId: string, sourceEventId: string) =>
  `evt_${createHash('sha1').update(`${sourceId}|${sourceEventId}`).digest('hex').slice(0, 14)}`;

/** Fields an authorised person can correct by hand; syncs never overwrite them (spec §103). */
export type OverridableField = 'title' | 'startAt' | 'endAt' | 'venue' | 'registrationUrl' | 'officialWebsite' | 'status' | 'price' | 'description' | 'eventType' | 'city';

type MergeInput = {
  existing: EventDetail;
  incoming: EventDetail;
  /** Incoming source has at least the priority of the event's current primary source. */
  incomingWins: boolean;
  overrides: Set<string>;
  now: Date;
};

const significanceOf = (field: ChangeField, current?: string): ChangeSignificance =>
  field === 'date' || (field === 'status' && ['Cancelled', 'Postponed', 'Rescheduled'].includes(current ?? ''))
    ? 'critical'
    : field === 'venue' || field === 'time' || field === 'registration' || field === 'status'
      ? 'major'
      : 'minor';

const STATUS_TEXT: Record<string, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Happening now',
  completed: 'Completed',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
  rescheduled: 'Rescheduled',
  registration_closed: 'Registration closed',
};

const dayKey = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
const timeKey = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(11, 16);
const dates = (e: EventDetail) => formatDateRange(new Date(e.startAt), new Date(e.endAt));
const times = (e: EventDetail) => (e.allDay ? 'All day' : `${formatTime(new Date(e.startAt))} – ${formatTime(new Date(e.endAt))}`);
const priceText = (e: EventDetail) => (e.price ? JSON.stringify([e.price.min, e.price.max, e.price.note]) : '');

/**
 * Combines what we have with what a source now says. Higher-priority sources replace values;
 * lower-priority ones only fill gaps. Hand corrections always stay. Returns the merged event
 * (with only the newly detected changes in `changes`) and whether anything changed at all.
 */
export function mergeEvent({ existing, incoming, incomingWins, overrides, now }: MergeInput): { merged: EventDetail; changed: boolean } {
  const pick = <K extends keyof EventDetail>(key: K, field?: OverridableField): EventDetail[K] => {
    if (field && overrides.has(field)) return existing[key];
    const next = incoming[key];
    const empty = next === undefined || next === null || (Array.isArray(next) && next.length === 0);
    if (empty) return existing[key];
    const has = existing[key] !== undefined && existing[key] !== null && !(Array.isArray(existing[key]) && (existing[key] as unknown[]).length === 0);
    return incomingWins || !has ? next : existing[key];
  };

  const merged: EventDetail = {
    ...existing,
    title: pick('title', 'title'),
    summary: pick('summary', 'description'),
    description: pick('description', 'description'),
    eventType: pick('eventType', 'eventType'),
    startAt: pick('startAt', 'startAt'),
    endAt: pick('endAt', 'endAt'),
    allDay: overrides.has('startAt') ? existing.allDay : incomingWins ? incoming.allDay : existing.allDay,
    cityId: pick('cityId', 'city'),
    city: pick('city', 'city'),
    state: pick('state', 'city'),
    venue: pick('venue', 'venue'),
    venueName: pick('venueName', 'venue'),
    organizer: pick('organizer'),
    organizerDetail: pick('organizerDetail'),
    attendanceMode: pick('attendanceMode'),
    registrationUrl: pick('registrationUrl', 'registrationUrl'),
    officialWebsite: pick('officialWebsite', 'officialWebsite'),
    price: pick('price', 'price'),
    status: pick('status', 'status'),
    imageUrl: pick('imageUrl'),
    tags: pick('tags'),
    categoryIds: pick('categoryIds'),
    technologyIds: pick('technologyIds'),
    industryIds: pick('industryIds'),
    speakers: pick('speakers'),
    exhibitors: pick('exhibitors'),
    agenda: pick('agenda'),
    // A trusted source confirming the event verifies it; nothing ever un-verifies automatically.
    verificationStatus: existing.verificationStatus === 'verified' || incoming.verificationStatus === 'verified' ? 'verified' : existing.verificationStatus,
    sources: incoming.sources,
    changes: [],
  };

  const changes: EventChange[] = [];
  const add = (field: ChangeField, previous: string | undefined, current: string | undefined) => {
    changes.push({
      id: `${existing.id}_${field}_${now.getTime().toString(36)}`,
      field,
      significance: significanceOf(field, current),
      previous,
      current,
      detectedAt: now.toISOString(),
    });
  };

  if (dayKey(existing.startAt) !== dayKey(merged.startAt) || dayKey(existing.endAt) !== dayKey(merged.endAt)) add('date', dates(existing), dates(merged));
  else if (!merged.allDay && (timeKey(existing.startAt) !== timeKey(merged.startAt) || timeKey(existing.endAt) !== timeKey(merged.endAt))) add('time', times(existing), times(merged));
  if ((existing.venueName ?? '') !== (merged.venueName ?? '')) add('venue', existing.venueName, merged.venueName);
  if ((existing.registrationUrl ?? '') !== (merged.registrationUrl ?? '')) add('registration', existing.registrationUrl ? 'Previous link' : undefined, merged.registrationUrl ? 'New link' : undefined);
  if (existing.status !== merged.status) add('status', STATUS_TEXT[existing.status], STATUS_TEXT[merged.status]);
  if ((existing.organizer?.name ?? '') !== (merged.organizer?.name ?? '')) add('organizer', existing.organizer?.name, merged.organizer?.name);
  if (priceText(existing) !== priceText(merged)) add('price', undefined, undefined);
  if (existing.speakers.length !== merged.speakers.length) add('speakers', String(existing.speakers.length), `${merged.speakers.length} speakers`);
  if (existing.exhibitors.length !== merged.exhibitors.length) add('exhibitors', String(existing.exhibitors.length), `${merged.exhibitors.length} exhibitors`);

  const contentChanged =
    changes.length > 0 ||
    existing.title !== merged.title ||
    existing.description !== merged.description ||
    existing.imageUrl !== merged.imageUrl ||
    existing.officialWebsite !== merged.officialWebsite ||
    existing.verificationStatus !== merged.verificationStatus ||
    existing.categoryIds.join() !== merged.categoryIds.join();

  // The most significant new change becomes the event's "Recently updated" line.
  const rank = { critical: 0, major: 1, minor: 2 };
  const headline = [...changes].sort((a, b) => rank[a.significance] - rank[b.significance])[0];
  merged.changes = changes;
  merged.lastChange = headline && headline.significance !== 'minor' ? { field: headline.field, detectedAt: headline.detectedAt } : existing.lastChange;
  merged.updatedAt = contentChanged ? now.toISOString() : existing.updatedAt;
  return { merged, changed: contentChanged };
}
