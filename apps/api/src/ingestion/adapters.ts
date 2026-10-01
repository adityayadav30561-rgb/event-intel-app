import { parse as parseCsv } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';
import ical, { type VEvent } from 'node-ical';
import { extractCards } from './extract/cards';
import { extractJsonLdEvents } from './extract/jsonld';
import type { Fetcher, RawEvent, SourceAdapter, SourceRow } from './types';

/**
 * Source adapters (spec §98). Each one turns a source into RawEvents; nothing downstream
 * cares where an event came from.
 */

/** Official pages publishing schema.org Event data; optionally follows listing → detail pages. */
const jsonld: SourceAdapter = {
  id: 'jsonld',
  async read(source: SourceRow, fetcher: Fetcher) {
    const events: RawEvent[] = [];
    const follow = source.config.followLinks;
    const pattern = follow ? new RegExp(follow.pattern) : undefined;
    const detailUrls = new Set<string>();
    for (const url of source.config.urls ?? []) {
      const page = extractJsonLdEvents(await fetcher.text(url), url);
      events.push(...page.events);
      if (pattern) page.links.filter((l) => pattern.test(l)).forEach((l) => detailUrls.add(l));
    }
    // Detail pages are more complete than listing summaries (times with zones, full venue),
    // so an event found on its own page replaces the listing's version of it.
    const detailed: RawEvent[] = [];
    const detailedUrls = new Set<string>();
    for (const url of [...detailUrls].slice(0, follow?.max ?? 40)) {
      try {
        const found = extractJsonLdEvents(await fetcher.text(url), url).events;
        if (found.length) detailedUrls.add(url);
        detailed.push(...found);
      } catch (error) {
        // One unreadable detail page shouldn't fail the whole source.
        if ((error as { retryable?: boolean }).retryable === false) continue;
        throw error;
      }
    }
    const detailedTitles = new Set(detailed.map((e) => e.title.toLowerCase()));
    return [...detailed, ...events.filter((e) => !(e.sourceUrl && detailedUrls.has(e.sourceUrl)) && !detailedTitles.has(e.title.toLowerCase()))];
  },
};

/**
 * iCalendar feeds (.ics). With `followLinks`, the URLs are listing pages and each linked
 * calendar file is read (some organisers publish one .ics per event, e.g. FICCI).
 */
const ics: SourceAdapter = {
  id: 'ics',
  async read(source, fetcher) {
    const events: RawEvent[] = [];
    let feeds = source.config.urls ?? [];
    if (source.config.followLinks) {
      const pattern = new RegExp(source.config.followLinks.pattern);
      const links = new Set<string>();
      for (const page of feeds) extractJsonLdEvents(await fetcher.text(page), page).links.filter((l) => pattern.test(l)).forEach((l) => links.add(l));
      feeds = [...links].slice(0, source.config.followLinks.max ?? 40);
    }
    for (const url of feeds) {
      const data = ical.sync.parseICS(await fetcher.text(url, 'text/calendar, text/plain;q=0.9'));
      for (const item of Object.values(data)) {
        if (!item || item.type !== 'VEVENT') continue;
        const e = item as VEvent;
        const text = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' && 'val' in v ? String((v as { val: unknown }).val) : undefined);
        const isDateOnly = (e.start as Date & { dateOnly?: boolean })?.dateOnly === true || e.datetype === 'date';
        // node-ical builds date-only values at local midnight, so read the calendar date in local
        // time (never via UTC, which shifts a day in timezones ahead of UTC such as India).
        const calendarDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        events.push({
          sourceEventId: e.uid ?? `${url}#${text(e.summary)}#${e.start?.toISOString()}`,
          sourceUrl: typeof e.url === 'string' ? e.url : undefined,
          title: text(e.summary) ?? '',
          description: text(e.description),
          // Date-only events are passed as plain dates so they become all-day in India time.
          start: isDateOnly && e.start ? calendarDate(e.start) : e.start,
          // DTEND of an all-day event is exclusive: the event ends the day before.
          end: isDateOnly && e.end ? calendarDate(new Date(e.end.getFullYear(), e.end.getMonth(), e.end.getDate() - 1)) : e.end,
          timezone: e.start && 'tz' in e.start ? String((e.start as { tz?: string }).tz ?? '') || undefined : undefined,
          address: text(e.location),
          officialUrl: typeof e.url === 'string' ? e.url : undefined,
          status: e.status === 'CANCELLED' ? 'cancelled' : undefined,
          tags: Array.isArray(e.categories) ? e.categories.map(String) : undefined,
          raw: { uid: e.uid, summary: text(e.summary), start: e.start, end: e.end, location: text(e.location), url: e.url },
        });
      }
    }
    return events.filter((e) => e.title);
  },
};

