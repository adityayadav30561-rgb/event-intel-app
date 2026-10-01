import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type Db } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { seedReference } from '../src/db/seed';
import { createFetcher } from '../src/ingestion/fetcher';
import { runEventSync } from '../src/ingestion/sync';
import { FetchError, type Fetcher } from '../src/ingestion/types';

const NOW = new Date('2026-10-01T05:00:00Z');
let db: Db;

/** Serves fixture pages by URL; anything else is a 404. `fail` simulates an outage. */
function fakeFetcher(pages: Record<string, string>, fail = new Set<string>()): Fetcher {
  return {
    async text(url) {
      if (fail.has(url)) throw new FetchError('HTTP 503', url, 503, true);
      const body = pages[url];
      if (body === undefined) throw new FetchError('HTTP 404', url, 404, false);
      return body;
    },
  };
}

const jsonLdPage = (...events: object[]) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': events })}</script></head><body></body></html>`;

const sapSummit = (venue = 'HITEX Exhibition Centre', extra: object = {}) => ({
  '@type': 'BusinessEvent',
  '@id': 'https://example.org/events/sap-summit-hyd',
  name: 'SAP S/4HANA Summit Hyderabad 2026',
  description: 'A one-day conference for SAP customers in manufacturing.',
  startDate: '2026-11-12T09:30:00+05:30',
  endDate: '2026-11-12T17:30:00+05:30',
  eventStatus: 'https://schema.org/EventScheduled',
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  location: { '@type': 'Place', name: venue, address: { '@type': 'PostalAddress', addressLocality: 'Hyderabad', addressCountry: 'IN' } },
  organizer: { '@type': 'Organization', name: 'Example Forums', url: 'https://example.org' },
  offers: { '@type': 'Offer', price: '4999', priceCurrency: 'INR', url: 'https://example.org/register/sap' },
  url: 'https://example.org/events/sap-summit-hyd',
  ...extra,
});

const weddingExpo = {
  '@type': 'ExhibitionEvent',
  name: 'Grand Wedding Fair',
  startDate: '2026-11-20',
  endDate: '2026-11-22',
  location: { '@type': 'Place', name: 'HITEX', address: { addressLocality: 'Hyderabad', addressCountry: 'IN' } },
};

async function addSource(id: string, adapter: string, urls: string[], extra: { priority?: number; trusted?: boolean; requireTopic?: boolean } = {}) {
  await db.query(
    `insert into sources (id, name, adapter, kind, config, priority, enabled, trusted) values ($1, $2, $3, 'official_event', $4, $5, true, $6)`,
    [id, id, adapter, JSON.stringify({ urls, requireTopic: extra.requireTopic }), extra.priority ?? 50, extra.trusted ?? true],
  );
}

const count = async (sql: string, params: unknown[] = []) => (await db.query<{ n: number }>(sql, params))[0]!.n;
const sync = (fetcher: Fetcher, now = NOW) => runEventSync(db, { now, fetcher, retryDelaysMs: [0] });

beforeEach(async () => {
  db = await createPgliteDb('memory');
  await migrate(db);
  await seedReference(db);
});

afterAll(async () => {
  await db?.close();
});

