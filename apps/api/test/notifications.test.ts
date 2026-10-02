import type { AppNotification, AuthSession, CalendarLinks } from '@eii/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createPgliteDb, type Db } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { refreshDemoData, seedReference } from '../src/db/seed';
import { AuthService } from '../src/modules/auth/service';
import { EventService } from '../src/modules/events/service';
import type { PushPayload, PushSender } from '../src/modules/notifications/push';
import { inQuietHours, NotificationService } from '../src/modules/notifications/service';

// Test-only accounts on an in-memory database; pushes are captured, not sent.
let db: Db;
let app: ReturnType<typeof createApp>;
let owner: AuthSession;
let other: AuthSession;
let service: NotificationService;
const sent: { endpoint: string; payload: PushPayload }[] = [];
const sender: PushSender = {
  publicKey: 'test-public-key',
  send: async (target, payload) => {
    if (target.endpoint.includes('gone')) return 'gone';
    sent.push({ endpoint: target.endpoint, payload });
    return 'ok';
  },
};

/** 12:00 noon India time on 2 Oct 2026: outside quiet hours. */
const NOON = new Date('2026-10-02T06:30:00Z');
const as = (s: AuthSession) => ({
  get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${s.accessToken}`),
  post: (path: string, body: object = {}) => request(app).post(path).set('Authorization', `Bearer ${s.accessToken}`).send(body),
  put: (path: string, body: object) => request(app).put(path).set('Authorization', `Bearer ${s.accessToken}`).send(body),
});
const subscribe = (s: AuthSession, endpoint: string) => as(s).post('/v1/me/push-subscriptions', { endpoint, keys: { p256dh: 'p256dh-test-key-value', auth: 'auth-test-key' } });
const inbox = async (s: AuthSession) => (await as(s).get('/v1/me/notifications')).body as { items: AppNotification[]; unread: number };

beforeAll(async () => {
  db = await createPgliteDb('memory');
  await migrate(db);
  await seedReference(db);
  await refreshDemoData(db);
  const auth = await AuthService.create(db);
  await auth.bootstrapAdmin('owner@test.local', 'owner-test-password', 'Owner');
  app = createApp(db, loadConfig({ NODE_ENV: 'test', DEMO_DATA: 'true' }), auth, sender);
  owner = (await request(app).post('/v1/auth/login').send({ email: 'owner@test.local', password: 'owner-test-password' })).body;
  const created = await as(owner).post('/v1/admin/users', { name: 'Rahul', email: 'rahul@test.local' });
  const temp: AuthSession = (await request(app).post('/v1/auth/login').send({ email: 'rahul@test.local', password: created.body.temporaryPassword })).body;
  other = (await as(temp).post('/v1/auth/change-password', { currentPassword: created.body.temporaryPassword, newPassword: 'rahul-own-password' })).body;
  const events = new EventService(db);
  service = new NotificationService(db, events, events.repo, sender);
  await subscribe(owner, 'https://push.example/owner-phone');
});

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  await db.close();
});

describe('delivery rules', () => {
  it('knows quiet hours across midnight', () => {
    const s = { quietStart: 21 * 60, quietEnd: 8 * 60 };
    expect(inQuietHours(new Date('2026-10-02T17:00:00Z'), s)).toBe(true); // 22:30 IST
    expect(inQuietHours(new Date('2026-10-01T23:00:00Z'), s)).toBe(true); // 04:30 IST
    expect(inQuietHours(NOON, s)).toBe(false);
  });

  it('keeps everything in the inbox, pushes once, never twice', async () => {
    const draft = { type: 'interests' as const, title: 'A', body: 'B', url: '/', dedupeKey: 'unit:once' };
    expect(await service.deliver(owner.user.id, draft, NOON)).toBe(true);
    expect(await service.deliver(owner.user.id, draft, NOON)).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({ title: 'A', url: '/' });
  });

  it('holds non-critical pushes in quiet hours but not critical ones or reminders', async () => {
    const night = new Date('2026-10-02T17:00:00Z');
    await service.deliver(owner.user.id, { type: 'change', title: 'Minor', body: '', url: '/', dedupeKey: 'unit:night1' }, night);
    await service.deliver(owner.user.id, { type: 'change', title: 'Cancelled', body: '', url: '/', critical: true, dedupeKey: 'unit:night2' }, night);
    await service.deliver(owner.user.id, { type: 'reminder', title: 'Reminder', body: '', url: '/', dedupeKey: 'unit:night3' }, night);
    expect(sent.map((s) => s.payload.title)).toEqual(['Cancelled', 'Reminder']);
  });

  it('pushes at most 3 ordinary alerts a day; the rest stay in the inbox', async () => {
    const day = new Date('2026-10-03T06:30:00Z');
    for (let i = 0; i < 5; i++) await service.deliver(other.user.id, { type: 'interests', title: `N${i}`, body: '', url: '/', dedupeKey: `unit:cap${i}` }, day);
    await subscribe(other, 'https://push.example/rahul-phone');
    sent.length = 0;
    const next = new Date('2026-10-04T06:30:00Z');
    for (let i = 0; i < 5; i++) await service.deliver(other.user.id, { type: 'interests', title: `M${i}`, body: '', url: '/', dedupeKey: `unit:cap-next${i}` }, next);
    expect(sent).toHaveLength(3);
    expect((await inbox(other)).items.filter((n) => n.title.startsWith('M'))).toHaveLength(5);
  });

  it('respects a switched-off type and forgets devices that unsubscribed', async () => {
    const settings = (await as(owner).get('/v1/me/notification-settings')).body;
    await as(owner).put('/v1/me/notification-settings', { ...settings, types: { ...settings.types, interests: false } });
    await service.deliver(owner.user.id, { type: 'interests', title: 'Off', body: '', url: '/', dedupeKey: 'unit:off' }, NOON);
    expect(sent).toHaveLength(0);
    await as(owner).put('/v1/me/notification-settings', settings);

    await subscribe(owner, 'https://push.example/gone-phone');
    await service.push(owner.user.id, { title: 'x', body: '', url: '/' });
    const [{ n }] = (await db.query<{ n: number }>(`select count(*)::int as n from push_subscriptions where endpoint like '%gone%'`)) as [{ n: number }];
    expect(n).toBe(0);
  });

  it('marks the inbox read', async () => {
    expect((await inbox(owner)).unread).toBeGreaterThan(0);
    await as(owner).post('/v1/me/notifications/read');
    expect((await inbox(owner)).unread).toBe(0);
  });
});

describe('alerts after a sync', () => {
  let eventId: string;

  beforeAll(async () => {
    // A real (non-sample) upcoming event the owner follows.
    eventId = (await db.query<{ id: string }>(`select id from event_occurrences where end_at > now() order by start_at limit 1`))[0]!.id;
    await db.query('update event_occurrences set is_demo = false where id = $1', [eventId]);
    await db.query(`insert into user_event_tracking (user_id, occurrence_id, following) values ($1, $2, true)`, [owner.user.id, eventId]);
    await service.afterSync(new Date(Date.now() - 60_000)); // starts the clock
  });

  it('tells followers what changed, from → to, and opens the event', async () => {
    await db.query(`insert into event_changes (id, occurrence_id, field, significance, old_value, new_value, detected_at) values ('chg_venue_1', $1, 'venue', 'major', 'Hall A', 'Hall B', now())`, [eventId]);
    const result = await service.afterSync(new Date(Date.now() + 1000));
    expect(result.changes).toBe(1);
    const n = (await inbox(owner)).items.find((x) => x.type === 'change' && x.eventId === eventId)!;
    expect(n).toMatchObject({ body: 'Hall A → Hall B', url: `/event/${eventId}` });
    expect((await inbox(other)).items.some((x) => x.type === 'change')).toBe(false);
  });

  it('announces new events matching a saved search', async () => {
    const newEvent = (await db.query<{ id: string; title: string }>(`select id, title from event_occurrences where end_at > now() and id <> $1 order by start_at offset 3 limit 1`, [eventId]))[0]!;
    await as(other).post('/v1/me/saved-searches', { name: 'That one', query: { q: newEvent.title } });
    // Discovered after the last run, before this one.
    await db.query(`update event_occurrences set is_demo = false, created_at = now() + interval '1500 milliseconds' where id = $1`, [newEvent.id]);
    const result = await service.afterSync(new Date(Date.now() + 5000));
    expect(result.savedSearch).toBe(1);
    expect((await inbox(other)).items.find((n) => n.type === 'saved_search')).toMatchObject({ title: 'New for “That one”', url: `/event/${newEvent.id}` });
  });
});

describe('reminders', () => {
  it('fires once when due, and follows the event’s start time', async () => {
    const eventId = (await db.query<{ id: string }>(`select id from event_occurrences where end_at > now() order by start_at offset 5 limit 1`))[0]!.id;
    const start = new Date(Date.now() + 90 * 60_000);
    await db.query('update event_occurrences set start_at = $2, end_at = $3 where id = $1', [eventId, start, new Date(start.getTime() + 4 * 3600_000)]);
    const created = await as(owner).post('/v1/me/reminders', { eventId, offsetMinutes: 120 });
    expect(created.status).toBe(201);
    expect(await service.remindersIfDue(new Date())).toBe(1);
    expect(sent.find((s) => s.payload.url === `/event/${eventId}/day`)).toBeTruthy();
    expect(await service.remindersIfDue(new Date())).toBe(0);
  });
});

describe('starts tomorrow', () => {
  it('reminds people who saved an event, the evening before', async () => {
    const eventId = (await db.query<{ id: string }>(`select id from event_occurrences where end_at > now() order by start_at offset 7 limit 1`))[0]!.id;
    const evening = new Date('2026-10-05T13:00:00Z'); // 18:30 IST
    await db.query('update event_occurrences set start_at = $2, end_at = $3, status = $4 where id = $1', [eventId, new Date('2026-10-06T04:00:00Z'), new Date('2026-10-06T12:00:00Z'), 'upcoming']);
    await db.query(`insert into user_event_tracking (user_id, occurrence_id, saved) values ($1, $2, true) on conflict do nothing`, [other.user.id, eventId]);
    expect(await service.startsTomorrow(evening)).toBeGreaterThanOrEqual(1);
    expect(await service.startsTomorrow(evening)).toBe(0);
    expect((await inbox(other)).items.some((n) => n.type === 'starts_tomorrow' && n.url === `/event/${eventId}/day`)).toBe(true);
  });
});

describe('add to calendar', () => {
  it('gives a signed calendar file and a Google Calendar link', async () => {
    const eventId = (await db.query<{ id: string }>(`select id from event_occurrences where end_at > now() and not all_day order by start_at limit 1`))[0]!.id;
    const links: CalendarLinks = (await as(owner).get(`/v1/events/${eventId}/calendar`)).body;
    expect(links.googleUrl).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    const url = new URL(links.icsUrl);
    const ics = await request(app).get(`${url.pathname}${url.search}`);
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toMatch(/text\/calendar/);
    expect(ics.text).toMatch(/BEGIN:VEVENT[\s\S]*DTSTART:\d{8}T\d{6}Z[\s\S]*END:VCALENDAR/);
    // A tampered link opens nothing.
    expect((await request(app).get(`${url.pathname}?exp=${url.searchParams.get('exp')}&sig=not-the-right-signature`)).status).toBe(404);
  });

  it('needs the push key only when signed in', async () => {
    expect((await request(app).get('/v1/push/key')).status).toBe(401);
    expect((await as(owner).get('/v1/push/key')).body).toEqual({ publicKey: 'test-public-key' });
  });
});