/**
 * RSS/Atom feeds. Feed items rarely carry event dates, so each item's page is read for
 * schema.org Event data; items without it are skipped (we never guess dates).
 */
const rss: SourceAdapter = {
  id: 'rss',
  async read(source, fetcher) {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const events: RawEvent[] = [];
    for (const url of source.config.urls ?? []) {
      const doc = parser.parse(await fetcher.text(url, 'application/rss+xml, application/atom+xml, application/xml;q=0.9'));
      const items: Record<string, unknown>[] = [doc?.rss?.channel?.item, doc?.feed?.entry].flat().filter(Boolean);
      const links = items
        .map((i) => (typeof i.link === 'string' ? i.link : (i.link as { href?: string } | undefined)?.href))
        .filter((l): l is string => Boolean(l))
        .slice(0, source.config.followLinks?.max ?? 30);
      for (const link of links) {
        try {
          events.push(...extractJsonLdEvents(await fetcher.text(link), link).events);
        } catch (error) {
          if ((error as { retryable?: boolean }).retryable === false) continue;
          throw error;
        }
      }
    }
    return events;
  },
};

/**
 * A researcher-maintained Google Sheet (File → Share → Publish to web → CSV), or any CSV URL.
 * Columns: title, start_date, end_date, start_time, end_time, city, venue, address, organizer,
 * official_url, registration_url, event_type, topics, price, description, status.
 */
const curated: SourceAdapter = {
  id: 'curated',
  async read(source, fetcher) {
    const events: RawEvent[] = [];
    for (const url of source.config.urls ?? []) {
      const rows = parseCsv(await fetcher.text(url, 'text/csv, text/plain;q=0.9'), { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase().replace(/\s+/g, '_')), skip_empty_lines: true, trim: true }) as Record<string, string>[];
      for (const [i, r] of rows.entries()) {
        if (!r.title || !r.start_date) continue;
        const at = (date?: string, time?: string) => (date ? (time ? `${date}T${time.length === 5 ? `${time}:00` : time}` : date) : undefined);
        const price = r.price?.toLowerCase();
        events.push({
          sourceEventId: r.id || r.official_url || `${r.title}|${r.start_date}|${r.city}`,
          sourceUrl: r.official_url || undefined,
          title: r.title,
          description: r.description || undefined,
          start: at(r.start_date, r.start_time),
          end: at(r.end_date || r.start_date, r.end_time),
          city: r.city || undefined,
          venueName: r.venue || undefined,
          address: r.address || undefined,
          organizerName: r.organizer || undefined,
          officialUrl: r.official_url || undefined,
          registrationUrl: r.registration_url || undefined,
          typeHint: r.event_type || undefined,
          tags: r.topics ? r.topics.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : undefined,
          isFree: price === 'free' ? true : undefined,
          priceMin: price && /^\d+$/.test(price.replace(/[₹,\s]/g, '')) ? Number(price.replace(/[₹,\s]/g, '')) : undefined,
          priceText: r.price || undefined,
          status: (['cancelled', 'postponed', 'rescheduled'] as const).find((s) => r.status?.toLowerCase() === s),
          raw: { row: i + 2, ...r },
        });
      }
    }
    return events;
  },
};

/**
 * XML sitemaps that list event pages (e.g. KonfHub). Reads only pages changed since the last
 * successful run (by <lastmod>), newest first, capped per run; each page's schema.org data is used.
 */
