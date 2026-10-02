import type { AdminEvent, AuthSession, ConflictItem, DuplicatePair, ReviewItem, SyncInfo, TrackingSnapshot } from '@eii/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createPgliteDb, type Db } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { refreshDemoData, seedReference } from '../src/db/seed';
import { syncSourceRegistry } from '../src/ingestion/registry';
import { AuthService } from '../src/modules/auth/service';

// Test-only accounts on an in-memory database with the sample events.
let db: Db;
let app: ReturnType<typeof createApp>;
let admin: AuthSession;
let member: AuthSession;
let ids: string[];

const as = (s: AuthSession) => ({
  get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${s.accessToken}`),
  post: (path: string, body: object = {}) => request(app).post(path).set('Authorization', `Bearer ${s.accessToken}`).send(body),
  patch: (path: string, body: object) => request(app).patch(path).set('Authorization', `Bearer ${s.accessToken}`).send(body),
});

beforeAll(async () => {
  db = await createPgliteDb('memory');
  await migrate(db);
  await seedReference(db);
  await refreshDemoData(db);
  const auth = await AuthService.create(db);
  await auth.bootstrapAdmin('owner@test.local', 'owner-test-password', 'Owner');
  app = createApp(db, loadConfig({ NODE_ENV: 'test', DEMO_DATA: 'true' }), auth);
  admin = (await request(app).post('/v1/auth/login').send({ email: 'owner@test.local', password: 'owner-test-password' })).body;
  const created = await as(admin).post('/v1/admin/users', { name: 'Priya', email: 'priya@test.local' });
  const temp: AuthSession = (await request(app).post('/v1/auth/login').send({ email: 'priya@test.local', password: created.body.temporaryPassword })).body;
  member = (await as(temp).post('/v1/auth/change-password', { currentPassword: created.body.temporaryPassword, newPassword: 'priya-own-password' })).body;
  ids = (await db.query<{ id: string }>(`select id from event_occurrences where end_at > now() + interval '2 days' order by start_at limit 8`)).map((r) => r.id);
});

afterAll(async () => {
  await db.close();
});

describe('access', () => {
  it('is for admins and researchers only', async () => {
    expect((await as(member).get('/v1/admin/overview')).status).toBe(403);
    const overview = await as(admin).get('/v1/admin/overview');
    expect(overview.status).toBe(200);
    expect(overview.body).toMatchObject({ review: expect.any(Number), duplicates: expect.any(Number), conflicts: expect.any(Number) });
  });
});

describe('review queue', () => {
  it('approving makes an event visible to everyone; rejecting hides it', async () => {
    const [a, b] = ids as [string, string];
    await db.query(`update event_occurrences set verification_status = 'needs_verification' where id = any($1::text[])`, [[a, b]]);
    expect((await as(member).get(`/v1/events/${a}`)).status).toBe(404);
    const queue: ReviewItem[] = (await as(admin).get('/v1/admin/review')).body.items;
    expect(queue.map((i) => i.event.id)).toEqual(expect.arrayContaining([a, b]));

    await as(admin).post(`/v1/admin/events/${a}/verify`);
    expect((await as(member).get(`/v1/events/${a}`)).status).toBe(200);
    await as(admin).post(`/v1/admin/events/${b}/reject`);
    expect((await as(member).get(`/v1/events/${b}`)).status).toBe(404);
    expect((await as(admin).get('/v1/admin/review')).body.items.some((i: ReviewItem) => [a, b].includes(i.event.id))).toBe(false);
    const [log] = await db.query<{ action: string }>(`select action from audit_log where entity_id = $1 order by at desc limit 1`, [b]);
    expect(log?.action).toBe('event_rejected');
  });
});

describe('editing', () => {
  it('saves the change, records it, and protects the field', async () => {
    const id = ids[2]!;
    const res = await as(admin).patch(`/v1/admin/events/${id}`, { venueName: 'Hall 7, Pragati Maidan', status: 'postponed' });
    expect(res.status).toBe(200);
    const edited: AdminEvent = res.body;
    expect(edited.event).toMatchObject({ venueName: 'Hall 7, Pragati Maidan', status: 'postponed' });
    expect(edited.overrides.map((o) => o.field).sort()).toEqual(['status', 'venue']);
    expect(edited.overrides[0]!.editedBy).toBe('Owner');
    const changes = await db.query<{ field: string }>(`select field from event_changes where occurrence_id = $1 and source_id = 'manual'`, [id]);
    expect(changes.map((c) => c.field).sort()).toEqual(['status', 'venue']);
    // Removing the protection lets syncs update the field again.
    const cleared: AdminEvent = (await request(app).delete(`/v1/admin/events/${id}/overrides/venue`).set('Authorization', `Bearer ${admin.accessToken}`)).body;
    expect(cleared.overrides.map((o) => o.field)).toEqual(['status']);
  });

  it('rejects an end before the start', async () => {
    const res = await as(admin).patch(`/v1/admin/events/${ids[3]}`, { startAt: '2026-12-10T10:00:00+05:30', endAt: '2026-12-09T10:00:00+05:30' });
    expect(res.status).toBe(400);
  });

  it('adds an event by hand, verified and visible', async () => {
    const res = await as(admin).post('/v1/admin/events', {
      title: 'SAP Customer Day Lucknow 2026',
      startAt: '2026-12-15T10:00:00+05:30',
      endAt: '2026-12-15T17:00:00+05:30',
      cityId: 'lucknow',
      venueName: 'Taj Mahal Lucknow',
      eventType: 'conference',
      officialWebsite: 'https://example.org/sap-lucknow',
    });
    expect(res.status).toBe(201);
    const event = (await as(member).get(`/v1/events/${res.body.id}`)).body;
    expect(event).toMatchObject({ title: 'SAP Customer Day Lucknow 2026', city: 'Lucknow', venueName: 'Taj Mahal Lucknow', eventType: 'conference' });
    expect(event.technologyIds).toContain('sap');
  });
});

describe('duplicates', () => {
  it('merges, moving everyone’s saves, notes, checklists and reminders', async () => {
    const [keep, drop] = [ids[4]!, ids[5]!];
    await db.query(`insert into duplicate_candidates (id, occurrence_a, occurrence_b, score) values ('dup_test', $1, $2, 0.7)`, [keep, drop]);
    // Priya tracked the duplicate, not the kept event; the owner tracked both.
    const at = new Date().toISOString();
    await as(member).post('/v1/me/sync', {
      changes: [
        { id: 'chg_merge_test_1', at, type: 'tracking', eventId: drop, field: 'following', value: true },
        { id: 'chg_merge_test_2', at, type: 'note', eventId: drop, body: 'Ask about the SAP demo' },
        { id: 'chg_merge_test_3', at, type: 'checklist', eventId: drop, itemId: 'default:agenda', done: true },
      ],
    });
    await as(member).post('/v1/me/reminders', { eventId: drop, offsetMinutes: 1440 });
    await as(admin).post('/v1/me/sync', {
      changes: [
        { id: 'chg_merge_test_4', at, type: 'tracking', eventId: keep, field: 'saved', value: true },
        { id: 'chg_merge_test_5', at, type: 'tracking', eventId: drop, field: 'status', value: 'planning' },
      ],
    });
    const dropTitle = (await db.query<{ title: string }>('select title from event_occurrences where id = $1', [drop]))[0]!.title;

    const pairs: DuplicatePair[] = (await as(admin).get('/v1/admin/duplicates')).body.items;
    expect(pairs.find((p) => p.id === 'dup_test')).toBeTruthy();
    const res = await as(admin).post('/v1/admin/duplicates/dup_test/merge', { keep: 'a', take: { title: 'b' } });
    expect(res.body.id).toBe(keep);

    const priya: TrackingSnapshot = (await as(member).get('/v1/me/tracking')).body;
    expect(priya.tracking.find((t) => t.eventId === keep)).toMatchObject({ following: true });
    expect(priya.tracking.some((t) => t.eventId === drop)).toBe(false);
    expect(priya.notes.find((n) => n.eventId === keep)?.body).toBe('Ask about the SAP demo');
    expect(priya.checklist.find((c) => c.eventId === keep && c.id === 'default:agenda')?.done).toBe(true);
    expect((await as(member).get('/v1/me/reminders')).body.items.map((r: { eventId: string }) => r.eventId)).toEqual([keep]);
    const owner: TrackingSnapshot = (await as(admin).get('/v1/me/tracking')).body;
    expect(owner.tracking.find((t) => t.eventId === keep)).toMatchObject({ saved: true, status: 'planning' });

    // The kept event took the other's title; the duplicate is gone for everyone.
    expect((await as(member).get(`/v1/events/${keep}`)).body.title).toBe(dropTitle);
    expect((await as(member).get(`/v1/events/${drop}`)).status).toBe(404);
  });
});

describe('conflicts', () => {
  it('applies the chosen value and protects it', async () => {
    const id = ids[6]!;
    await db.query(`insert into source_conflicts (id, occurrence_id, field, values_json) values ('cf_test', $1, 'venue', $2)`, [
      id,
      JSON.stringify([
        { sourceId: 'demo', sourceName: 'Sample data', label: 'Old Hall', patch: { venueName: 'Old Hall' } },
        { sourceId: 'odoo-india', sourceName: 'Odoo', label: 'New Hall', patch: { venueName: 'New Hall' } },
      ]),
    ]);
    const list: ConflictItem[] = (await as(admin).get('/v1/admin/conflicts')).body.items;
    expect(list.find((c) => c.id === 'cf_test')?.values.map((v) => v.label)).toEqual(['Old Hall', 'New Hall']);
    await as(admin).post('/v1/admin/conflicts/cf_test/resolve', { index: 1 });
    expect((await as(member).get(`/v1/events/${id}`)).body.venueName).toBe('New Hall');
    expect((await as(admin).get('/v1/admin/conflicts')).body.items.some((c: ConflictItem) => c.id === 'cf_test')).toBe(false);
  });
});

describe('sync and sources', () => {
  it('shows sources and keeps a switch set in the app across restarts', async () => {
    await syncSourceRegistry(db, ['odoo-india']);
    expect((await as(admin).patch('/v1/admin/sources/odoo-india', { enabled: false })).status).toBe(204);
    // A restart re-reads SOURCES_ENABLED; the app's switch still wins.
    await syncSourceRegistry(db, ['odoo-india']);
    const info: SyncInfo = (await as(admin).get('/v1/admin/sync')).body;
    expect(info.sources.find((s) => s.id === 'odoo-india')).toMatchObject({ enabled: false, adminEnabled: false });
    expect(info.sources.some((s) => s.id === 'manual' || s.id === 'demo')).toBe(false);
    await as(admin).patch('/v1/admin/sources/odoo-india', { enabled: null });
    await syncSourceRegistry(db, ['odoo-india']);
    expect(((await as(admin).get('/v1/admin/sync')).body as SyncInfo).sources.find((s) => s.id === 'odoo-india')?.enabled).toBe(true);
  });
});
