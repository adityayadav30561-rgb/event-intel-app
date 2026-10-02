import { createHash } from 'node:crypto';
import { CITIES, getCategory, getTechnology, normalizeText, type EventDetail, type PaletteId } from '@eii/shared';
import { classifyTopics, classifyType } from './classify';
import type { RawEvent, SourceRow } from './types';

/**
 * Raw source data → the canonical event shape (spec §100). Every fact comes from the source;
 * when something is missing it stays missing (no invented dates, venues, prices or people).
 */

const IST = '+05:30';
const DAY = 86_400_000;

export type SkipReason = 'no_title' | 'test_listing' | 'bad_date' | 'past' | 'too_long' | 'not_india' | 'no_city' | 'irrelevant';
export type Normalized = { ok: true; event: EventDetail; hash: string; newCity?: { id: string; name: string; state: string } } | { ok: false; reason: SkipReason };

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);

const NAMED: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: '’',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  rarr: '→',
  lt: '<',
  gt: '>',
};

/** HTML entities sources leave in text ("&#038;", "&#8217;", "&rsquo;"). */
const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return NAMED[code.toLowerCase()] ?? whole;
    const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    if (n === 39) return '’';
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
  });

const clean = (text: string | undefined, max = 5000) =>
  text
    ? decodeEntities(text.replace(/<[^>]+>/g, ' '))
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim()
        .slice(0, max) || undefined
    : undefined;