describe('sync pipeline', () => {
  it('imports relevant events and skips irrelevant ones', async () => {
    await addSource('venue', 'jsonld', ['https://example.org/events']);
    const result = await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit(), weddingExpo) }));
    expect(result.status).toBe('success');
    expect(result.created).toBe(1);
    expect(result.skipReasons.irrelevant).toBe(1);

    const [event] = await db.query<{ title: string; city_id: string; event_type: string; price_min: number; verification_status: string; start_at: Date }>(
      'select title, city_id, event_type, price_min, verification_status, start_at from event_occurrences',
    );
    expect(event).toMatchObject({ title: 'SAP S/4HANA Summit Hyderabad 2026', city_id: 'hyderabad', event_type: 'summit', price_min: 4999, verification_status: 'verified' });
    expect(new Date(event!.start_at).toISOString()).toBe('2026-11-12T04:00:00.000Z');
    const topics = await db.query<{ id: string }>('select technology_id as id from occurrence_technologies');
    expect(topics.map((t) => t.id)).toContain('sap');
    expect(await count('select count(*)::int as n from source_records')).toBe(1);
  });

  it('is idempotent: a second run creates and updates nothing', async () => {
    await addSource('venue', 'jsonld', ['https://example.org/events']);
    const fetcher = fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit()) });
    await sync(fetcher);
    const second = await sync(fetcher);
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(await count('select count(*)::int as n from event_occurrences')).toBe(1);
    expect(await count('select count(*)::int as n from event_changes')).toBe(0);
  });

  it('records a venue change once, keeping the previous value', async () => {
    await addSource('venue', 'jsonld', ['https://example.org/events']);
    await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit()) }));
    const later = new Date(NOW.getTime() + 12 * 3_600_000);
    const result = await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit('Hyderabad International Convention Centre')) }), later);
    expect(result.updated).toBe(1);
    const changes = await db.query<{ field: string; old_value: string; new_value: string; significance: string }>('select field, old_value, new_value, significance from event_changes');
    expect(changes).toEqual([{ field: 'venue', old_value: 'HITEX Exhibition Centre', new_value: 'Hyderabad International Convention Centre', significance: 'major' }]);
    const [row] = await db.query<{ last_change_field: string }>('select last_change_field from event_occurrences');
    expect(row!.last_change_field).toBe('venue');
  });

  it('marks cancellations as critical changes', async () => {
    await addSource('venue', 'jsonld', ['https://example.org/events']);
    await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit()) }));
    const result = await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit(undefined, { eventStatus: 'https://schema.org/EventCancelled' })) }));
    expect(result.cancelled).toBe(1);
    const [change] = await db.query<{ field: string; significance: string; new_value: string }>('select field, significance, new_value from event_changes');
    expect(change).toEqual({ field: 'status', significance: 'critical', new_value: 'Cancelled' });
  });

  it('never overwrites a manual correction', async () => {
    await addSource('venue', 'jsonld', ['https://example.org/events']);
    await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit()) }));
    const [{ id }] = (await db.query<{ id: string }>('select id from event_occurrences')) as [{ id: string }];
    await db.query(`insert into field_overrides (occurrence_id, field, value, edited_by) values ($1, 'venue', '"Corrected Hall"', 'admin')`, [id]);
    await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit('Some Other Hall')) }));
    const [venue] = await db.query<{ name: string }>('select v.name from event_occurrences o join venues v on v.id = o.venue_id');
    expect(venue!.name).toBe('HITEX Exhibition Centre');
  });

  it('merges the same event from two sources into one', async () => {
    await addSource('organizer', 'jsonld', ['https://example.org/events'], { priority: 80 });
    await addSource('directory', 'curated', ['https://sheet.example/csv'], { priority: 20 });
    const csv = [
      'title,start_date,end_date,start_time,end_time,city,venue,organizer,official_url,topics',
      'SAP S/4HANA Summit Hyderabad 2026,2026-11-12,2026-11-12,09:30,17:30,Hyderabad,HITEX Exhibition Centre,Example Forums,https://example.org/events/sap-summit-hyd,SAP',
    ].join('\n');
    const result = await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit()), 'https://sheet.example/csv': csv }));
    expect(result.created).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(await count('select count(*)::int as n from event_occurrences')).toBe(1);
    expect(await count('select count(*)::int as n from occurrence_sources')).toBe(2);
  });

  it('keeps going when one source fails, and reports partial success', async () => {
    await addSource('good', 'jsonld', ['https://example.org/events']);
    await addSource('down', 'jsonld', ['https://down.example/events']);
    const result = await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit()) }, new Set(['https://down.example/events'])));
    expect(result.status).toBe('partial_success');
    expect(result.created).toBe(1);
    const health = await db.query<{ id: string; health: string }>('select id, health from sources order by id');
    expect(health).toEqual(
      expect.arrayContaining([
        { id: 'down', health: 'failed' },
        { id: 'good', health: 'healthy' },
      ]),
    );
    const [run] = await db.query<{ status: string }>('select status from sync_runs');
    expect(run!.status).toBe('partial_success');
  });

  it('reads iCalendar feeds, including all-day events', async () => {
    await addSource('cal', 'ics', ['https://cal.example/feed.ics']);
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:odoo-pune-1',
      'SUMMARY:Odoo Community Meetup Pune',
      'DTSTART;VALUE=DATE:20261121',
      'DTEND;VALUE=DATE:20261122',
      'LOCATION:Hinjewadi\\, Pune',
      'DESCRIPTION:Evening meetup for Odoo users and partners.',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const result = await sync(fakeFetcher({ 'https://cal.example/feed.ics': ics }));
    expect(result.created).toBe(1);
    const [e] = await db.query<{ city_id: string; all_day: boolean; event_type: string; start_at: Date }>('select city_id, all_day, event_type, start_at from event_occurrences');
    expect(e).toMatchObject({ city_id: 'pune', all_day: true, event_type: 'meetup' });
    expect(new Date(e!.start_at).toISOString()).toBe('2026-11-20T18:30:00.000Z');
  });

  it('skips events outside India and events without dates', async () => {
    await addSource('venue', 'jsonld', ['https://example.org/events']);
    const abroad = sapSummit(undefined, { '@id': 'x1', name: 'SAP Summit Dubai', location: { name: 'DWTC', address: { addressLocality: 'Dubai', addressCountry: 'AE' } } });
    const noDate = sapSummit(undefined, { '@id': 'x2', name: 'SAP Day', startDate: undefined });
    const result = await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(abroad, noDate) }));
    expect(result.created).toBe(0);
    expect(result.skipReasons).toMatchObject({ not_india: 1, bad_date: 1 });
  });

  it('puts unverified sources into the review queue', async () => {
    await addSource('unknown', 'jsonld', ['https://example.org/events'], { trusted: false });
    await sync(fakeFetcher({ 'https://example.org/events': jsonLdPage(sapSummit()) }));
    const [e] = await db.query<{ verification_status: string }>('select verification_status from event_occurrences');
    expect(e!.verification_status).toBe('needs_verification');
  });
});

