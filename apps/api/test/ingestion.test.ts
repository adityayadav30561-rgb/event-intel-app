import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type Db } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { seedReference } from '../src/db/seed';
import { expandDateTokens } from '../src/ingestion/adapters';
import { parseDateRange, parseTimeRange } from '../src/ingestion/extract/cards';
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

describe('event cards (venue and association calendars)', () => {
  it('reads human date ranges in the formats venues use', () => {
    expect(parseDateRange('January 21 - 27, 2027')).toEqual({ start: '2027-01-21', end: '2027-01-27' });
    expect(parseDateRange('February 26 - March 01, 2026')).toEqual({ start: '2026-02-26', end: '2026-03-01' });
    expect(parseDateRange('April 6- 8, 2026')).toEqual({ start: '2026-04-06', end: '2026-04-08' });
    expect(parseDateRange('Oct 23, 2026')).toEqual({ start: '2026-10-23', end: '2026-10-23' });
    expect(parseDateRange('30 Sep, 2026 - 03 Oct, 2026')).toEqual({ start: '2026-09-30', end: '2026-10-03' });
    expect(parseDateRange('6 - 29 Oct 2026')).toEqual({ start: '2026-10-06', end: '2026-10-29' });
    expect(parseDateRange('10 Aug - 12 Nov, 2026')).toEqual({ start: '2026-08-10', end: '2026-11-12' });
    expect(parseDateRange('December 28 - January 2, 2027')).toEqual({ start: '2026-12-28', end: '2027-01-02' });
    expect(parseDateRange('12th–14th November 2026')).toEqual({ start: '2026-11-12', end: '2026-11-14' });
    // Unsure means nothing, never a guessed date.
    expect(parseDateRange('Coming soon')).toBeUndefined();
    expect(parseDateRange('February 30, 2026')).toBeUndefined();
    expect(parseDateRange('Decoration Expo 2026')).toBeUndefined();
  });

  it('reads daily hours', () => {
    expect(parseTimeRange('9:00am - 6:00pm')).toEqual({ start: '09:00', end: '18:00' });
    expect(parseTimeRange('10 AM to 5 PM')).toEqual({ start: '10:00', end: '17:00' });
    expect(parseTimeRange('09:30 - 17:00')).toEqual({ start: '09:30', end: '17:00' });
    expect(parseTimeRange('Hall 1')).toBeUndefined();
  });

  it('fills date windows in listing URLs with India dates', () => {
    // 20:00 UTC on 30 Sep is already 1 Oct in India.
    expect(expandDateTokens('https://v.example/list?from={today}&to={today+365d}', new Date('2026-09-30T20:00:00Z'))).toBe(
      'https://v.example/list?from=2026-10-01&to=2027-10-01',
    );
  });

  it('imports cards: relevant, in India and upcoming only; shared links are not used as official sites', async () => {
    await db.query(
      `insert into sources (id, name, adapter, kind, config, priority, enabled, trusted) values ('venue', 'Venue', 'cards', 'official_venue', $1, 70, true, true)`,
      [
        JSON.stringify({
          urls: ['https://venue.example/events'],
          cards: { item: '.box', title: 'h3', date: '.date', time: '.time', link: 'h3 a', organizer: 'small', location: '.where', locationKind: 'place' },
          defaults: { venueName: 'Example Exhibition Centre', typeHint: 'exhibition' },
        }),
      ],
    );
    const card = (title: string, date: string, href: string, where = 'Bengaluru, Karnataka') =>
      `<div class="box"><h3><a href="${href}">${title}</a></h3><small><b>Show Organisers</b></small><span class="date"><p>${date}</p></span><span class="time"><p>9:00am - 6:00pm</p></span><p class="where">${where}</p></div>`;
    const page = `<html><body>
      ${card('IMTEX 2027 / Tooltech 2027', 'January 21 - 27, 2027', 'Calendar_event\\2k27\\imtex.php')}
      ${card('Doors Windows & Facades Expo', 'December 10 - 12, 2026', 'https://shared.example/')}
      ${card('Aluminium Extrusions Expo', 'December 10 - 12, 2026', 'https://shared.example/')}
      ${card('Grand Furniture Fair', 'November 1 - 3, 2026', 'furniture.php')}
      ${card('Electronics Week Berlin', 'November 4 - 6, 2026', 'berlin.php', 'Germany')}
      ${card('Manufacturing Leaders Meet', 'November 9, 2026', 'mlm.php', 'Multiple Cities')}
      ${card('Machine Tools Expo 2025', 'March 3 - 5, 2025', 'old.php')}
    </body></html>`;
    const result = await sync(fakeFetcher({ 'https://venue.example/events': page }));
    expect(result.created).toBe(2);
    const rows = await db.query<{ title: string; start_at: Date; end_at: Date; official_website: string | null; event_type: string }>(
      'select title, start_at, end_at, official_website, event_type from event_occurrences order by start_at',
    );
    expect(rows.map((r) => r.title)).toEqual(['Aluminium Extrusions Expo', 'IMTEX 2027 / Tooltech 2027']);
    const [aluminium, imtex] = rows;
    // A link two cards share identifies neither: it would merge co-located expos into one.
    expect(aluminium!.official_website).toBe('https://venue.example/events');
    // Backslash paths are links on the venue's own site; daily hours are India time.
    expect(imtex!.official_website).toBe('https://venue.example/Calendar_event/2k27/imtex.php');
    expect(new Date(imtex!.start_at).toISOString()).toBe('2027-01-21T03:30:00.000Z');
    expect(new Date(imtex!.end_at).toISOString()).toBe('2027-01-27T12:30:00.000Z');
    expect(imtex!.event_type).toBe('exhibition');
    // A second read changes nothing.
    const again = await sync(fakeFetcher({ 'https://venue.example/events': page }));
    expect([again.created, again.updated]).toEqual([0, 0]);
  });
});
