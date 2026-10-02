import type { AuthSession, TrackingChange, TrackingSnapshot } from '@eii/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createPgliteDb, type Db } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { refreshDemoData, seedReference } from '../src/db/seed';
import { pruneOldData } from '../src/db/retention';
import { restoreBackup, type Backup } from '../src/modules/admin/backup';
import { AuthService } from '../src/modules/auth/service';

// Test-only accounts on in-memory databases with the sample events: the team's data is backed
// up from one and restored into a fresh one, as after losing the database.
const dbs: Db[] = [];

async function fresh() {
  const db = await createPgliteDb('memory');
  dbs.push(db);
  await migrate(db);
  await seedReference(db);
  await refreshDemoData(db);
  const auth = await AuthService.create(db);
  await auth.bootstrapAdmin('owner@test.local', 'owner-test-password', 'Owner');
  const app = createApp(db, loadConfig({ NODE_ENV: 'test', DEMO_DATA: 'true' }), auth);
  const owner: AuthSession = (await request(app).post('/v1/auth/login').send({ email: 'owner@test.local', password: 'owner-test-password' })).body;
  return { db, app, owner };
}

let seq = 0;
const change = (c: Omit<TrackingChange, 'id' | 'at'>) => ({ ...c, id: `chg_backup_${++seq}`, at: '2026-10-02T10:00:00.000Z' }) as TrackingChange;

let source: Awaited<ReturnType<typeof fresh>>;
let member: AuthSession;
let backup: Backup;
let eventId: string;
let manualId: string;

