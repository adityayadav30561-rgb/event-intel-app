import { eventQuerySchema } from '@eii/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { cacheFor, notFound, parse } from '../../lib/http';
import type { EventService } from '../events/service';

/** Configurable taxonomy, places and curated collections. Read from the database (spec §22–23, §72). */
export function taxonomyRoutes(db: Db, events: EventService): Router {
  const router = Router();
  const topics = (table: 'categories' | 'technologies' | 'industries') => async (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ items: await db.query(`select id, name, keywords, palette, icon from ${table} where is_active order by sort, name`) });
  };

  router.get('/categories', cacheFor(3600), topics('categories'));
  router.get('/technologies', cacheFor(3600), topics('technologies'));
  router.get('/industries', cacheFor(3600), topics('industries'));
  router.get('/event-types', cacheFor(3600), async (_req, res) => {
    res.json({ items: await db.query('select id, name from event_types where is_active order by sort') });
  });

  /** Cities with how many upcoming events each has (spec §21). */
  router.get('/cities', cacheFor(300), async (_req, res) => {
    const [cities, counts] = await Promise.all([
      db.query<{ id: string; name: string; state: string; region_id: string | null; latitude: number; longitude: number; popular: boolean }>(
        'select id, name, state, region_id, latitude, longitude, popular from cities order by name',
      ),
      events.repo.cityCounts(new Date()),
    ]);
    const countOf = new Map(counts.map((c) => [c.cityId, c.count]));
    res.json({
      items: cities.map((c) => ({
        id: c.id,
        name: c.name,
        state: c.state,
        regionId: c.region_id ?? undefined,
        latitude: c.latitude,
        longitude: c.longitude,
        popular: c.popular,
        upcomingCount: countOf.get(c.id) ?? 0,
      })),
    });
  });

  router.get('/collections', cacheFor(300), async (_req, res) => {
    res.json({ items: await db.query('select id, name, description from collections where is_active order by sort') });
  });

  router.get('/collections/:id', cacheFor(60), async (req, res) => {
    const id = parse(z.string().max(80), req.params.id);
    const rows = await db.query<{ id: string; name: string; description: string | null; filter: Record<string, unknown> }>(
      'select id, name, description, filter from collections where id = $1 and is_active',
      [id],
    );
    const collection = rows[0];
    if (!collection) throw notFound('Collection');
    const paging = parse(eventQuerySchema.pick({ cursor: true, limit: true }), req.query);
    const filter = parse(eventQuerySchema, collection.filter);
    res.json({ collection: { id: collection.id, name: collection.name, description: collection.description }, page: await events.list({ ...filter, ...paging }) });
  });

  return router;
}
