import { describe, expect, it } from 'vitest';
import { generateDemoEvents } from '../demo';
import { buildHomeFeed } from '../feeds/home';
import { indexEvents, runEventQuery } from './filter';
import { queryTokens, scoreEvent } from './search';

const now = new Date('2026-10-01T05:00:00Z');
const events = generateDemoEvents({ now });
const index = indexEvents(events);
const all = (query: Parameters<typeof runEventQuery>[1]) => runEventQuery(index, { limit: 50, ...query }, now);
const everything = (query: Parameters<typeof runEventQuery>[1]) => {
  const items = [];
  let cursor: string | undefined;
  do {
    const page = runEventQuery(index, { ...query, limit: 50, cursor }, now);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
};

describe('demo data', () => {
  it('is deterministic for the same day', () => {
    expect(generateDemoEvents({ now }).map((e) => e.title)).toEqual(events.map((e) => e.title));
  });

  it('is clearly marked and never claims a real source', () => {
    expect(events.length).toBeGreaterThanOrEqual(150);
    for (const event of events) {
      expect(event.isDemo).toBe(true);
      expect(event.sources.every((s) => s.kind === 'demo')).toBe(true);
      for (const url of [event.registrationUrl, event.officialWebsite, event.organizerDetail?.website]) {
        if (url) expect(url.startsWith('https://example.com/')).toBe(true);
      }
    }
  });

  it('has unique ids and titles', () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(new Set(events.map((e) => e.title)).size).toBe(events.length);
  });

  it('includes events with and without speakers, exhibitors and agenda', () => {
    expect(events.some((e) => e.speakers.length === 0)).toBe(true);
    expect(events.some((e) => e.speakers.length > 0)).toBe(true);
    expect(events.some((e) => e.exhibitors.length > 20)).toBe(true);
    expect(events.some((e) => e.agenda.length === 0)).toBe(true);
  });

  it('gives each event an organizer that runs that kind of event', () => {
    const aiSummits = events.filter((e) => e.title.startsWith('Applied AI Summit'));
    expect(aiSummits.length).toBeGreaterThan(0);
    for (const e of aiSummits) expect(['org-applied-ai', 'org-summit-works']).toContain(e.organizer?.id);
  });

  it('ends after it starts', () => {
    for (const event of events) expect(event.endAt > event.startAt).toBe(true);
  });
});

describe('search', () => {
  it('drops filler words', () => {
    expect(queryTokens('SAP events in Delhi')).toEqual(['sap', 'delhi']);
  });

  it('matches short words whole, so "SAP" is not "Sapphire"', () => {
    expect(scoreEvent({ title: 'sapphire expo', other: '' }, ['sap'])).toBe(0);
    expect(scoreEvent({ title: 'sap forum', other: '' }, ['sap'])).toBeGreaterThan(0);
  });

  it('matches word prefixes for longer words', () => {
    expect(scoreEvent({ title: 'smart manufacturing expo', other: '' }, ['manuf'])).toBeGreaterThan(0);
  });

  it('"SAP" returns only SAP-related events', () => {
    const results = everything({ q: 'SAP' });
    expect(results.length).toBeGreaterThan(5);
    for (const event of results) {
      const text = [event.title, ...event.tags, ...event.technologyIds].join(' ').toLowerCase();
      expect(text).toMatch(/\bsap\b|s\/4hana/);
    }
  });

  it('"SAP Delhi" finds SAP events in New Delhi', () => {
    const results = everything({ q: 'SAP Delhi' });
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const event of results) expect(event.cityId).toBe('delhi');
  });

  it('city aliases work: Bangalore finds Bengaluru', () => {
    const results = everything({ q: 'Bangalore' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.cityId === 'bengaluru')).toBe(true);
  });

  it('ranks title matches first', () => {
    const [first] = all({ q: 'Odoo' }).items;
    expect(first?.title.toLowerCase()).toContain('odoo');
  });
});

describe('filters and paging', () => {
  it('Delhi NCR covers its cities', () => {
    const results = everything({ cityIds: ['delhi-ncr'] });
    const cities = new Set(results.map((e) => e.cityId));
    expect([...cities].every((id) => ['delhi', 'gurugram', 'noida', 'ghaziabad', 'faridabad'].includes(id))).toBe(true);
    expect(cities.size).toBeGreaterThan(1);
  });

  it('hides past and unverified events by default', () => {
    const results = everything({});
    expect(results.every((e) => new Date(e.endAt) >= now && e.verificationStatus === 'verified')).toBe(true);
  });

  it('pages without gaps or repeats', () => {
    const paged = everything({});
    const { total } = all({});
    expect(paged.length).toBe(total);
    expect(new Set(paged.map((e) => e.id)).size).toBe(paged.length);
  });

  it('sorts by date by default', () => {
    const items = everything({});
    expect(items.map((e) => e.startAt)).toEqual([...items.map((e) => e.startAt)].sort());
  });
});

describe('home feed', () => {
  const feed = buildHomeFeed(events, {}, now);

  it('fills every section', () => {
    expect(feed.upcoming.length).toBeGreaterThan(0);
    expect(feed.thisWeek.length).toBeGreaterThan(0);
    expect(feed.newlyAdded.length).toBeGreaterThan(0);
    expect(feed.recentlyUpdated.length).toBeGreaterThan(0);
    expect(feed.categories.length).toBeGreaterThan(0);
  });

  it('narrows to a city', () => {
    const delhi = buildHomeFeed(events, { cityIds: ['delhi'] }, now);
    expect([...delhi.upcoming, ...delhi.thisWeek].every((e) => e.cityId === 'delhi')).toBe(true);
  });
});
