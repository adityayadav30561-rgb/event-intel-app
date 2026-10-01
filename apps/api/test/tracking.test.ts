import type { AuthSession, TrackingChange, TrackingSnapshot } from '@eii/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createPgliteDb, type Db } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { refreshDemoData, seedReference } from '../src/db/seed';
import { AuthService } from '../src/modules/auth/service';

// Test-only accounts for an in-memory database.
let db: Db;
let app: ReturnType<typeof createApp>;
let owner: AuthSession;
let teammate: AuthSession;
let eventId: string;
let otherEventId: string;

let seq = 0;
const change = <T extends Omit<TrackingChange, 'id' | 'at'>>(c: T, at: string) => ({ ...c, id: `chg_test_${++seq}_${Date.now()}`, at }) as TrackingChange;
const row = (snap: TrackingSnapshot, id: string) => snap.tracking.find((t) => t.eventId === id)!;
const sync = (session: AuthSession, changes: TrackingChange[]) =>
  request(app).post('/v1/me/sync').set('Authorization', `Bearer ${session.accessToken}`).send({ changes });

beforeAll(async () => {
  db = await createPgliteDb('memory');
  await migrate(db);
  await seedReference(db);
  await refreshDemoData(db);
  const auth = await AuthService.create(db);
  await auth.bootstrapAdmin('owner@test.local', 'owner-test-password', 'Owner');
  app = createApp(db, loadConfig({ NODE_ENV: 'test', DEMO_DATA: 'true' }), auth);
  owner = (await request(app).post('/v1/auth/login').send({ email: 'owner@test.local', password: 'owner-test-password' })).body;
  const created = await request(app).post('/v1/admin/users').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Rahul', email: 'rahul@test.local' });
  const temp: AuthSession = (await request(app).post('/v1/auth/login').send({ email: 'rahul@test.local', password: created.body.temporaryPassword })).body;
  teammate = (
    await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${temp.accessToken}`)
      .send({ currentPassword: created.body.temporaryPassword, newPassword: 'rahul-own-password' })
  ).body;
  const ids = await db.query<{ id: string }>(`select id from event_occurrences where end_at > now() order by start_at limit 2`);
  eventId = ids[0]!.id;
  otherEventId = ids[1]!.id;
});

afterAll(async () => {
  await db.close();
});

describe('tracking sync', () => {
  it('needs an account', async () => {
    expect((await request(app).post('/v1/me/sync').send({ changes: [] })).status).toBe(401);
  });

  it('applies saves, follows and plans, and returns the events with them', async () => {
    const res = await sync(owner, [
      change({ type: 'tracking', eventId, field: 'saved', value: true }, '2026-10-02T10:00:00.000Z'),
      change({ type: 'tracking', eventId, field: 'following', value: true }, '2026-10-02T10:00:01.000Z'),
      change({ type: 'tracking', eventId, field: 'status', value: 'planning' }, '2026-10-02T10:00:02.000Z'),
      change({ type: 'tracking', eventId, field: 'visitDate', value: '2026-11-12' }, '2026-10-02T10:00:03.000Z'),
    ]);
    expect(res.status).toBe(200);
    const snap: TrackingSnapshot = res.body;
    expect(snap.tracking).toEqual([
      expect.objectContaining({ eventId, saved: true, following: true, status: 'planning', visitDate: '2026-11-12', travelNotes: null }),
    ]);
    expect(snap.events.map((e) => e.id)).toEqual([eventId]);
  });

  it('keeps the latest change per field, whatever order they arrive in', async () => {
    // Phone A confirmed the visit at 11:00; phone B's older "planning" arrives afterwards.
    await sync(owner, [change({ type: 'tracking', eventId, field: 'status', value: 'confirmed' }, '2026-10-02T11:00:00.000Z')]);
    const res = await sync(owner, [
      change({ type: 'tracking', eventId, field: 'status', value: 'planning' }, '2026-10-02T10:30:00.000Z'),
      // Phone B also wrote travel notes, a different field: that is kept.
      change({ type: 'tracking', eventId, field: 'travelNotes', value: 'Train to Delhi, back the same day' }, '2026-10-02T10:30:00.000Z'),
    ]);
    expect(row(res.body, eventId)).toMatchObject({ status: 'confirmed', travelNotes: 'Train to Delhi, back the same day' });
  });

  it('ignores a change it has already applied', async () => {
    const c = change({ type: 'tracking', eventId: otherEventId, field: 'saved', value: true }, '2026-10-02T12:00:00.000Z');
    await sync(owner, [c]);
    await sync(owner, [change({ type: 'tracking', eventId: otherEventId, field: 'saved', value: false }, '2026-10-02T12:05:00.000Z')]);
    // The first change is resent (the phone never heard back): nothing changes.
    const res = await sync(owner, [c]);
    expect(res.body.tracking.find((t: { eventId: string }) => t.eventId === otherEventId).saved).toBe(false);
  });

  it('marks a visit with its time, and clears it if the status changes again', async () => {
    let res = await sync(owner, [change({ type: 'tracking', eventId, field: 'status', value: 'visited' }, '2026-10-02T13:00:00.000Z')]);
    expect(row(res.body, eventId).visitedAt).toBe('2026-10-02T13:00:00.000Z');
    res = await sync(owner, [change({ type: 'tracking', eventId, field: 'status', value: 'confirmed' }, '2026-10-02T13:05:00.000Z')]);
    expect(row(res.body, eventId).visitedAt).toBeNull();
  });

  it('keeps one note per event, latest wins', async () => {
    await sync(owner, [change({ type: 'note', eventId, body: 'Meet the Odoo partners at hall 2' }, '2026-10-02T14:00:00.000Z')]);
    const res = await sync(owner, [change({ type: 'note', eventId, body: 'older text' }, '2026-10-02T13:00:00.000Z')]);
    expect(res.body.notes).toEqual([{ eventId, body: 'Meet the Odoo partners at hall 2', updatedAt: '2026-10-02T14:00:00.000Z' }]);
  });

  it('stores ticked default items and custom items, and removes deleted ones', async () => {
    const res = await sync(owner, [
      change({ type: 'checklist', eventId, itemId: 'default:registration', done: true }, '2026-10-02T15:00:00.000Z'),
      change({ type: 'checklist', eventId, itemId: 'cust_1', label: 'Bring visiting cards', sort: 100 }, '2026-10-02T15:00:01.000Z'),
      change({ type: 'checklist', eventId, itemId: 'cust_2', label: 'Typo item', sort: 101 }, '2026-10-02T15:00:02.000Z'),
      change({ type: 'checklist', eventId, itemId: 'cust_2', deleted: true }, '2026-10-02T15:00:03.000Z'),
    ]);
    const items = res.body.checklist as { id: string; label: string; done: boolean; isDefault: boolean; deleted: boolean }[];
    expect(items.find((i) => i.id === 'default:registration')).toMatchObject({ done: true, isDefault: true });
    expect(items.find((i) => i.id === 'cust_1')).toMatchObject({ label: 'Bring visiting cards', done: false, isDefault: false });
    expect(items.find((i) => i.id === 'cust_2')).toMatchObject({ deleted: true });
  });

  it('skips changes for events that no longer exist without failing the rest', async () => {
    const res = await sync(owner, [
      change({ type: 'tracking', eventId: 'evt_gone', field: 'saved', value: true }, '2026-10-02T16:00:00.000Z'),
      change({ type: 'tracking', eventId, field: 'following', value: false }, '2026-10-02T16:00:01.000Z'),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.tracking.find((t: { eventId: string }) => t.eventId === 'evt_gone')).toBeUndefined();
    expect(res.body.tracking.find((t: { eventId: string }) => t.eventId === eventId).following).toBe(false);
  });

  it('rejects malformed changes', async () => {
    const res = await sync(owner, [{ id: 'chg_bad_status_1', at: '2026-10-02T17:00:00.000Z', eventId, type: 'tracking', field: 'status', value: 'maybe' } as never]);
    expect(res.status).toBe(400);
  });

  it('keeps each person’s tracking separate', async () => {
    const res = await request(app).get('/v1/me/tracking').set('Authorization', `Bearer ${teammate.accessToken}`);
    expect(res.body.tracking).toEqual([]);
  });

  it('shows who on the team plans to go', async () => {
    await sync(teammate, [change({ type: 'tracking', eventId, field: 'status', value: 'planning' }, '2026-10-02T18:00:00.000Z')]);
    const res = await request(app).get(`/v1/events/${eventId}/visitors`).set('Authorization', `Bearer ${teammate.accessToken}`);
    expect(res.body.items).toEqual([
      { name: 'Rahul', status: 'planning', isYou: true },
      { name: 'Owner', status: 'confirmed', isYou: false },
    ]);
    // Someone who decided not to go isn't listed.
    await sync(teammate, [change({ type: 'tracking', eventId, field: 'status', value: 'not_visited' }, '2026-10-02T18:05:00.000Z')]);
    const after = await request(app).get(`/v1/events/${eventId}/visitors`).set('Authorization', `Bearer ${owner.accessToken}`);
    expect(after.body.items).toEqual([{ name: 'Owner', status: 'confirmed', isYou: true }]);
  });
});
