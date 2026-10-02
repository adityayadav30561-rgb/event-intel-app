import {
  DEFAULT_NOTIFICATION_SETTINGS,
  describeChange,
  formatDateRange,
  istParts,
  istStartOfDay,
  rankByRelevance,
  reminderLabel,
  type AppNotification,
  type ChangeField,
  type EventSummary,
  type NotificationSettings,
  type NotificationType,
  type Reminder,
  type SavedSearchQuery,
} from '@eii/shared';
import type { Db } from '../../db/client';
import { logger } from '../../lib/logger';
import { newId } from '../auth/crypto';
import type { EventRepository } from '../events/repository';
import type { EventService } from '../events/service';
import { loadPreferences } from '../me/preferences';
import type { PushSender } from './push';

/** At most this many non-critical pushes per person per day; the rest go to the inbox only (§10.4). */
const DAILY_PUSH_LIMIT = 3;

export type NotificationDraft = {
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  eventId?: string;
  /** Cancellations, postponements and date changes: pushed even in quiet hours. */
  critical?: boolean;
  /** The same key never notifies the same person twice. */
  dedupeKey: string;
};

type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  occurrence_id: string | null;
  critical: boolean;
  created_at: Date;
  read_at: Date | null;
};

const toNotification = (r: NotificationRow): AppNotification => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  url: r.url,
  eventId: r.occurrence_id,
  critical: r.critical,
  createdAt: new Date(r.created_at).toISOString(),
  readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
});

const minutesIst = (d: Date) => {
  const p = istParts(d);
  return p.hour * 60 + p.minute;
};

/** Quiet hours may cross midnight (21:00–08:00). */
export function inQuietHours(now: Date, s: Pick<NotificationSettings, 'quietStart' | 'quietEnd'>): boolean {
  const m = minutesIst(now);
  if (s.quietStart === s.quietEnd) return false;
  return s.quietStart < s.quietEnd ? m >= s.quietStart && m < s.quietEnd : m >= s.quietStart || m < s.quietEnd;
}

const titleAndMore = (titles: string[]) => (titles.length === 1 ? titles[0]! : `${titles[0]} and ${titles.length - 1} more`);

/** Alerts, reminders and the inbox (docs/DEVELOPMENT_PLAN.md Phase 7, §10.4). */
export class NotificationService {
  /** Earliest time an unsent reminder is due; undefined = not loaded yet (keeps the database asleep between reminders). */
  private nextReminder: number | null | undefined;

  constructor(
    private readonly db: Db,
    private readonly events: EventService,
    private readonly repo: EventRepository,
    readonly sender: PushSender,
  ) {}

  // ── Settings, devices, inbox ────────────────────────────────────────────

  async settings(userId: string): Promise<NotificationSettings> {
    const [row] = await this.db.query<{ types: Partial<NotificationSettings['types']>; quiet_start: number; quiet_end: number }>(
      'select types, quiet_start, quiet_end from notification_settings where user_id = $1',
      [userId],
    );
    if (!row) return DEFAULT_NOTIFICATION_SETTINGS;
    return { types: { ...DEFAULT_NOTIFICATION_SETTINGS.types, ...row.types }, quietStart: row.quiet_start, quietEnd: row.quiet_end };
  }

  async saveSettings(userId: string, s: NotificationSettings): Promise<NotificationSettings> {
    await this.db.query(
      `insert into notification_settings (user_id, types, quiet_start, quiet_end) values ($1, $2, $3, $4)
       on conflict (user_id) do update set types = excluded.types, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, updated_at = now()`,
      [userId, JSON.stringify(s.types), s.quietStart, s.quietEnd],
    );
    return this.settings(userId);
  }