const sitemap: SourceAdapter = {
  id: 'sitemap',
  async read(source, fetcher) {
    const parser = new XMLParser({ ignoreAttributes: true });
    const pattern = new RegExp(source.config.sitemap?.pattern ?? '.');
    const max = source.config.sitemap?.max ?? 60;
    const since = source.lastSuccessAt ? new Date(source.lastSuccessAt).getTime() : 0;
    const entries: { loc: string; lastmod: number }[] = [];
    const queue = [...(source.config.urls ?? [])];
    for (let read = 0; queue.length && read < 6; read++) {
      const doc = parser.parse(await fetcher.text(queue.shift()!, 'application/xml, text/xml;q=0.9'));
      // A sitemap index points at further sitemaps.
      for (const child of [doc?.sitemapindex?.sitemap].flat().filter(Boolean)) if (child.loc) queue.push(String(child.loc));
      for (const url of [doc?.urlset?.url].flat().filter(Boolean)) {
        const loc = String(url.loc ?? '');
        if (!loc || !pattern.test(loc)) continue;
        entries.push({ loc, lastmod: url.lastmod ? Date.parse(String(url.lastmod)) || 0 : 0 });
      }
    }
    const fresh = entries.filter((e) => !since || !e.lastmod || e.lastmod > since).sort((a, b) => b.lastmod - a.lastmod);
    const events: RawEvent[] = [];
    for (const { loc } of fresh.slice(0, max)) {
      try {
        events.push(...extractJsonLdEvents(await fetcher.text(loc), loc).events);
      } catch (error) {
        if ((error as { retryable?: boolean }).retryable === false) continue;
        throw error;
      }
    }
    return events;
  },
};

/** confs.tech open conference data (MIT-licensed JSON on GitHub), filtered to one country. */
const confstech: SourceAdapter = {
  id: 'confstech',
  async read(source, fetcher) {
    const country = (source.config.country ?? 'India').toLowerCase();
    const events: RawEvent[] = [];
    for (const url of source.config.urls ?? []) {
      let body: string;
      try {
        body = await fetcher.text(url, 'application/json, text/plain;q=0.9');
      } catch (error) {
        // A topic file for a future year may not exist yet; skip it, keep the rest.
        if ((error as { status?: number }).status === 404) continue;
        throw error;
      }
      const list = JSON.parse(body) as {
        name?: string;
        url?: string;
        startDate?: string;
        endDate?: string;
        city?: string;
        country?: string;
        online?: boolean;
      }[];
      for (const c of list) {
        if (!c.name || !c.startDate || (c.country ?? '').toLowerCase() !== country) continue;
        events.push({
          sourceEventId: c.url ?? `${c.name}|${c.startDate}`,
          sourceUrl: c.url,
          title: c.name,
          start: c.startDate,
          end: c.endDate ?? c.startDate,
          city: c.city,
          country: c.country,
          officialUrl: c.url,
          attendanceMode: c.online ? 'hybrid' : 'in_person',
          typeHint: 'conference',
          raw: c,
        });
      }
    }
    return events;
  },
};

/** "{today}" and "{today+365d}" in a URL → India dates ("2026-10-01"), for listings filtered by a date window. */
export function expandDateTokens(url: string, now = new Date()): string {
  return url.replace(/\{today(?:\+(\d+)d)?\}/g, (_m, days?: string) =>
    new Date(now.getTime() + 19_800_000 + Number(days ?? 0) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Event cards on pages without structured data (venue and association calendars); selectors come from the source. */
const cards: SourceAdapter = {
  id: 'cards',
  async read(source, fetcher) {
    const selectors = source.config.cards;
    if (!selectors) throw new Error(`Source ${source.id} has no card selectors`);
    const events: RawEvent[] = [];
    for (const template of source.config.urls ?? []) {
      const url = expandDateTokens(template);
      events.push(...extractCards(await fetcher.text(url), url, selectors, source.config.defaults?.address));
    }
    return events;
  },
};

export const ADAPTERS: Record<string, SourceAdapter> = { jsonld, ics, rss, curated, sitemap, confstech, cards };
