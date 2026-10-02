import * as cheerio from 'cheerio';
import { resolveCity } from '../normalize';
import type { RawEvent } from '../types';

/**
 * Reads event cards from pages that publish no structured data (venue and association calendars
 * such as BIEC, IICC Yashobhoomi and NASSCOM). Each source says, with CSS selectors, where a card's
 * title, dates and other facts are; this file turns that text into RawEvents. When a site is
 * redesigned only the selectors change, and the source health check reports the drop to zero.
 */

export type CardSelectors = {
  /** One element per event. */
  item: string;
  title: string;
  /** Human date text: "January 21 - 27, 2027", "30 Sep, 2026 - 03 Oct, 2026", "6 - 29 Oct 2026", "05-10-2026 to 07-10-2026". */
  date: string;
  /** Read the date from this attribute of the date element instead of its text (e.g. `datetime`). */
  dateAttr?: string;
  /** When the date shares its element with other text, a regex whose first match is the date. */
  dateMatch?: string;
  /** Link to the event (the item itself when it is an <a> and this is omitted). */
  link?: string;
  /** Daily hours: "9:00am - 6:00pm". */
  time?: string;
  organizer?: string;
  /** A hall inside the venue ("Hall 1 and 2"), the venue itself ("Bharat Mandapam, New Delhi"), or a place ("New Delhi, India"); see `locationKind`. */
  location?: string;
  locationKind?: 'hall' | 'venue' | 'place';
  /** When the location shares its element with other text, a regex; its first group (or whole match) is the location. */
  locationMatch?: string;
  description?: string;
  image?: string;
  /** The source's own label ("Exhibition", "Conference"), used as a type hint. */
  type?: string;
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const monthOf = (word: string) => {
  const i = MONTHS.findIndex((m) => m === word || m.slice(0, 3) === word || (word === 'sept' && m === 'september'));
  return i >= 0 ? i + 1 : undefined;
};

type Part = { day?: number; month?: number; year?: number };

function parsePart(text: string): Part | undefined {
  const part: Part = {};
  const tokens = text
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .split(/[\s,.]+/)
    .filter(Boolean);
  for (const token of tokens) {
    if (/^\d{4}$/.test(token)) part.year = Number(token);
    else if (/^\d{1,2}$/.test(token)) {
      if (part.day !== undefined) return undefined;
      part.day = Number(token);
    } else {
      // Weekdays and filler words are ignored; only whole month names or abbreviations count.
      const month = monthOf(token);
      if (month) part.month = month;
    }
  }
  return part;
}

const pad = (n: number) => String(n).padStart(2, '0');

const isoDate = (p: Required<Part>) => {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  // Rejects impossible dates ("February 30") instead of rolling them over.
  if (d.getUTCMonth() !== p.month - 1 || d.getUTCDate() !== p.day) return undefined;
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/**
 * "January 21 - 27, 2027" → { start: "2027-01-21", end: "2027-01-27" }. Missing months and years
 * on one side come from the other ("6 - 29 Oct 2026"), and a range that crosses New Year
 * ("December 28 - January 2, 2027") starts in the previous year. Returns undefined when unsure.
 */
export function parseDateRange(text: string | undefined): { start: string; end: string } | undefined {
  if (!text) return undefined;
  // Numeric dates: ISO ("2026-10-15") or Indian day-month-year ("05-10-2026", "05/10/2026").
  const numeric = [...text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g)].map((m) =>
    m[1] ? isoDate({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }) : isoDate({ year: Number(m[6]), month: Number(m[5]), day: Number(m[4]) }),
  );
  if (numeric.length) {
    const [start, end = start] = numeric;
    return start && end && end >= start ? { start, end } : undefined;
  }
  const sides = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s*(?:[-–—&]|\bto\b|\btill\b|\buntil\b)\s*/i)
    .filter(Boolean);
  if (sides.length === 0 || sides.length > 2) return undefined;
  const a = parsePart(sides[0]!);
  const b = sides[1] ? parsePart(sides[1]) : a && { ...a };
  if (!a || !b) return undefined;
  const startYearGiven = a.year !== undefined;
  a.month ??= b.month;
  b.month ??= a.month;
  a.year ??= b.year;
  b.year ??= a.year;
  if (a.day === undefined || b.day === undefined || !a.month || !b.month || !a.year || !b.year) return undefined;
  if (!startYearGiven && a.month > b.month) a.year -= 1;
  const start = isoDate(a as Required<Part>);
  const end = isoDate(b as Required<Part>);
  if (!start || !end || end < start) return undefined;
  return { start, end };
}

/** "9:00am - 6:00pm" → { start: "09:00", end: "18:00" }; also "10 AM to 5 PM" and "09:30 - 17:00". */
export function parseTimeRange(text: string | undefined): { start: string; end?: string } | undefined {
  if (!text) return undefined;
  const times = [...text.toLowerCase().matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/g)]
    .map((m) => {
      let hour = Number(m[1]);
      const minute = Number(m[2] ?? 0);
      const meridiem = m[3]?.replace(/\./g, '');
      // A bare number without minutes or am/pm is not a time ("Hall 1").
      if (!m[2] && !meridiem) return undefined;
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      return hour < 24 && minute < 60 ? `${pad(hour)}:${pad(minute)}` : undefined;
    })
    .filter((t): t is string => Boolean(t));
  if (times.length === 0) return undefined;
  return { start: times[0]!, end: times[1] };
}