describe('more source types', () => {
  it('reads sitemaps, only following event pages', async () => {
    await addSource('konf', 'sitemap', ['https://tickets.example/sitemap.xml']);
    await db.query(`update sources set config = config || '{"sitemap":{"pattern":"/event/"}}'::jsonb where id = 'konf'`);
    const sitemapXml = `<?xml version="1.0"?><urlset>
      <url><loc>https://tickets.example/event/sap-summit</loc><lastmod>2026-09-30</lastmod></url>
      <url><loc>https://tickets.example/about</loc></url></urlset>`;
    const result = await sync(
      fakeFetcher({ 'https://tickets.example/sitemap.xml': sitemapXml, 'https://tickets.example/event/sap-summit': jsonLdPage(sapSummit()) }),
    );
    expect(result.created).toBe(1);
  });

  it('reads confs.tech open data for India only', async () => {
    await addSource('confs', 'confstech', ['https://raw.example/conferences/2026/security.json']);
    const data = JSON.stringify([
      { name: 'Cyber Defence Summit', url: 'https://cds.example', startDate: '2026-11-05', endDate: '2026-11-06', city: 'Bangalore', country: 'India' },
      { name: 'SecCon Berlin', url: 'https://sec.example', startDate: '2026-11-05', endDate: '2026-11-06', city: 'Berlin', country: 'Germany' },
    ]);
    const result = await sync(fakeFetcher({ 'https://raw.example/conferences/2026/security.json': data }));
    expect(result.created).toBe(1);
    const [e] = await db.query<{ city_id: string; event_type: string }>('select city_id, event_type from event_occurrences');
    expect(e).toEqual({ city_id: 'bengaluru', event_type: 'summit' });
  });
});

