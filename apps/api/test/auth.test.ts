import type { AuthSession, Preferences, Relevance, EventSummary, TemporaryPassword } from '@eii/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createPgliteDb, type Db } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { refreshDemoData, seedReference } from '../src/db/seed';
import { AuthService } from '../src/modules/auth/service';

// Test-only accounts and passwords for an in-memory database.
const ADMIN = { email: 'owner@test.local', password: 'owner-test-password' };
let db: Db;
let app: ReturnType<typeof createApp>;
let admin: AuthSession;

const login = (email: string, password: string) => request(app).post('/v1/auth/login').send({ email, password });
const as = (token: string) => ({
  get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body),
  put: (path: string, body: object) => request(app).put(path).set('Authorization', `Bearer ${token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(path).set('Authorization', `Bearer ${token}`).send(body),
});

beforeAll(async () => {
  db = await createPgliteDb('memory');
  await migrate(db);
  await seedReference(db);
  await refreshDemoData(db);
  const auth = await AuthService.create(db);
  await auth.bootstrapAdmin(ADMIN.email, ADMIN.password, 'Owner');
  app = createApp(db, loadConfig({ NODE_ENV: 'test', DEMO_DATA: 'true' }), auth);
  admin = (await login(ADMIN.email, ADMIN.password)).body;
});

afterAll(async () => {
  await db.close();
});

describe('signing in', () => {
  it('needs an account for everything except signing in', async () => {
    expect((await request(app).get('/v1/events')).status).toBe(401);
    expect((await request(app).get('/v1/events').set('Authorization', 'Bearer not-a-token')).status).toBe(401);
    expect((await as(admin.accessToken).get('/v1/events')).status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await login(ADMIN.email, 'not-the-password');
    const unknown = await login('nobody@test.local', 'whatever-password');
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('matches email without regard to case and returns the profile', async () => {
    const res = await login('OWNER@test.local', ADMIN.password);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: ADMIN.email, role: 'admin', mustChangePassword: false, onboarded: false });
  });

  it('rotates refresh tokens, and a reused one ends that sign-in everywhere', async () => {
    const first: AuthSession = (await login(ADMIN.email, ADMIN.password)).body;
    const second = await request(app).post('/v1/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(second.status).toBe(200);
    expect(second.body.refreshToken).not.toBe(first.refreshToken);
    // The old token is presented again (e.g. it was copied): both it and its successor stop working.
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: first.refreshToken })).status).toBe(401);
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: second.body.refreshToken })).status).toBe(401);
  });

  it('signs out a device', async () => {
    const session: AuthSession = (await login(ADMIN.email, ADMIN.password)).body;
    expect((await request(app).post('/v1/auth/logout').send({ refreshToken: session.refreshToken })).status).toBe(204);
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: session.refreshToken })).status).toBe(401);
  });
});

describe('team accounts', () => {
  let member: TemporaryPassword;

  it('lets the admin add someone with a temporary password', async () => {
    const res = await as(admin.accessToken).post('/v1/admin/users', { name: 'Priya', email: 'priya@test.local' });
    expect(res.status).toBe(201);
    member = res.body;
    expect(member.temporaryPassword).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(member.member).toMatchObject({ role: 'user', mustChangePassword: true, isActive: true });
    expect((await as(admin.accessToken).post('/v1/admin/users', { name: 'Again', email: 'PRIYA@test.local' })).status).toBe(409);
  });

  it('allows only choosing a new password until the temporary one is replaced', async () => {
    const temp: AuthSession = (await login('priya@test.local', member.temporaryPassword)).body;
    expect(temp.user.mustChangePassword).toBe(true);
    expect((await as(temp.accessToken).get('/v1/events')).status).toBe(403);
    expect((await as(temp.accessToken).get('/v1/me')).status).toBe(200);

    const short = await as(temp.accessToken).post('/v1/auth/change-password', { currentPassword: member.temporaryPassword, newPassword: 'short' });
    expect(short.status).toBe(400);
    const changed = await as(temp.accessToken).post('/v1/auth/change-password', { currentPassword: member.temporaryPassword, newPassword: 'priya-own-password' });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect((await as(changed.body.accessToken).get('/v1/events')).status).toBe(200);
    // The temporary sign-in no longer refreshes; the temporary password no longer works.
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: temp.refreshToken })).status).toBe(401);
    expect((await login('priya@test.local', member.temporaryPassword)).status).toBe(401);
  });

  it('keeps admin tools from team members', async () => {
    const priya: AuthSession = (await login('priya@test.local', 'priya-own-password')).body;
    expect((await as(priya.accessToken).get('/v1/admin/users')).status).toBe(403);
    expect((await as(admin.accessToken).get('/v1/admin/users')).body.items).toHaveLength(2);
  });

  it('removing someone ends their sessions and blocks sign-in; the admin can’t remove themselves', async () => {
    const priya: AuthSession = (await login('priya@test.local', 'priya-own-password')).body;
    expect((await as(admin.accessToken).patch(`/v1/admin/users/${member.member.id}`, { isActive: false })).status).toBe(200);
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: priya.refreshToken })).status).toBe(401);
    expect((await login('priya@test.local', 'priya-own-password')).status).toBe(401);
    expect((await as(admin.accessToken).patch(`/v1/admin/users/${admin.user.id}`, { isActive: false })).status).toBe(400);
  });

  it('resets a password to a new temporary one', async () => {
    await as(admin.accessToken).patch(`/v1/admin/users/${member.member.id}`, { isActive: true });
    const reset = await as(admin.accessToken).patch(`/v1/admin/users/${member.member.id}`, { resetPassword: true });
    expect(reset.body.temporaryPassword).toBeTruthy();
    expect((await login('priya@test.local', reset.body.temporaryPassword)).body.user.mustChangePassword).toBe(true);
  });
});

describe('interests and suggestions', () => {
  it('saves interests, rejecting unknown ones', async () => {
    const api = as(admin.accessToken);
    expect((await api.get('/v1/me/preferences')).body).toEqual({ cityIds: [], categoryIds: [], technologyIds: [], industryIds: [], eventTypes: [] });
    expect((await api.put('/v1/me/preferences', { cityIds: [], categoryIds: ['not-a-topic'], technologyIds: [], industryIds: [], eventTypes: [] })).status).toBe(400);
    const prefs: Preferences = { cityIds: ['hyderabad'], categoryIds: ['manufacturing'], technologyIds: ['sap'], industryIds: [], eventTypes: ['summit'] };
    const saved = await api.put('/v1/me/preferences', prefs);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(prefs);
  });

  it('suggests matching events best first, with reasons', async () => {
    const res = await as(admin.accessToken).get('/v1/me/for-you?limit=10');
    const items: (EventSummary & { relevance: Relevance })[] = res.body.items;
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) expect(items[i - 1]!.relevance.score).toBeGreaterThanOrEqual(items[i]!.relevance.score);
    const top = items[0]!;
    expect(top.relevance.reasons.length).toBeGreaterThan(0);
    expect(top.technologyIds.includes('sap') || top.categoryIds.includes('manufacturing') || top.cityId === 'hyderabad').toBe(true);
  });

  it('records onboarding once', async () => {
    const res = await as(admin.accessToken).patch('/v1/me', { onboarded: true });
    expect(res.body.onboarded).toBe(true);
  });
});
