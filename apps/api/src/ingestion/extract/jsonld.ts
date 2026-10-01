import * as cheerio from 'cheerio';
import type { AttendanceMode, EventStatus } from '@eii/shared';
import type { RawEvent } from '../types';

/**
 * Reads schema.org Event data that sites publish for search engines (JSON-LD in
 * <script type="application/ld+json">). This is the most reliable, permission-friendly way to
 * read an official event page: it's structured, intended for machines, and carries dates with timezones.
 */

type Json = Record<string, unknown>;

const EVENT_TYPES = new Set([
  'Event',
  'BusinessEvent',
  'ExhibitionEvent',
  'EducationEvent',
  'SocialEvent',
  'Festival',
  'Hackathon',
  'CourseInstance',
  'SaleEvent',
  'PublicationEvent',
  'ScreeningEvent',
  'DeliveryEvent',
  'LiteraryEvent',
  'MusicEvent',
  'SportsEvent',
  'TheaterEvent',
  'VisualArtsEvent',
  'ComedyEvent',
  'DanceEvent',
  'FoodEvent',
  'ChildrensEvent',
]);

const asArray = <T>(value: T | T[] | undefined | null): T[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
const str = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '@value' in value) return str((value as Json)['@value']);
  return undefined;
};
const typesOf = (node: Json) => asArray(node['@type'] as string | string[]).map((t) => String(t).replace(/^schema:|^https?:\/\/schema\.org\//, ''));

/** All Event-like nodes in a JSON-LD document, including inside @graph and nested arrays. */
function collectEvents(value: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(value)) value.forEach((v) => collectEvents(v, out));
  else if (value && typeof value === 'object') {
    const node = value as Json;
    if (typesOf(node).some((t) => EVENT_TYPES.has(t))) out.push(node);
    if (node['@graph']) collectEvents(node['@graph'], out);
    // ItemList of events (common on listing pages)
    for (const item of asArray(node.itemListElement as unknown)) collectEvents((item as Json)?.item ?? item, out);
  }
  return out;
}

const STATUS: Record<string, EventStatus> = {
  EventCancelled: 'cancelled',
  EventPostponed: 'postponed',
  EventRescheduled: 'rescheduled',
  EventMovedOnline: 'upcoming',
  EventScheduled: 'upcoming',
};
const MODE: Record<string, AttendanceMode> = {
  OfflineEventAttendanceMode: 'in_person',
  OnlineEventAttendanceMode: 'online',
  MixedEventAttendanceMode: 'hybrid',
};
const enumValue = (value: unknown) => str(value)?.split('/').pop();

function toRaw(node: Json, pageUrl: string): RawEvent | null {
  const title = str(node.name);
  if (!title) return null;
  const location = asArray(node.location as Json | Json[]).find((l) => l && typeof l === 'object') as Json | undefined;
  const isVirtual = location ? typesOf(location).includes('VirtualLocation') : false;
  const address = location?.address;
  const addr = (address && typeof address === 'object' ? address : {}) as Json;
  const geo = (location?.geo ?? {}) as Json;
  const organizer = asArray(node.organizer as Json | Json[])[0];
  const offers = asArray(node.offers as Json | Json[]);
  const prices = offers.map((o) => Number(str(o?.price) ?? str(o?.lowPrice))).filter((n) => Number.isFinite(n));
  const highs = offers.map((o) => Number(str(o?.highPrice))).filter((n) => Number.isFinite(n));
  const url = str(node.url) ? new URL(str(node.url)!, pageUrl).toString() : pageUrl;
  const image = asArray(node.image as unknown)[0];
  const modeKey = enumValue(node.eventAttendanceMode);

  return {
    sourceEventId: str(node['@id']) ?? url,
    sourceUrl: url,
    title,
    description: str(node.description),
    start: str(node.startDate),
    end: str(node.endDate),
    venueName: isVirtual ? undefined : str(location?.name),
    address: typeof address === 'string' ? address : [str(addr.streetAddress), str(addr.addressLocality), str(addr.addressRegion), str(addr.postalCode)].filter(Boolean).join(', ') || undefined,
    city: str(addr.addressLocality),
    region: str(addr.addressRegion),
    country: str(addr.addressCountry) ?? str((addr.addressCountry as Json | undefined)?.name),
    latitude: Number(str(geo.latitude)) || undefined,
    longitude: Number(str(geo.longitude)) || undefined,
    organizerName: typeof organizer === 'string' ? organizer : str(organizer?.name),
    organizerUrl: typeof organizer === 'object' ? str(organizer?.url) : undefined,
    imageUrl: typeof image === 'string' ? image : str((image as Json | undefined)?.url),
    officialUrl: url,
    registrationUrl: str(offers.find((o) => str(o?.url))?.url),
    priceMin: prices.length ? Math.min(...prices) : undefined,
    priceMax: highs.length ? Math.max(...highs) : prices.length > 1 ? Math.max(...prices) : undefined,
    currency: str(offers[0]?.priceCurrency),
    isFree: node.isAccessibleForFree === true || node.isAccessibleForFree === 'true' || (prices.length > 0 && prices.every((p) => p === 0)),
    attendanceMode: modeKey ? MODE[modeKey] : isVirtual ? 'online' : undefined,
    status: STATUS[enumValue(node.eventStatus) ?? ''],
    typeHint: typesOf(node).find((t) => t !== 'Event') ?? str(node.eventType),
    tags: asArray(node.keywords as string | string[])
      .flatMap((k) => String(k).split(','))
      .map((k) => k.trim())
      .filter(Boolean),
    raw: node,
  };
}

/**
 * schema.org microdata (itemscope/itemprop attributes), used by some sites (e.g. Odoo) instead of
 * JSON-LD. Converted into the same JSON shape so one mapper handles both.
 */
function microdataEvents($: cheerio.CheerioAPI): Json[] {
  /** Element text with spaces between child elements, so "<span>Nungambakkam</span><span>Chennai</span>" doesn't run together. */
  const spacedText = (el: cheerio.Cheerio<never>) =>
    el
      .find('*')
      .addBack()
      .contents()
      .toArray()
      .filter((n) => n.type === 'text')
      .map((n) => (n as unknown as { data: string }).data.trim())
      .filter(Boolean)
      .join(' ');
  const valueOf = (el: cheerio.Cheerio<never>): unknown => {
    if (el.attr('itemscope') !== undefined) return toJson(el);
    return el.attr('content') ?? el.attr('datetime') ?? el.attr('href') ?? el.attr('src') ?? spacedText(el);
  };
  const toJson = (scope: cheerio.Cheerio<never>): Json => {
    const out: Json = { '@type': (scope.attr('itemtype') ?? '').split('/').pop() };
    scope.find('[itemprop]').each((_, node) => {
      const el = $(node) as cheerio.Cheerio<never>;
      // Only direct properties of this scope, not of nested items.
      if (!el.parent().closest('[itemscope]').is(scope)) return;
      const key = el.attr('itemprop')!;
      if (out[key] === undefined) out[key] = valueOf(el);
    });
    return out;
  };
  const events: Json[] = [];
  $('[itemscope][itemtype]').each((_, node) => {
    const el = $(node) as cheerio.Cheerio<never>;
    const type = (el.attr('itemtype') ?? '').split('/').pop() ?? '';
    if (EVENT_TYPES.has(type) && el.parent().closest('[itemscope]').length === 0) events.push(toJson(el));
  });
  return events;
}

const hasZone = (v: unknown) => typeof v === 'string' && /([zZ]|[+-]\d{2}:?\d{2})$/.test(v.trim());

/**
 * Some pages describe the same event in several blocks (e.g. Odoo: one block with a time zone
 * and the venue, another without either). Blocks with the same title become one event, filling
 * gaps from each other and always preferring dates that state their time zone — a date without
 * a zone could be UTC or local, and guessing wrong shifts the event by hours.
 */
function mergeSameEvent(events: RawEvent[]): RawEvent[] {
  const byTitle = new Map<string, RawEvent>();
  for (const e of events) {
    const key = e.title.toLowerCase();
    const prev = byTitle.get(key);
    if (!prev) {
      byTitle.set(key, { ...e });
      continue;
    }
    for (const [k, v] of Object.entries(e) as [keyof RawEvent, unknown][]) {
      if (k === 'start' || k === 'end') {
        if (v && (!prev[k] || (!hasZone(prev[k]) && hasZone(v)))) (prev as Record<string, unknown>)[k] = v;
      } else if (prev[k] === undefined || prev[k] === '') (prev as Record<string, unknown>)[k] = v;
    }
  }
  return [...byTitle.values()];
}

/** Events described on a page (JSON-LD or microdata), and the page's links (for following listing pages to detail pages). */
export function extractJsonLdEvents(html: string, pageUrl: string): { events: RawEvent[]; links: string[] } {
  const $ = cheerio.load(html);
  const events: RawEvent[] = [];
  for (const node of microdataEvents($)) {
    const raw = toRaw(node, pageUrl);
    if (raw) events.push(raw);
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text();
    try {
      for (const node of collectEvents(JSON.parse(text))) {
        const raw = toRaw(node, pageUrl);
        if (raw) events.push(raw);
      }
    } catch {
      /* invalid JSON-LD on this page: ignore that block */
    }
  });
  const links = new Set<string>();
  const merged = mergeSameEvent(events);
  events.length = 0;
  events.push(...merged);
  $('a[href]').each((_, el) => {
    try {
      links.add(new URL($(el).attr('href')!, pageUrl).toString().split('#')[0]!);
    } catch {
      /* bad href */
    }
  });
  return { events, links: [...links] };
}

/** Fallback for "Add by URL" when a page has no structured data: title, description and image from meta tags. */
export function extractMeta(html: string, pageUrl: string): Partial<RawEvent> {
  const $ = cheerio.load(html);
  const meta = (name: string) => $(`meta[property="${name}"], meta[name="${name}"]`).attr('content')?.trim() || undefined;
  return {
    title: meta('og:title') ?? ($('title').first().text().trim() || undefined),
    description: meta('og:description') ?? meta('description'),
    imageUrl: meta('og:image'),
    officialUrl: meta('og:url') ?? pageUrl,
    sourceUrl: pageUrl,
  };
}