/** Parses a source date. Returns the instant and whether it was a date without a time. */
export function parseWhen(value: string | Date | undefined, endOfDay = false): { at: Date; dateOnly: boolean } | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : { at: value, dateOnly: false };
  let s = value.trim();
  // Exactly midnight UTC is how many directories write a date without a time (it would read as
  // 5:30 AM in India). No real event starts then, so treat it as the calendar date.
  const utcMidnight = s.match(/^(\d{4}-\d{2}-\d{2})T00:00(:00(\.0+)?)?(Z|\+00:?00)$/);
  if (utcMidnight) s = utcMidnight[1]!;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // A plain date is a calendar day in India.
    const at = new Date(`${s}T${endOfDay ? '23:59:59' : '00:00:00'}${IST}`);
    return Number.isNaN(at.getTime()) ? undefined : { at, dateOnly: true };
  }
  // Date and time without an offset: local time at the event, i.e. India.
  // ("2026-10-08 08:30:00Z" style values use a space; make them standard ISO first.)
  const iso = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2');
  const withZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}${IST}`;
  const at = new Date(withZone);
  return Number.isNaN(at.getTime()) ? undefined : { at, dateOnly: false };
}

const cityTerms = CITIES.flatMap((c) => [c.name, ...(c.aliases ?? [])].map((term) => ({ id: c.id, term: normalizeText(term) }))).sort(
  (a, b) => b.term.length - a.term.length,
);

/** Known city from an explicit city field, else the first known city named in the address or venue. */
export function resolveCity(raw: Pick<RawEvent, 'city' | 'address' | 'venueName' | 'title'>): string | undefined {
  if (raw.city) {
    const c = normalizeText(raw.city);
    const exact = cityTerms.find((t) => t.term === c);
    if (exact) return exact.id;
  }
  // The title is a last resort ("Odoo Academy: Chennai"); explicit location fields win.
  for (const text of [raw.city, raw.address, raw.venueName, raw.title]) {
    if (!text) continue;
    const hay = ` ${normalizeText(text)} `;
    const hit = cityTerms.find((t) => hay.includes(` ${t.term} `));
    if (hit) return hit.id;
  }
  return undefined;
}

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

/**
 * Removes date and place fragments organisers append to titles
 * ("Technology Senate X | 28th October 2026 | Chandigarh" → "Technology Senate X").
 */
export function tidyTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  // "FMCG Cohort 2026 @ Chennai": the place is kept as the city, not in the name.
  const at = title.match(/^(.+?)\s+@\s+([^@]{2,40})$/);
  if (at && resolveCity({ city: at[2], title: '' })) title = at[1]!;
  // Only "|": dashes are part of real names ("IFEX 2027 – 23rd Indian Foundry Exhibition").
  const parts = title.split(/\s+\|\s+/);
  if (parts.length === 1) return title;
  const isNoise = (part: string) => MONTH.test(part) || /^\d{1,2}(st|nd|rd|th)?\b/.test(part) || Boolean(resolveCity({ city: part, title: '' }));
  const kept = parts.filter((p, i) => i === 0 || !isNoise(p));
  return kept.join(' | ');
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function paletteFor(technologyIds: string[], categoryIds: string[]): PaletteId {
  const tech = technologyIds.map(getTechnology).find((t) => t && !['erp-generic', 'crm-generic'].includes(t.id));
  return tech?.palette ?? getCategory(categoryIds[0] ?? '')?.palette ?? 'blue';
}

/** First sentence of the description, as a short source-backed overview (spec §32). */
function firstSentence(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const sentence = text.split('\n')[0]!.match(/^.{20,240}?[.!?](\s|$)/)?.[0] ?? text.split('\n')[0]!;
  return sentence.length > 260 ? `${sentence.slice(0, 257).trimEnd()}…` : sentence.trim();
}

export function normalize(raw: RawEvent, source: SourceRow, now: Date): Normalized {
  const d = source.config.defaults ?? {};
  const merged: RawEvent = {
    ...raw,
    venueName: raw.venueName ?? d.venueName,
    address: raw.address ?? d.address,
    city: raw.city ?? d.city,
    organizerName: raw.organizerName ?? d.organizerName,
    organizerUrl: raw.organizerUrl ?? d.organizerUrl,
    typeHint: raw.typeHint ?? d.typeHint,
  };

  const title = tidyTitle(clean(merged.title, 200)?.replace(/\s+/g, ' '));
  if (!title) return { ok: false, reason: 'no_title' };
  // Organisers' test listings ("[Test/Sample event] …") are not events.
  if (/^\s*[[(]?\s*(test|sample|dummy|demo)\b/i.test(title) || /\b(test|dummy) event\b/i.test(title)) return { ok: false, reason: 'test_listing' };

  const start = parseWhen(merged.start);
  if (!start) return { ok: false, reason: 'bad_date' };
  let end = parseWhen(merged.end ?? (start.dateOnly ? (merged.start as string) : undefined), true) ?? { at: start.at, dateOnly: start.dateOnly };
  if (end.at < start.at) end = { at: start.at, dateOnly: start.dateOnly };
  if (end.at.getTime() - start.at.getTime() > 60 * DAY) return { ok: false, reason: 'too_long' };
  if (end.at.getTime() < now.getTime() - 30 * DAY) return { ok: false, reason: 'past' };

  const country = merged.country ? normalizeText(merged.country) : '';
  if (country && !['in', 'ind', 'india', 'bharat'].includes(country)) return { ok: false, reason: 'not_india' };

  const online = merged.attendanceMode === 'online';
  // The title as the source wrote it: "… @ Chennai" names the city even though the name drops it.
  let cityId = resolveCity({ ...merged, title: clean(merged.title, 200) ?? title });
  let newCity: { id: string; name: string; state: string } | undefined;
  if (!cityId && merged.city && /^[\p{L} .'-]{2,40}$/u.test(merged.city)) {
    const name = titleCase(merged.city.trim());
    cityId = slugify(name);
    newCity = { id: cityId, name, state: merged.region?.trim() ?? '' };
  }
  if (!cityId && online) cityId = 'online';
  if (!cityId) return { ok: false, reason: 'no_city' };
  const city = CITIES.find((c) => c.id === cityId);

  const description = clean(merged.description);
  const topics = classifyTopics({ title, tags: merged.tags, description });
  const fixed = source.config.topics;
  for (const id of fixed?.technologyIds ?? []) if (!topics.technologyIds.includes(id)) topics.technologyIds.unshift(id);
  for (const id of fixed?.categoryIds ?? []) if (!topics.categoryIds.includes(id)) topics.categoryIds.unshift(id);
  for (const id of fixed?.industryIds ?? []) if (!topics.industryIds.includes(id)) topics.industryIds.unshift(id);
  // Relevant = matches a technology, category or industry the team follows (industrial expos count).
  const ignored = new Set(source.config.ignoreTopics ?? []);
  const counted = (ids: string[]) => ids.filter((id) => !ignored.has(id)).length;
  const anyTopic = counted(topics.categoryIds) + counted(topics.technologyIds) + counted(topics.industryIds) > 0;
  if (source.config.requireTopic !== false && !anyTopic) return { ok: false, reason: 'irrelevant' };
  if (source.config.excludeTitle && new RegExp(source.config.excludeTitle, 'i').test(title)) return { ok: false, reason: 'irrelevant' };
  // Industry-only events still need a category for browsing: trade and manufacturing fairs file under Business & Trade.
  if (topics.categoryIds.length === 0) topics.categoryIds.push(topics.industryIds.includes('manufacturing') ? 'manufacturing' : 'business');

  // Some sources put just the place ("Surat, India") where the venue goes; that isn't a venue.
  const venueText = clean(merged.venueName, 160);
  const placeWords = new Set(
    [city?.name, newCity?.name, merged.city, city?.state, 'india', ...(city?.aliases ?? [])].filter(Boolean).map((s) => normalizeText(s!)),
  );
  const venueIsJustPlace = venueText ? venueText.split(',').every((part) => placeWords.has(normalizeText(part))) : false;
  const venueName = venueIsJustPlace ? undefined : venueText;

  const organizerName = clean(merged.organizerName, 120);
  const organizer = organizerName ? { id: `org_${slugify(organizerName)}`, name: organizerName } : undefined;
  const priceMin = merged.isFree ? 0 : merged.priceMin;
  const hasPrice = priceMin !== undefined || merged.priceMax !== undefined || merged.priceText;
  const startIso = start.at.toISOString();
  const nowIso = now.toISOString();

  const event: EventDetail = {
    id: '',
    slug: slugify(title),
    title,
    eventType: classifyType(merged.typeHint, title),
    startAt: startIso,
    endAt: end.at.toISOString(),
    timezone: merged.timezone || 'Asia/Kolkata',
    allDay: start.dateOnly,
    cityId,
    city: city?.name ?? newCity?.name ?? (cityId === 'online' ? 'Online' : cityId),
    state: city?.state ?? newCity?.state ?? '',
    venueName,
    categoryIds: topics.categoryIds,
    technologyIds: topics.technologyIds,
    industryIds: topics.industryIds,
    tags: (merged.tags ?? []).map((t) => clean(t, 40)!).filter(Boolean).slice(0, 8),
    status: merged.status ?? 'upcoming',
    verificationStatus: source.trusted ? 'verified' : 'needs_verification',
    attendanceMode: merged.attendanceMode ?? 'in_person',
    price: hasPrice ? { min: priceMin, max: merged.priceMax, currency: 'INR', note: merged.isFree ? undefined : clean(merged.priceText, 80) } : undefined,
    organizer,
    imageUrl: merged.imageUrl,
    artwork: { palette: paletteFor(topics.technologyIds, topics.categoryIds), seed: parseInt(createHash('sha1').update(title).digest('hex').slice(0, 6), 16) },
    createdAt: nowIso,
    updatedAt: nowIso,
    isDemo: false,
    summary: firstSentence(description),
    description,
    venue: venueName ? { name: venueName, address: clean(merged.address, 300), latitude: merged.latitude, longitude: merged.longitude } : undefined,
    organizerDetail: organizer ? { ...organizer, website: merged.organizerUrl } : undefined,
    audience: [],
    speakers: [],
    exhibitors: [],
    agenda: [],
    registrationUrl: merged.registrationUrl,
    officialWebsite: merged.officialUrl ?? merged.sourceUrl,
    sources: [{ name: source.name, kind: source.kind === 'demo' ? 'demo' : source.kind, url: merged.sourceUrl, lastCheckedAt: nowIso }],
    changes: [],
  };

  // What the source says, for "did anything change?" — excludes timestamps we set ourselves.
  const hash = createHash('sha1')
    .update(JSON.stringify([event.title, event.startAt, event.endAt, event.venueName, event.cityId, event.organizer?.name, event.registrationUrl, event.officialWebsite, event.price, event.status, event.description, event.imageUrl]))
    .digest('hex');
  return { ok: true, event, hash, newCity };
}
