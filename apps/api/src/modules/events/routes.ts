import { eventQuerySchema, homeQuerySchema, mapQuerySchema } from '@eii/shared';
import { Router } from 'express';
import { z } from 'zod';
import { cacheFor, notFound, parse } from '../../lib/http';
import { mapData } from './map';
import type { EventService } from './service';

const id = z.string().min(1).max(120);

/** Public read API for events (docs/DEVELOPMENT_PLAN.md §7). */
export function eventRoutes(events: EventService): Router {
  const router = Router();

  router.get('/home', cacheFor(30), async (req, res) => {
    res.json(await events.home(parse(homeQuerySchema, req.query)));
  });

  router.get('/events', cacheFor(30), async (req, res) => {
    res.json(await events.list(parse(eventQuerySchema, req.query), new Date(), req.auth?.id));
  });

  router.get('/events/map', cacheFor(30), async (req, res) => {
    const { west, south, east, north, zoom, ...filters } = parse(mapQuerySchema, req.query);
    res.json(await mapData(events.repo, filters, { west, south, east, north }, zoom));
  });

  router.get('/events/search', cacheFor(30), async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(200) }), req.query);
    res.json(await events.searchGrouped(q));
  });

  router.get('/events/nearby', cacheFor(30), async (req, res) => {
    const q = parse(
      z.object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        radiusKm: z.coerce.number().min(1).max(500).default(25),
        limit: z.coerce.number().int().min(1).max(50).default(25),
      }),
      req.query,
    );
    res.json({ items: await events.repo.nearby(q.lat, q.lng, q.radiusKm, q.limit, new Date()) });
  });

  router.get('/events/changes', async (req, res) => {
    const { since } = parse(z.object({ since: z.iso.datetime() }), req.query);
    const serverTime = new Date().toISOString();
    res.json({ ...(await events.repo.changesSince(new Date(since))), serverTime });
  });

  router.get('/events/:id', cacheFor(30), async (req, res) => {
    const event = await events.get(parse(id, req.params.id));
    if (!event) throw notFound('Event');
    res.json(event);
  });

  router.get('/events/:id/related', cacheFor(60), async (req, res) => {
    res.json({ items: await events.related(parse(id, req.params.id)) });
  });

  router.get('/events/:id/sources', cacheFor(60), async (req, res) => {
    const event = await events.get(parse(id, req.params.id));
    if (!event) throw notFound('Event');
    res.json({ items: event.sources });
  });

  router.get('/events/:id/changes', cacheFor(60), async (req, res) => {
    const event = await events.get(parse(id, req.params.id));
    if (!event) throw notFound('Event');
    res.json({ items: event.changes });
  });

  router.get('/organizers/:id', cacheFor(60), async (req, res) => {
    const profile = await events.organizer(parse(id, req.params.id));
    if (!profile) throw notFound('Organizer');
    res.json(profile);
  });

  router.get('/speakers/:id', cacheFor(60), async (req, res) => {
    const profile = await events.person('speaker', parse(id, req.params.id));
    if (!profile) throw notFound('Speaker');
    res.json(profile);
  });

  router.get('/exhibitors/:id', cacheFor(60), async (req, res) => {
    const profile = await events.person('exhibitor', parse(id, req.params.id));
    if (!profile) throw notFound('Exhibitor');
    res.json(profile);
  });

  return router;
}
