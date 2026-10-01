import { CATEGORIES, CITIES, COLLECTIONS, EVENT_TYPE_LABELS, EVENT_TYPES, INDUSTRIES, istParts, REGIONS, TECHNOLOGIES, type Topic } from '@eii/shared';
import { generateDemoEvents } from '@eii/shared/demo';
import { upsertEvent } from '../modules/events/writer';
import type { Db } from './client';

/** Reference data the app relies on. Idempotent: safe on every start. */
export async function seedReference(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const r of REGIONS) {
      await tx.query(
        `insert into regions (id, name, aliases) values ($1, $2, $3)
         on conflict (id) do update set name = excluded.name, aliases = excluded.aliases`,
        [r.id, r.name, r.aliases],
      );
    }
    for (const c of CITIES) {
      await tx.query(
        `insert into cities (id, name, state, region_id, aliases, latitude, longitude, popular) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set name = excluded.name, state = excluded.state, region_id = excluded.region_id,
           aliases = excluded.aliases, latitude = excluded.latitude, longitude = excluded.longitude, popular = excluded.popular`,
        [c.id, c.name, c.state, c.region ?? null, c.aliases ?? [], c.latitude, c.longitude, c.popular ?? false],
      );
    }
    const topics = async (table: string, items: Topic[]) => {
      for (const [i, t] of items.entries()) {
        await tx.query(
          `insert into ${table} (id, name, keywords, palette, icon, sort) values ($1, $2, $3, $4, $5, $6)
           on conflict (id) do update set name = excluded.name, keywords = excluded.keywords, palette = excluded.palette,
             icon = excluded.icon, sort = excluded.sort`,
          [t.id, t.name, t.keywords ?? [], t.palette, t.icon, i],
        );
      }
    };
    await topics('categories', CATEGORIES);
    await topics('technologies', TECHNOLOGIES);
    await topics('industries', INDUSTRIES);
    for (const [i, id] of EVENT_TYPES.entries()) {
      await tx.query(
        `insert into event_types (id, name, sort) values ($1, $2, $3) on conflict (id) do update set name = excluded.name, sort = excluded.sort`,
        [id, EVENT_TYPE_LABELS[id], i],
      );
    }
    // Collections no longer in the list are hidden, not deleted.
    await tx.query('update collections set is_active = false where not (id = any($1::text[]))', [COLLECTIONS.map((c) => c.id)]);
    for (const [i, c] of COLLECTIONS.entries()) {
      await tx.query(
        `insert into collections (id, name, description, filter, sort) values ($1, $2, $3, $4, $5)
         on conflict (id) do update set name = excluded.name, description = excluded.description, filter = excluded.filter, sort = excluded.sort, is_active = true`,
        [c.id, c.name, c.description, JSON.stringify(c.query), i],
      );
    }
    await tx.query(
      `insert into sources (id, name, adapter, kind, priority, enabled, compliance_note) values ('demo', 'Sample data', 'demo', 'demo', 0, false,
         'Synthetic events for previewing the app. Not a real source.')
       on conflict (id) do nothing`,
    );
  });
}


const istDay = (now: Date) => {
  const p = istParts(now);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/**
 * Replaces the clearly-labelled sample events with a fresh set laid out from today, at most once
 * per day. Removed once real sources are connected (Phase 3). Returns true when it reseeded.
 */
export async function refreshDemoData(db: Db, now: Date = new Date(), force = false): Promise<boolean> {
  const today = istDay(now);
  const state = await db.query<{ value: { day: string } }>(`select value from app_state where key = 'demo_seed'`);
  if (!force && state[0]?.value.day === today) return false;

  const events = generateDemoEvents({ now });
  await db.transaction(async (tx) => {
    await tx.query('delete from event_occurrences where is_demo');
    await tx.query(`delete from speakers where id like 'evt_demo_%'`);
    await tx.query(`delete from exhibitors where id like 'evt_demo_%'`);
    for (const event of events) await upsertEvent(tx, event, 'demo');
    await tx.query(
      `insert into app_state (key, value, updated_at) values ('demo_seed', $1, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify({ day: today, count: events.length })],
    );
  });
  return true;
}

/** Removes all sample events once real sources are in use (DEMO_DATA=false). */
export async function purgeDemoData(db: Db): Promise<number> {
  return db.transaction(async (tx) => {
    const removed = await tx.query<{ id: string }>('delete from event_occurrences where is_demo returning id');
    await tx.query(`delete from speakers where id like 'evt_demo_%'`);
    await tx.query(`delete from exhibitors where id like 'evt_demo_%'`);
    await tx.query(`delete from app_state where key = 'demo_seed'`);
    return removed.length;
  });
}
