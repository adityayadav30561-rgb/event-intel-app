import type { EventDetail, EventSummary, HomeFeed, Page, SyncStatus } from '@eii/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createPgliteDb, type Db } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { refreshDemoData, seedReference } from '../src/db/seed';

const SECRET = 'test-secret-value';
let db: Db;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  db = await createPgliteDb('memory');
  await migrate(db);
  await seedReference(db);
  await refreshDemoData(db);
  app = createApp(db, loadConfig({ NODE_ENV: 'test', CRON_SECRET: SECRET, DEMO_DATA: 'true' }));
});

afterAll(async () => {
  await db.close();
});

const get = async <T>(path: string) => {
  const res = await request(app).get(path);
  return { status: res.status, body: res.body as T, headers: res.headers };
};

/** Follows cursors until the last page. */
async function all(path: string): Promise<EventSummary[]> {
  const items: EventSummary[] = [];
  let cursor: string | null = null;
  do {
    const sep: string = path.includes('?') ? '&' : '?';
    const { body }: { body: Page<EventSummary> } = await get<Page<EventSummary>>(`${path}${sep}limit=50${cursor ? `&cursor=${cursor}` : ''}`);
    items.push(...body.items);
    cursor = body.nextCursor;
  } while (cursor);
  return items;
}

describe('setup', () => {
  it('reports health', async () => {
    const { status, body } = await get<{ status: string }>('/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('reports each switched-on source’s health with the sync status', async () => {
    await db.query(`insert into sources (id, name, adapter, kind, config, priority, enabled, trusted, health, last_error) values ('venue-x', 'Venue X', 'cards', 'official_venue', '{}', 70, true, true, 'failed', 'HTTP 403')`);
    await db.query(`insert into sources (id, name, adapter, kind, config, priority, enabled, trusted) values ('off-x', 'Off X', 'ics', 'official_venue', '{}', 70, false, true)`);
    const { body } = await get<SyncStatus>('/v1/sync/status');
    expect(body.sources).toEqual([{ id: 'venue-x', name: 'Venue X', health: 'failed', lastSuccessAt: null, lastError: 'HTTP 403', eventsFound: 0 }]);
    await db.query(`delete from sources where id in ('venue-x', 'off-x')`);
  });

  it('migrations and the sample seed are idempotent', async () => {
    expect(await migrate(db)).toEqual([]);
    const count = async () => (await db.query<{ n: number }>('select count(*)::int as n from event_occurrences'))[0]!.n;
    const before = await count();
    expect(await refreshDemoData(db)).toBe(false); // already seeded today
    await refreshDemoData(db, new Date(), true); // forced reseed
    expect(await count()).toBe(before);
  });
});

describe('GET /v1/events', () => {
  it('lists only verified, not-yet-ended events in date order', async () => {
    const items = await all('/v1/events');
    expect(items.length).toBeGreaterThan(100);
    const now = Date.now();
    for (const e of items) {
      expect(e.verificationStatus).toBe('verified');
      expect(new Date(e.endAt).getTime()).toBeGreaterThanOrEqual(now - 60_000);
    }
    expect(items.map((e) => e.startAt)).toEqual([...items.map((e) => e.startAt)].sort());
  });

  it('pages with cursors without gaps or repeats', async () => {
    const first = await get<Page<EventSummary>>('/v1/events?limit=10');
    const items = await all('/v1/events');
    expect(first.body.total).toBe(items.length);
    expect(new Set(items.map((e) => e.id)).size).toBe(items.length);
  });

  it('ranks title matches first for "SAP"', async () => {
    const items = await all('/v1/events?q=SAP');
    expect(items.length).toBeGreaterThan(5);
    // The word itself in the title; "S/4HANA" titles are SAP-related but rank by other signals.
    const inTitle = items.map((e) => /\bsap\b/i.test(e.title));
    const firstMiss = inTitle.indexOf(false);
    if (firstMiss >= 0) expect(inTitle.slice(firstMiss).every((x) => !x)).toBe(true);
  });

  it('"SAP" never matches "Sapphire"-like words', async () => {
    const items = await all('/v1/events?q=sap');
    expect(items.every((e) => !/sapphire/i.test(e.title))).toBe(true);
  });

  it('"SAP Delhi" stays in New Delhi', async () => {
    const items = await all('/v1/events?q=SAP%20Delhi');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((e) => e.cityId === 'delhi')).toBe(true);
  });

  it('tolerates typos when nothing matches exactly', async () => {
    const { body } = await get<Page<EventSummary>>('/v1/events?q=hydrabad');
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((e) => e.cityId === 'hyderabad')).toBe(true);
  });

  it('expands Delhi NCR to its cities', async () => {
    const items = await all('/v1/events?cityIds=delhi-ncr');
    const cities = new Set(items.map((e) => e.cityId));
    expect([...cities].every((c) => ['delhi', 'gurugram', 'noida', 'ghaziabad', 'faridabad'].includes(c))).toBe(true);
    expect(cities.size).toBeGreaterThan(1);
  });

  it('filters by category, type and date preset', async () => {
    const mfg = await all('/v1/events?categoryIds=manufacturing&eventTypes=expo');
    expect(mfg.length).toBeGreaterThan(0);
    expect(mfg.every((e) => e.categoryIds.includes('manufacturing') && e.eventType === 'expo')).toBe(true);
    const week = await all('/v1/events?datePreset=next_3_months');
    expect(week.length).toBeGreaterThan(0);
  });

  it('rejects invalid parameters with a clear error', async () => {
    const { status, body } = await get<{ error: { code: string } }>('/v1/events?limit=500&eventTypes=party');
    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_request');
  });
});

