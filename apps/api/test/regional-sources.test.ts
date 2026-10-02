import { describe, expect, it } from 'vitest';
import { assochamEvent, forthcomingSlugs } from '../src/ingestion/extract/assocham';
import { extractCards, parseDateRange } from '../src/ingestion/extract/cards';
import { extractTradeIndia, parseTradeIndiaDates } from '../src/ingestion/extract/tradeindia';
import { normalize } from '../src/ingestion/normalize';
import type { RawEvent, SourceRow } from '../src/ingestion/types';

// Regional sources (North, South, East, West): directory pages, chamber cards and a chamber's JSON.

const now = new Date('2026-10-02T06:00:00Z');
const source = (config: SourceRow['config']): SourceRow => ({ id: 'test', name: 'Test', adapter: 'cards', kind: 'official_organizer', config, priority: 90, enabled: true, trusted: true });

const nextData = (fairs: object[], extra: object = {}) =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { initialState: { cityListing: { city_listing: { city_listing_res: { cityListingData: { fairs, total_count: fairs.length, ...extra } } } } } } },
  })}</script></body></html>`;

describe('TradeIndia trade-show pages', () => {
  it('reads the listing data and leaves consumer shows out', () => {
    const page = extractTradeIndia(
      nextData(
        [
          {
            fair_id: 151849,
            fair_name: 'INDUSTRIAL ENGINEERING Xpo Indore 2027',
            date: 'Fri, 05 Feb, 2027 - Mon, 08 Feb, 2027',
            venue: { venue_name: 'Labhganga Exhibition & Convention Center' },
            fair_desc: '<div>Machinery&nbsp;and automation.</div>',
            fair_url: 'https://www.tradeindia.com/tradeshows/151849/industrial-engineering-xpo-indore.html',
            categories: [{ category_name: 'Machinery' }, { category_name: 'Energy & Power' }],
            city: 'Indore',
            website: 'https://www.eng-expo.in/',
            keywords: [' Machine Tools'],
          },
          { fair_id: 2, fair_name: 'SUTRAA Fashion Exhibition', date: 'Sat, 10 Oct, 2026 - Mon, 12 Oct, 2026', categories: [{ category_name: 'Apparel & Fashion' }, { category_name: 'Jewelry & Gemstones' }], city: 'Indore' },
          { fair_id: 3, fair_name: 'No dates', date: 'TBA', categories: [], city: 'Indore' },
        ],
        { filters: { calendar_months: [{ url: 'https://www.tradeindia.com/tradeshows/city/indore/196883/year-2026/october/' }] } },
      ),
    );
    expect(page.skipped).toBe(2);
    expect(page.monthUrls).toHaveLength(1);
    expect(page.events).toEqual([
      expect.objectContaining({
        sourceEventId: 'tradeindia:151849',
        title: 'INDUSTRIAL ENGINEERING Xpo Indore 2027',
        start: '2027-02-05',
        end: '2027-02-08',
        venueName: 'Labhganga Exhibition & Convention Center',
        city: 'Indore',
        description: 'Machinery and automation.',
        officialUrl: 'https://www.eng-expo.in/',
        tags: ['Machinery', 'Energy & Power', 'Machine Tools'],
      }),
    ]);
    expect(parseTradeIndiaDates('Wed, 07 Oct, 2026 - Wed, 07 Oct, 2026')).toEqual(['2026-10-07', '2026-10-07']);
    expect(() => extractTradeIndia('<html></html>')).toThrow(/layout may have changed/);
  });
});

describe('event cards: more date and place formats', () => {
  it('reads numeric, ISO and "&" dates', () => {
    expect(parseDateRange('05-10-2026 to 07-10-2026')).toEqual({ start: '2026-10-05', end: '2026-10-07' });
    expect(parseDateRange('2026-10-15')).toEqual({ start: '2026-10-15', end: '2026-10-15' });
    expect(parseDateRange('29th & 30th October 2026')).toEqual({ start: '2026-10-29', end: '2026-10-30' });
    expect(parseDateRange('31-02-2026')).toBeUndefined();
  });

  it('takes the date from an attribute or a pattern, the place from a pattern, and tidies labels', () => {
    const html = `
      <article class="card"><h3>1. AI, Law and Governance</h3><time datetime="2026-10-13">13Oct 2026</time>
        <p class="line">13 October 2026 | Mumbai | In-person</p><p class="venue">Venue : Federation House</p></article>`;
    const [byAttr] = extractCards(html, 'https://example.org/events', { item: '.card', title: 'h3', date: 'time', dateAttr: 'datetime', location: '.venue', locationKind: 'venue' });
    expect(byAttr).toMatchObject({ title: 'AI, Law and Governance', start: '2026-10-13', venueName: 'Federation House' });
    const [byPattern] = extractCards(html, 'https://example.org/events', { item: '.card', title: 'h3', date: '.line', dateMatch: '^[^|]+', location: '.line', locationMatch: '\\|\\s*([^|]+)', locationKind: 'venue' });
    expect(byPattern).toMatchObject({ start: '2026-10-13', venueName: 'Mumbai' });
  });
});

describe('ASSOCHAM', () => {
  it('lists forthcoming events and finds the city in the sentence that gives the date', () => {
    expect(forthcomingSlugs(JSON.stringify({ data: [{ slug: 'a', status: 'forthcoming' }, { slug: 'b', status: 'past' }] }))).toEqual(['a']);
    const event = assochamEvent(
      JSON.stringify({
        data: {
          slug: '5th-edition-manufacturing-conclave-2026',
          title: '5th Edition Manufacturing Conclave 2026',
          startDate: '2026-11-20',
          endDate: '2026-11-20',
          startTime: '10:00',
          description: '<p>Delhi and Mumbai lead the sector.</p><p>The Conclave will be held on 20th November 2026 at The Lalit, Kolkata.</p>',
          type: 'Conclave',
        },
      }),
    );
    expect(event).toMatchObject({
      sourceEventId: 'assocham:5th-edition-manufacturing-conclave-2026',
      start: '2026-11-20T10:00:00+05:30',
      address: 'The Lalit, Kolkata',
      organizerName: 'ASSOCHAM',
      sourceUrl: 'https://www.assocham.org/event-details/5th-edition-manufacturing-conclave-2026',
    });
    expect(assochamEvent(JSON.stringify({ data: { title: 'No date' } }))).toBeUndefined();
  });
});

describe('per-source filters', () => {
  const raw = (title: string, tags: string[] = []): RawEvent => ({ sourceEventId: title, title, start: '2026-11-20', end: '2026-11-21', city: 'Mumbai', tags, raw: {} });

  it('ignores topics too broad to count on their own, and leaves out titles by pattern', () => {
    const directory = source({ ignoreTopics: ['business'], excludeTitle: 'art fair' });
    expect(normalize(raw('Global Trade Show 2026', ['b2b']), directory, now)).toMatchObject({ ok: false, reason: 'irrelevant' });
    expect(normalize(raw('Steel Construction Expo 2026', ['b2b']), directory, now)).toMatchObject({ ok: true });
    expect(normalize(raw('India Art Fair 2027 for exporters'), directory, now)).toMatchObject({ ok: false, reason: 'irrelevant' });
    // Without the setting, a B2B trade show counts.
    expect(normalize(raw('Global Trade Show 2026', ['b2b']), source({}), now)).toMatchObject({ ok: true });
  });

  it('gives every event from a single-industry source that industry', () => {
    const result = normalize(raw('Special 2 day Workshop on Helicopter MRO'), source({ requireTopic: false, topics: { industryIds: ['aerospace'] } }), now);
    expect(result).toMatchObject({ ok: true, event: expect.objectContaining({ industryIds: ['aerospace'] }) });
  });
});

describe('text from chamber sites', () => {
  it('decodes HTML entities and moves "@ City" out of the name', () => {
    const result = normalize(
      { sourceEventId: 'x', title: 'Fund Leadership Summit 2026: Capital Markets &#038; India&#8217;s Growth @ Chennai', start: '2026-11-20', raw: {} },
      source({ requireTopic: false }),
      now,
    );
    expect(result).toMatchObject({ ok: true, event: expect.objectContaining({ title: 'Fund Leadership Summit 2026: Capital Markets & India’s Growth', city: 'Chennai' }) });
  });
});