const textOf = (el: { text(): string } | undefined) =>
  el
    ?.text()
    .replace(/\s+/g, ' ')
    .trim()
    // List numbering ("1. Dubai Connect") and field labels ("Venue : Federation House").
    .replace(/^\d{1,3}\.\s+/, '')
    .replace(/^(venue|date|time|location|place)\s*:\s*/i, '') || undefined;

function matchText(text: string | undefined, pattern: string | undefined) {
  if (!text || !pattern) return text;
  const m = text.match(new RegExp(pattern, 'i'));
  return (m?.[1] ?? m?.[0])?.trim() || undefined;
}

function dateText(el: { text(): string; attr(name: string): string | undefined } | undefined, sel: CardSelectors) {
  const raw = sel.dateAttr ? el?.attr(sel.dateAttr)?.trim() : textOf(el);
  if (!raw || !sel.dateMatch) return raw;
  return raw.match(new RegExp(sel.dateMatch, 'i'))?.[0]?.trim();
}

/** Words that mean "no single place": never a city. */
const NO_PLACE = /^(n\/?a|tba|tbd|multiple( cities| locations)?|various|pan[ -]india|-)$/i;

/** States and union territories: "Bengaluru, Karnataka" is in India, not in a country called Karnataka. */
const INDIA = new Set(
  [
    'India', 'Bharat', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Orissa', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
    'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'NCR', 'Delhi NCR', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry', 'Pondicherry',
  ].map((s) => s.toLowerCase()),
);

/** "New Delhi, India" / "Bengaluru, Karnataka" → city; "Germany" → country; "Online" → online; "Multiple Cities" → nothing. */
function placeFrom(text: string | undefined): Pick<RawEvent, 'city' | 'country' | 'attendanceMode'> {
  if (!text || NO_PLACE.test(text.trim())) return {};
  if (/^(online|virtual)$/i.test(text.trim())) return { attendanceMode: 'online' };
  const parts = text.split(',').map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const last = parts[parts.length - 1]!;
  const inIndia = INDIA.has(last.toLowerCase()) || Boolean(resolveCity({ city: last, title: '' }));
  if (parts.length >= 2) return { city: parts[0], country: inIndia ? 'India' : last };
  // A lone name is a city we know ("Bengaluru"), else a country ("Germany", "India").
  return inIndia ? { city: INDIA.has(last.toLowerCase()) ? undefined : last, country: 'India' } : { country: last };
}

/** Event cards on one page → RawEvents. Cards without a title or readable dates are dropped. */
export function extractCards(html: string, pageUrl: string, sel: CardSelectors, defaultAddress?: string): RawEvent[] {
  const $ = cheerio.load(html);
  const resolve = (href: string | undefined) => {
    if (!href || href.startsWith('javascript:') || href === '#') return undefined;
    try {
      // Some sites write Windows-style paths ("Calendar_event\2k26\x.php").
      return new URL(href.trim().replace(/\\/g, '/'), pageUrl).toString();
    } catch {
      return undefined;
    }
  };

  const cards = $(sel.item)
    .toArray()
    .map((el) => {
      const card = $(el);
      const find = (selector: string | undefined) => (selector ? card.find(selector).first() : undefined);
      const linkEl = sel.link ? find(sel.link) : card.is('a') ? card : undefined;
      const imageEl = find(sel.image);
      return {
        title: textOf(find(sel.title)),
        date: dateText(find(sel.date), sel),
        time: textOf(find(sel.time)),
        link: resolve(linkEl?.attr('href')),
        organizer: textOf(find(sel.organizer)),
        location: matchText(textOf(find(sel.location)), sel.locationMatch),
        description: textOf(find(sel.description)),
        image: resolve(imageEl?.attr('src') ?? imageEl?.attr('data-src')),
        type: textOf(find(sel.type)),
      };
    });

  // A link several cards share (co-located expos on one organiser site) doesn't identify any of them.
  const linkUses = new Map<string, number>();
  for (const c of cards) if (c.link) linkUses.set(c.link, (linkUses.get(c.link) ?? 0) + 1);
  const pageHost = new URL(pageUrl).host;

  const events: RawEvent[] = [];
  for (const c of cards) {
    const dates = parseDateRange(c.date);
    if (!c.title || !dates) continue;
    const hours = parseTimeRange(c.time);
    const ownLink = c.link && linkUses.get(c.link) === 1 ? c.link : undefined;
    const onSourceSite = ownLink ? new URL(ownLink).host === pageHost : false;
    const hall = sel.locationKind === 'hall' ? c.location : undefined;
    const place = sel.locationKind === 'place' ? placeFrom(c.location) : {};
    const slug = c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    events.push({
      // The year keeps next year's edition from replacing this one.
      sourceEventId: `${ownLink ?? `title:${slug}`}|${dates.start.slice(0, 4)}`,
      sourceUrl: onSourceSite ? ownLink : pageUrl,
      officialUrl: onSourceSite ? undefined : ownLink,
      title: c.title,
      description: c.description,
      start: hours ? `${dates.start}T${hours.start}:00` : dates.start,
      end: hours?.end ? `${dates.end}T${hours.end}:00` : dates.end,
      address: hall ? [hall, defaultAddress].filter(Boolean).join(', ') : undefined,
      venueName: sel.locationKind === 'venue' ? c.location : undefined,
      ...place,
      organizerName: c.organizer,
      imageUrl: c.image,
      typeHint: c.type,
      raw: c,
    });
  }
  return events;
}