  async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<void> {
    // An endpoint belongs to one device; if someone else signed in on it, it moves to them.
    await this.db.query(
      `insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5, $6)
       on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
      [newId('push'), userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 200) ?? null],
    );
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.db.query('delete from push_subscriptions where user_id = $1 and endpoint = $2', [userId, endpoint]);
  }

  async inbox(userId: string, before?: string, limit = 30): Promise<{ items: AppNotification[]; unread: number; nextBefore: string | null }> {
    const rows = await this.db.query<NotificationRow>(
      `select id, type, title, body, url, occurrence_id, critical, created_at, read_at from notifications
       where user_id = $1 and ($2::timestamptz is null or created_at < $2) order by created_at desc limit $3`,
      [userId, before ?? null, limit + 1],
    );
    const [{ n }] = (await this.db.query<{ n: number }>('select count(*)::int as n from notifications where user_id = $1 and read_at is null', [userId])) as [{ n: number }];
    const items = rows.slice(0, limit).map(toNotification);
    return { items, unread: n, nextBefore: rows.length > limit ? items[items.length - 1]!.createdAt : null };
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    if (ids?.length) await this.db.query('update notifications set read_at = now() where user_id = $1 and id = any($2::text[]) and read_at is null', [userId, ids]);
    else await this.db.query('update notifications set read_at = now() where user_id = $1 and read_at is null', [userId]);
  }

  // ── Delivery ────────────────────────────────────────────────────────────

  /**
   * Records an alert in the person's inbox and pushes it to their devices, unless: the type is
   * switched off, it's quiet hours (non-critical), or today's push limit is reached. Returns
   * false when this alert was already sent.
   */
  async deliver(userId: string, draft: NotificationDraft, now = new Date()): Promise<boolean> {
    const id = newId('ntf');
    const inserted = await this.db.query<{ id: string }>(
      `insert into notifications (id, user_id, type, title, body, url, occurrence_id, critical, dedupe_key, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (user_id, dedupe_key) do nothing returning id`,
      [id, userId, draft.type, draft.title, draft.body, draft.url, draft.eventId ?? null, draft.critical ?? false, draft.dedupeKey, now],
    );
    if (!inserted.length) return false;

    const settings = await this.settings(userId);
    if (!settings.types[draft.type]) return true;
    const urgent = Boolean(draft.critical) || draft.type === 'reminder';
    if (!urgent) {
      if (inQuietHours(now, settings)) return true;
      const [{ n }] = (await this.db.query<{ n: number }>(
        `select count(*)::int as n from notifications where user_id = $1 and pushed_at >= $2 and not critical and type <> 'reminder'`,
        [userId, istStartOfDay(now)],
      )) as [{ n: number }];
      if (n >= DAILY_PUSH_LIMIT) return true;
    }
    if (await this.push(userId, { title: draft.title, body: draft.body, url: draft.url, tag: draft.dedupeKey })) {
      await this.db.query('update notifications set pushed_at = $2 where id = $1', [id, now]);
    }
    return true;
  }

  /** Sends to every device of the person; forgets devices that unsubscribed. True if any accepted it. */
  async push(userId: string, payload: { title: string; body: string; url: string; tag?: string }): Promise<boolean> {
    const subs = await this.db.query<{ id: string; endpoint: string; p256dh: string; auth: string }>('select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1', [userId]);
    let delivered = false;
    for (const sub of subs) {
      const result = await this.sender.send(sub, payload);
      if (result === 'ok') {
        delivered = true;
        await this.db.query('update push_subscriptions set last_used_at = now() where id = $1', [sub.id]);
      } else if (result === 'gone') await this.db.query('delete from push_subscriptions where id = $1', [sub.id]);
    }
    return delivered;
  }

  // ── After each sync: changes to followed events, new matches ─────────────

  /**
   * Everything that happened since the last run: changes to events people follow, and new events
   * matching saved searches or interests. The first run only starts the clock (no backlog of alerts).
   */
  async afterSync(now = new Date()): Promise<{ changes: number; savedSearch: number; interests: number }> {
    const counts = { changes: 0, savedSearch: 0, interests: 0 };
    const [cursorRow] = await this.db.query<{ at: string }>(`select value #>> '{}' as at from app_state where key = 'notify_cursor'`);
    const setCursor = () =>
      this.db.query(
        `insert into app_state (key, value) values ('notify_cursor', to_jsonb($1::text)) on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [now.toISOString()],
      );
    if (!cursorRow) {
      await setCursor();
      return counts;
    }
    const since = new Date(cursorRow.at);

    // 1. Changes to followed events (major and critical only).
    const changes = await this.db.query<{ id: string; occurrence_id: string; field: ChangeField; significance: string; old_value: string | null; new_value: string | null; title: string }>(
      `select ec.id, ec.occurrence_id, ec.field, ec.significance, ec.old_value, ec.new_value, o.title
       from event_changes ec join event_occurrences o on o.id = ec.occurrence_id
       where ec.detected_at > $1 and ec.detected_at <= $2 and ec.significance in ('critical', 'major') and not o.is_demo and o.deleted_at is null
       order by ec.detected_at`,
      [since, now],
    );
    for (const c of changes) {
      const followers = await this.db.query<{ user_id: string }>(
        `select t.user_id from user_event_tracking t join users u on u.id = t.user_id where t.occurrence_id = $1 and t.following and u.is_active`,
        [c.occurrence_id],
      );
      const what = describeChange({ field: c.field, current: c.new_value ?? undefined });
      const detail = c.old_value && c.new_value ? `${c.old_value} → ${c.new_value}` : (c.new_value ?? 'See what changed');
      for (const f of followers) {
        const sent = await this.deliver(
          f.user_id,
          { type: 'change', title: `${what}: ${c.title}`, body: detail, url: `/event/${c.occurrence_id}`, eventId: c.occurrence_id, critical: c.significance === 'critical', dedupeKey: `change:${c.id}` },
          now,
        );
        if (sent) counts.changes += 1;
      }
    }

    // 2. New events: saved-search matches first, then a digest of other interest matches.
    const fresh = await this.db.query<{ id: string }>(
      `select id from event_occurrences where created_at > $1 and created_at <= $2 and verification_status = 'verified'
         and deleted_at is null and not is_demo and end_at > $2`,
      [since, now],
    );
    if (fresh.length) {
      const freshIds = new Set(fresh.map((e) => e.id));
      const announced = new Map<string, Set<string>>();
      const searches = await this.db.query<{ id: string; user_id: string; name: string; query: SavedSearchQuery }>(
        `select s.id, s.user_id, s.name, s.query from saved_searches s join users u on u.id = s.user_id where s.notify and u.is_active`,
      );
      for (const s of searches) {
        const page = await this.events.list({ ...s.query, limit: 50 }, now, s.user_id);
        const matches = page.items.filter((e) => freshIds.has(e.id));
        if (!matches.length) continue;
        const ids = matches.map((e) => e.id).sort();
        const sent = await this.deliver(
          s.user_id,
          {
            type: 'saved_search',
            title: `New for “${s.name}”`,
            body: titleAndMore(matches.map((e) => e.title)),
            url: matches.length === 1 ? `/event/${matches[0]!.id}` : `/saved-search/${s.id}`,
            eventId: matches.length === 1 ? matches[0]!.id : undefined,
            dedupeKey: `search:${s.id}:${ids.join(',')}`,
          },
          now,
        );
        if (sent) counts.savedSearch += 1;
        const seen = announced.get(s.user_id) ?? new Set();
        ids.forEach((id) => seen.add(id));
        announced.set(s.user_id, seen);
      }

      const summaries = await this.repo.byIds([...freshIds]);
      const users = await this.db.query<{ id: string }>(`select u.id from users u join user_preferences p on p.user_id = u.id where u.is_active`);
      for (const u of users) {
        const prefs = await loadPreferences(this.db, u.id);
        const already = announced.get(u.id) ?? new Set();
        const matches = rankByRelevance(summaries, prefs).filter((e) => e.relevance.level !== 'possible' && !already.has(e.id));
        if (!matches.length) continue;
        const sent = await this.deliver(
          u.id,
          {
            type: 'interests',
            title: matches.length === 1 ? 'A new event for you' : `${matches.length} new events for you`,
            body: `${titleAndMore(matches.map((e) => e.title))} — ${matches[0]!.relevance.reasons.slice(0, 2).join(', ')}`,
            url: matches.length === 1 ? `/event/${matches[0]!.id}` : '/',
            eventId: matches.length === 1 ? matches[0]!.id : undefined,
            dedupeKey: `interests:${matches.map((e) => e.id).sort().join(',')}`,
          },
          now,
        );
        if (sent) counts.interests += 1;
      }
    }

    await setCursor();
    return counts;
  }

  // ── Reminders and "starts tomorrow" ─────────────────────────────────────

  async reminders(userId: string, now = new Date()): Promise<Reminder[]> {
    const rows = await this.db.query<{ id: string; occurrence_id: string; offset_minutes: number; remind_at: Date; sent_at: Date | null }>(
      `select r.id, r.occurrence_id, r.offset_minutes, o.start_at - make_interval(mins => r.offset_minutes) as remind_at, r.sent_at
       from reminders r join event_occurrences o on o.id = r.occurrence_id
       where r.user_id = $1 and o.deleted_at is null and o.end_at > $2 order by remind_at`,
      [userId, now],
    );
    const events = new Map((await this.repo.byIds([...new Set(rows.map((r) => r.occurrence_id))])).map((e) => [e.id, e]));
    return rows
      .filter((r) => events.has(r.occurrence_id))
      .map((r) => ({
        id: r.id,
        eventId: r.occurrence_id,
        offsetMinutes: r.offset_minutes,
        remindAt: new Date(r.remind_at).toISOString(),
        sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
        event: events.get(r.occurrence_id)!,
      }));
  }

  async addReminder(userId: string, eventId: string, offsetMinutes: number): Promise<void> {
    await this.db.query(
      `insert into reminders (id, user_id, occurrence_id, offset_minutes) values ($1, $2, $3, $4)
       on conflict (user_id, occurrence_id, offset_minutes) do update set sent_at = null`,
      [newId('rem'), userId, eventId, offsetMinutes],
    );
    this.nextReminder = undefined;
  }

  async removeReminder(userId: string, id: string): Promise<void> {
    await this.db.query('delete from reminders where id = $1 and user_id = $2', [id, userId]);
    this.nextReminder = undefined;
  }

  /** Called by every tick: touches the database only when a reminder is (or may be) due. */
  async remindersIfDue(now = new Date()): Promise<number> {
    if (this.nextReminder === undefined) {
      const [row] = await this.db.query<{ at: Date | null }>(
        `select min(o.start_at - make_interval(mins => r.offset_minutes)) as at
         from reminders r join event_occurrences o on o.id = r.occurrence_id where r.sent_at is null and o.deleted_at is null and o.end_at > $1`,
        [now],
      );
      this.nextReminder = row?.at ? new Date(row.at).getTime() : null;
    }
    if (this.nextReminder === null || this.nextReminder > now.getTime()) return 0;

    const due = await this.db.query<{ id: string; user_id: string; offset_minutes: number; occurrence_id: string; title: string; start_at: Date; end_at: Date; city: string; venue: string | null }>(
      `select r.id, r.user_id, r.offset_minutes, o.id as occurrence_id, o.title, o.start_at, o.end_at, c.name as city, v.name as venue
       from reminders r join event_occurrences o on o.id = r.occurrence_id join cities c on c.id = o.city_id left join venues v on v.id = o.venue_id
       where r.sent_at is null and o.deleted_at is null and o.end_at > $1 and o.start_at - make_interval(mins => r.offset_minutes) <= $1`,
      [now],
    );
    for (const r of due) {
      await this.deliver(
        r.user_id,
        {
          type: 'reminder',
          title: `${reminderLabel(r.offset_minutes).replace(' before', '')} to go: ${r.title}`,
          body: `${formatDateRange(new Date(r.start_at), new Date(r.end_at))} · ${r.venue ?? r.city}`,
          url: r.offset_minutes <= 24 * 60 ? `/event/${r.occurrence_id}/day` : `/event/${r.occurrence_id}`,
          eventId: r.occurrence_id,
          dedupeKey: `reminder:${r.id}`,
        },
        now,
      );
      await this.db.query('update reminders set sent_at = $2 where id = $1', [r.id, now]);
    }
    this.nextReminder = undefined;
    return due.length;
  }

  /** The evening before: events people saved, follow or plan to visit (once per person and event). */
  async startsTomorrow(now = new Date()): Promise<number> {
    const from = istStartOfDay(now, 1);
    const to = istStartOfDay(now, 2);
    const rows = await this.db.query<{ user_id: string; occurrence_id: string; title: string; start_at: Date; end_at: Date; all_day: boolean; city: string; venue: string | null }>(
      `select t.user_id, o.id as occurrence_id, o.title, o.start_at, o.end_at, o.all_day, c.name as city, v.name as venue
       from user_event_tracking t join event_occurrences o on o.id = t.occurrence_id join users u on u.id = t.user_id
       join cities c on c.id = o.city_id left join venues v on v.id = o.venue_id
       where u.is_active and o.deleted_at is null and o.status not in ('cancelled', 'completed')
         and (t.saved or t.following or t.status in ('planning', 'confirmed', 'visiting'))
         and o.start_at >= $1 and o.start_at < $2`,
      [from, to],
    );
    let sent = 0;
    for (const r of rows) {
      const ok = await this.deliver(
        r.user_id,
        {
          type: 'starts_tomorrow',
          title: `Tomorrow: ${r.title}`,
          body: [r.venue ?? r.city, r.all_day ? undefined : new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(r.start_at))]
            .filter(Boolean)
            .join(' · '),
          url: `/event/${r.occurrence_id}/day`,
          eventId: r.occurrence_id,
          dedupeKey: `tomorrow:${r.occurrence_id}`,
        },
        now,
      );
      if (ok) sent += 1;
    }
    return sent;
  }

  /** A test alert to the person's own devices (Settings → Notifications). */
  async test(userId: string): Promise<boolean> {
    return this.push(userId, { title: 'Alerts are on', body: 'This is how Event Intel will tell you about changes and reminders.', url: '/settings/notifications' });
  }

  /** Summaries for the inbox's event links (unused events are skipped). */
  async eventSummaries(ids: string[]): Promise<EventSummary[]> {
    return this.repo.byIds(ids);
  }
}

export const logNotificationError = (error: unknown) => logger.error({ err: error }, 'Notifications failed');
