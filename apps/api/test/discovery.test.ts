import { getZone, type AuthSession, type EventSummary, type MapResponse, type Page, type SavedSearch } from '@eii/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createPgliteDb, type Db } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { refreshDemoData, seedReference } from '../src/db/seed';
import { AuthService } from '../src/modules/auth/service';

// Test-only account on an in-memory database with the sample events.
let db: Db;
let app: ReturnType<typeof createApp>;
let session: AuthSession;

const get = async <T>(path: string) => (await request(app).get(path).set('Authorization', `Bearer ${session.accessToken}`)).body as T;
const all = async (path: string) => {
  const items: EventSummary[] = [];
  let cursor: string | null = null;
  do {
    const sep: string = path.includes('?') ? '&' : '?';
    const page: Page<EventSummary> = await get(`${path}${sep}limit=50${cursor ? `&cursor=${cursor}` : ''}`);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
};

beforeAll(async () => {
  db = await createPgliteDb('memory');
  await migrate(db);
  await seedReference(db);
  await refreshDemoData(db);
  const auth = await AuthService.create(db);
  await auth.bootstrapAdmin('owner@test.local', 'owner-test-password', 'Owner');
  app = createApp(db, loadConfig({ NODE_ENV: 'test', DEMO_DATA: 'true' }), auth);
  session = (await request(app).post('/v1/auth/login').send({ email: 'owner@test.local', password: 'owner-test-password' })).body;
});

afterAll(async () => {
  await db.close();
});

describe('filters', () => {
  it('filters by zone using states, so every city in the zone counts', async () => {
    const south = await all('/v1/events?cityIds=zone-south');
    const states = new Set(getZone('zone-south')!.states as readonly string[]);
    expect(south.length).toBeGreaterThan(0);
    expect(south.every((e) => states.has(e.state))).toBe(true);
    const everything = await all('/v1/events');
    expect(south.length).toBe(everything.filter((e) => states.has(e.state)).length);
  });

  it('filters by attendance and price', async () => {
    const online = await all('/v1/events?attendanceModes=online');
    expect(online.length).toBeGreaterThan(0);
    expect(online.every((e) => e.attendanceMode === 'online')).toBe(true);
    const free = await all('/v1/events?price=free');
    expect(free.every((e) => e.price?.min === 0)).toBe(true);
    const paid = await all('/v1/events?price=paid');
    expect(paid.every((e) => (e.price?.min ?? 0) > 0)).toBe(true);
  });

  it('finds events near a point, nearest first, with distances', async () => {
    // Central Hyderabad.
    const near = await all('/v1/events?lat=17.385&lng=78.4867&radiusKm=30&sort=distance');
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((e) => e.distanceKm !== undefined && e.distanceKm <= 30)).toBe(true);
    for (let i = 1; i < near.length; i++) expect(near[i]!.distanceKm!).toBeGreaterThanOrEqual(near[i - 1]!.distanceKm!);
    expect(near.some((e) => e.attendanceMode === 'online')).toBe(false);
  });

  it('ranks by your interests and can keep only good matches', async () => {
    await request(app)
      .put('/v1/me/preferences')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ cityIds: [], categoryIds: ['manufacturing'], technologyIds: ['sap'], industryIds: [], eventTypes: [] });
    const ranked = await all('/v1/events?sort=match');
    const first = ranked[0]!;
    expect(first.technologyIds.includes('sap') || first.categoryIds.includes('manufacturing')).toBe(true);
    const good = await all('/v1/events?minMatch=good');
    expect(good.length).toBeGreaterThan(0);
    expect(good.length).toBeLessThan(ranked.length);
    // SAP (3) + Manufacturing (2) = 5 is the least a "good" match needs here (4+).
    expect(good.every((e) => e.technologyIds.includes('sap') && e.categoryIds.includes('manufacturing'))).toBe(true);
  });
});

describe('map', () => {
  const INDIA = 'west=68&south=6&east=98&north=37';

  it('clusters when zoomed out and counts every mappable event once', async () => {
    const res: MapResponse = await get(`/v1/events/map?${INDIA}&zoom=4`);
    const shown = res.pins.length + res.clusters.reduce((s, c) => s + c.count, 0);
    expect(shown).toBe(res.total);
    expect(res.clusters.length).toBeGreaterThan(0);
    const list = await all('/v1/events?attendanceModes=in_person,hybrid');
    expect(res.total).toBe(list.length);
  });

  it('uses the same filters as the list', async () => {
    const res: MapResponse = await get(`/v1/events/map?${INDIA}&zoom=5&cityIds=hyderabad`);
    const list = await all('/v1/events?cityIds=hyderabad&attendanceModes=in_person,hybrid');
    expect(res.total).toBe(list.length);
  });

  it('separates events when zoomed in, and lists events that share one point', async () => {
    const res: MapResponse = await get('/v1/events/map?west=78.2&south=17.2&east=78.7&north=17.6&zoom=16');
    expect(res.pins.length + res.clusters.length).toBeGreaterThan(0);
    for (const c of res.clusters) expect(c.events?.length).toBe(c.count);
  });
});

describe('saved searches', () => {
  it('saves, renames, lists and deletes', async () => {
    const auth = { Authorization: `Bearer ${session.accessToken}` };
    const created = await request(app)
      .post('/v1/me/saved-searches')
      .set(auth)
      .send({ name: 'SAP · Delhi NCR · Next 3 months', query: { technologyIds: ['sap'], cityIds: ['delhi-ncr'], datePreset: 'next_3_months' } });
    expect(created.status).toBe(201);
    const saved: SavedSearch = created.body;
    expect(saved.notify).toBe(true);
    const renamed = await request(app).patch(`/v1/me/saved-searches/${saved.id}`).set(auth).send({ name: 'SAP in NCR' });
    expect(renamed.body).toMatchObject({ name: 'SAP in NCR', query: { technologyIds: ['sap'] } });
    expect((await get<{ items: SavedSearch[] }>('/v1/me/saved-searches')).items).toHaveLength(1);
    expect((await request(app).delete(`/v1/me/saved-searches/${saved.id}`).set(auth)).status).toBe(204);
    expect((await get<{ items: SavedSearch[] }>('/v1/me/saved-searches')).items).toHaveLength(0);
  });

  it('rejects an unnamed search', async () => {
    const res = await request(app).post('/v1/me/saved-searches').set('Authorization', `Bearer ${session.accessToken}`).send({ name: ' ', query: {} });
    expect(res.status).toBe(400);
  });
});