describe('microdata pages', () => {
  it('reads schema.org microdata (as on Odoo event pages)', async () => {
    await addSource('odoo', 'jsonld', ['https://erp.example/event/1']);
    const html = `<html><body>
      <div itemscope itemtype="https://schema.org/Event">
        <h1 itemprop="name">Odoo 20 Manufacturing Academy: Chennai</h1>
        <meta itemprop="startDate" content="2026-10-08T09:30:00+05:30"/>
        <meta itemprop="endDate" content="2026-10-08T17:00:00+05:30"/>
        <div itemprop="location" itemscope itemtype="https://schema.org/Place">
          <span itemprop="name">Park Elanza</span>
          <div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
            <span itemprop="addressLocality">Chennai</span><span itemprop="addressCountry">India</span>
          </div>
        </div>
        <p itemprop="description">Hands-on Odoo manufacturing training for partners.</p>
      </div></body></html>`;
    const result = await sync(fakeFetcher({ 'https://erp.example/event/1': html }));
    expect(result.created).toBe(1);
    const [e] = await db.query<{ title: string; city_id: string; venue: string }>(
      'select o.title, o.city_id, v.name as venue from event_occurrences o join venues v on v.id = o.venue_id',
    );
    expect(e).toEqual({ title: 'Odoo 20 Manufacturing Academy: Chennai', city_id: 'chennai', venue: 'Park Elanza' });
  });
});

describe('time zones', () => {
  it('prefers a zoned time over a zone-less copy of the same event (Odoo pages)', async () => {
    const { extractJsonLdEvents } = await import('../src/ingestion/extract/jsonld');
    const html = `<div itemscope itemtype="http://schema.org/Event"><h1 itemprop="name">Odoo Academy: Chennai</h1>
        <meta itemprop="startDate" content="2026-10-08T08:30:00"/></div>
      <div itemscope itemtype="http://schema.org/Event"><span itemprop="name">Odoo Academy: Chennai</span>
        <meta itemprop="startDate" content="2026-10-08 08:30:00Z"/><meta itemprop="endDate" content="2026-10-08 12:30:00Z"/></div>`;
    const { events } = extractJsonLdEvents(html, 'https://erp.example/event/1');
    expect(events).toHaveLength(1);
    const { parseWhen } = await import('../src/ingestion/normalize');
    // 08:30 UTC is 2:00 PM in India.
    expect(parseWhen(events[0]!.start)!.at.toISOString()).toBe('2026-10-08T08:30:00.000Z');
  });

  it('treats a time without a zone as India time, and a plain date as an all-day India date', async () => {
    const { parseWhen } = await import('../src/ingestion/normalize');
    expect(parseWhen('2026-11-12T10:00')!.at.toISOString()).toBe('2026-11-12T04:30:00.000Z');
    expect(parseWhen('2026-11-12')).toEqual({ at: new Date('2026-11-11T18:30:00.000Z'), dateOnly: true });
  });
});

describe('polite fetcher', () => {
  it('waits for the crawl delay a site asks for', async () => {
    const times: number[] = [];
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nCrawl-delay: 2', { status: 200 });
      times.push(Date.now());
      return new Response('ok', { status: 200 });
    }) as typeof fetch;
    const fetcher = createFetcher(fetchImpl);
    await fetcher.text('https://slow.example/a');
    await fetcher.text('https://slow.example/b');
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(1_900);
  });

  it('refuses URLs disallowed by robots.txt without fetching them', async () => {
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /private/', { status: 200 });
      return new Response('<html></html>', { status: 200 });
    }) as typeof fetch;
    const fetcher = createFetcher(fetchImpl);
    await expect(fetcher.text('https://site.example/private/events')).rejects.toThrow('Disallowed by robots.txt');
    expect(requested).toEqual(['https://site.example/robots.txt']);
    await expect(fetcher.text('https://site.example/events')).resolves.toContain('<html>');
  });
});