const as = (app: Awaited<ReturnType<typeof fresh>>['app'], s: AuthSession) => ({
  get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${s.accessToken}`),
  post: (path: string, body: object = {}) => request(app).post(path).set('Authorization', `Bearer ${s.accessToken}`).send(body),
  patch: (path: string, body: object) => request(app).patch(path).set('Authorization', `Bearer ${s.accessToken}`).send(body),
});

beforeAll(async () => {
  source = await fresh();
  const api = (s: AuthSession) => as(source.app, s);
  const created = await api(source.owner).post('/v1/admin/users', { name: 'Priya', email: 'priya@test.local' });
  const temp: AuthSession = (await request(source.app).post('/v1/auth/login').send({ email: 'priya@test.local', password: created.body.temporaryPassword })).body;
  member = (await api(temp).post('/v1/auth/change-password', { currentPassword: created.body.temporaryPassword, newPassword: 'priya-own-password' })).body;

  [{ id: eventId }] = await source.db.query<{ id: string }>(`select id from event_occurrences where end_at > now() + interval '2 days' order by start_at limit 1`) as [{ id: string }];
  manualId = (
    await api(source.owner).post('/v1/admin/events', {
      title: 'SAP Customer Day Lucknow 2026',
      startAt: '2026-12-15T10:00:00+05:30',
      endAt: '2026-12-15T17:00:00+05:30',
      cityId: 'lucknow',
      eventType: 'conference',
      officialWebsite: 'https://example.org/sap-lucknow',
    })
  ).body.id;

  await api(member).post('/v1/me/sync', {
    changes: [
      change({ type: 'tracking', eventId, field: 'saved', value: true }),
      change({ type: 'tracking', eventId, field: 'status', value: 'planning' }),
      change({ type: 'tracking', eventId, field: 'visitDate', value: '2026-11-12' }),
      change({ type: 'note', eventId, body: 'Meet the Odoo partner at stall 14' }),
      change({ type: 'checklist', eventId, itemId: 'custom_1', label: 'Print visiting cards' }),
      change({ type: 'tracking', eventId: manualId, field: 'following', value: true }),
    ],
  });
  await api(member).post('/v1/me/reminders', { eventId, offsetMinutes: 1440 });
  await api(member).post('/v1/me/saved-searches', { name: 'SAP in Delhi', query: { q: 'SAP', cityIds: ['delhi'] } });
});

afterAll(async () => {
  for (const db of dbs) await db.close();
});

describe('backup', () => {
  it('is for admins only and never contains passwords', async () => {
    expect((await as(source.app, member).get('/v1/admin/backup')).status).toBe(403);
    const res = await as(source.app, source.owner).get('/v1/admin/backup');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="eii-backup-\d{4}-\d{2}-\d{2}\.json"/);
    backup = res.body;
    expect(JSON.stringify(backup)).not.toMatch(/password|scrypt/);
    expect(backup.users.map((u) => u.email).sort()).toEqual(['owner@test.local', 'priya@test.local']);
    expect(backup.manualEvents.map((e) => e.id)).toEqual([manualId]);
    expect(backup.tables.user_event_tracking).toHaveLength(2);
  });
});

describe('restore', () => {
  it('puts the team’s data back into a new database', async () => {
    const target = await fresh();
    const report = await restoreBackup(target.db, backup);
    // The owner already exists (matched by email); Priya is created and must be given a password.
    expect(report.createdUsers).toEqual(['priya@test.local']);
    expect(report.manualEvents).toBe(1);
    expect(report.skipped).toEqual({});
    expect((await request(target.app).post('/v1/auth/login').send({ email: 'priya@test.local', password: 'priya-own-password' })).status).toBe(401);

    // After the admin resets her password, everything is there.
    const [priya] = await target.db.query<{ id: string }>(`select id from users where email = 'priya@test.local'`);
    const reset = await as(target.app, target.owner).patch(`/v1/admin/users/${priya!.id}`, { resetPassword: true });
    const temp: AuthSession = (await request(target.app).post('/v1/auth/login').send({ email: 'priya@test.local', password: reset.body.temporaryPassword })).body;
    const session: AuthSession = (await as(target.app, temp).post('/v1/auth/change-password', { currentPassword: reset.body.temporaryPassword, newPassword: 'priya-new-password' })).body;
    const snapshot: TrackingSnapshot = (await as(target.app, session).get('/v1/me/tracking')).body;
    expect(snapshot.tracking.find((t) => t.eventId === eventId)).toMatchObject({ saved: true, status: 'planning', visitDate: '2026-11-12' });
    expect(snapshot.tracking.find((t) => t.eventId === manualId)).toMatchObject({ following: true });
    expect(snapshot.notes.find((n) => n.eventId === eventId)?.body).toBe('Meet the Odoo partner at stall 14');
    expect(snapshot.checklist.some((i) => i.eventId === eventId && i.label === 'Print visiting cards')).toBe(true);
    expect((await as(target.app, session).get('/v1/me/reminders')).body.items).toHaveLength(1);
    expect((await as(target.app, session).get('/v1/me/saved-searches')).body.items.map((s: { name: string }) => s.name)).toEqual(['SAP in Delhi']);
    expect((await as(target.app, session).get(`/v1/events/${manualId}`)).body.title).toBe('SAP Customer Day Lucknow 2026');

    // Restoring again changes nothing.
    const again = await restoreBackup(target.db, backup);
    expect(again.createdUsers).toEqual([]);
    expect(Object.values(again.restored).every((n) => n === 0)).toBe(true);
  }, 90_000);

  it('skips rows for events not synced yet, and refuses other files', async () => {
    const target = await fresh();
    await target.db.query(`delete from event_occurrences where id = $1`, [eventId]);
    const report = await restoreBackup(target.db, backup);
    expect(report.skipped).toMatchObject({ user_event_tracking: 1, event_notes: 1, reminders: 1 });
    await expect(restoreBackup(target.db, { hello: 'world' })).rejects.toThrow(/not an Event Intelligence India backup/);
  });
});

describe('upkeep', () => {
  it('removes expired sign-ins and six-month-old notifications only', async () => {
    const { db } = source;
    const [owner] = await db.query<{ id: string }>(`select id from users where email = 'owner@test.local'`);
    await db.query(
      `insert into refresh_tokens (id, user_id, family_id, token_hash, expires_at) values
         ('rt_old', $1, 'f1', 'hash_old', now() - interval '30 days'), ('rt_live', $1, 'f2', 'hash_live', now() + interval '30 days')`,
      [owner!.id],
    );
    await db.query(
      `insert into notifications (id, user_id, type, title, body, url, dedupe_key, created_at) values
         ('n_old', $1, 'interests', 'Old', '', '/', 'old', now() - interval '200 days'), ('n_new', $1, 'interests', 'New', '', '/', 'new', now())`,
      [owner!.id],
    );
    expect(await pruneOldData(db)).toEqual({ refreshTokens: 1, notifications: 1 });
    expect((await db.query(`select id from refresh_tokens where id in ('rt_old', 'rt_live')`)).map((r) => r.id)).toEqual(['rt_live']);
    expect((await db.query(`select id from notifications where id in ('n_old', 'n_new')`)).map((r) => r.id)).toEqual(['n_new']);
  });
});