describe('event detail', () => {
  it('returns the full event with provenance', async () => {
    const { status, body } = await get<EventDetail>('/v1/events/evt_demo_001');
    expect(status).toBe(200);
    expect(body.title).toBeTruthy();
    expect(body.venue?.name).toBeTruthy();
    expect(body.sources[0]?.kind).toBe('demo');
    expect(body.isDemo).toBe(true);
  });

  it('hides events awaiting verification', async () => {
    const [hidden] = await db.query<{ id: string }>(`select id from event_occurrences where verification_status <> 'verified' limit 1`);
    expect(hidden).toBeDefined();
    expect((await get(`/v1/events/${hidden!.id}`)).status).toBe(404);
  });

  it('404s for unknown events', async () => {
    expect((await get('/v1/events/does-not-exist')).status).toBe(404);
  });

  it('related events exclude the event itself', async () => {
    const { body } = await get<{ items: EventSummary[] }>('/v1/events/evt_demo_005/related');
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.some((e) => e.id === 'evt_demo_005')).toBe(false);
  });
});

describe('discovery', () => {
  it('builds every Home section and respects the location', async () => {
    const { body } = await get<HomeFeed>('/v1/home');
    expect(body.upcoming.length).toBeGreaterThan(0);
    expect(body.thisWeek.length).toBeGreaterThan(0);
    expect(body.newlyAdded.length).toBeGreaterThan(0);
    expect(body.categories.length).toBeGreaterThan(0);
    const delhi = await get<HomeFeed>('/v1/home?cityIds=delhi');
    expect([...delhi.body.upcoming, ...delhi.body.thisWeek].every((e) => e.cityId === 'delhi')).toBe(true);
  });

  it('finds nearby in-person events within the radius', async () => {
    const { body } = await get<{ items: (EventSummary & { distanceKm: number })[] }>('/v1/events/nearby?lat=18.52&lng=73.85&radiusKm=25');
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((e) => e.distanceKm <= 25 && e.attendanceMode !== 'online')).toBe(true);
  });

  it('returns incremental changes since a moment', async () => {
    const { body } = await get<{ updated: EventSummary[]; serverTime: string }>(`/v1/events/changes?since=${new Date(Date.now() - 365 * 86_400_000).toISOString()}`);
    expect(body.updated.length).toBeGreaterThan(0);
    const later = await get<{ updated: EventSummary[] }>(`/v1/events/changes?since=${body.serverTime}`);
    expect(later.body.updated.length).toBe(0);
  });

  it('serves taxonomy, cities with counts and collections', async () => {
    expect((await get<{ items: unknown[] }>('/v1/categories')).body.items.length).toBeGreaterThan(10);
    const cities = await get<{ items: { id: string; upcomingCount: number }[] }>('/v1/cities');
    expect(cities.body.items.find((c) => c.id === 'delhi')!.upcomingCount).toBeGreaterThan(0);
    const sap = await get<{ page: Page<EventSummary> }>('/v1/collections/sap-india');
    expect(sap.body.page.items.every((e) => e.technologyIds.includes('sap'))).toBe(true);
  });

  it('groups global search results', async () => {
    const { body } = await get<Record<string, unknown[]>>('/v1/events/search?q=Hyderabad');
    expect(body.events!.length).toBeGreaterThan(0);
    expect(body.cities!.length).toBeGreaterThan(0);
  });

  it('shows organizer profiles with upcoming and past events', async () => {
    const { body } = await get<{ organizer: { name: string }; upcoming: EventSummary[] }>('/v1/organizers/org-enterprise-pulse');
    expect(body.organizer.name).toBe('Enterprise Pulse Events');
    expect(body.upcoming.length).toBeGreaterThan(0);
  });
});

describe('internal tick', () => {
  it('requires the cron secret', async () => {
    expect((await request(app).post('/internal/tick')).status).toBe(401);
    expect((await request(app).post('/internal/tick').set('x-cron-secret', 'wrong-secret-value')).status).toBe(401);
  });

  it('runs with the secret and does not reseed twice a day', async () => {
    const res = await request(app).post('/internal/tick').set('x-cron-secret', SECRET);
    expect(res.status).toBe(200);
    expect(res.body.demoRefreshed).toBe(false);
  });

  it('leaves the database alone when no work is due (free-tier compute budget)', async () => {
    const res = await request(app).post('/internal/tick').set('x-cron-secret', SECRET);
    expect(res.status).toBe(200);
    expect(res.body.touchedDatabase).toBe(false);
  });
});

describe('security headers and CORS', () => {
  it('allows the app origin and refuses others', async () => {
    const ok = await request(app).get('/v1/categories').set('Origin', 'https://event-intelligence-india.expo.app');
    expect(ok.headers['access-control-allow-origin']).toBe('https://event-intelligence-india.expo.app');
    const evil = await request(app).get('/v1/categories').set('Origin', 'https://evil.example.com');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets standard security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
