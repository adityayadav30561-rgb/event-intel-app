import { trackingSyncSchema } from '@eii/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { parse } from '../../lib/http';
import type { TrackingService } from './service';

/** Saves, follows, visit plans, notes and checklists (docs/DEVELOPMENT_PLAN.md §7, Phase 5). */
export function trackingRoutes(tracking: TrackingService): Router {
  const router = Router();

  router.get('/me/tracking', async (req, res) => {
    res.json(await tracking.snapshot(req.auth!.id));
  });

  // Phones send their queued changes here (and an empty list just to refresh).
  router.post('/me/sync', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    res.json(await tracking.sync(req.auth!.id, parse(trackingSyncSchema, req.body).changes));
  });

  router.get('/events/:id/visitors', async (req, res) => {
    res.json({ items: await tracking.visitors(parse(z.string().min(1).max(120), req.params.id), req.auth!.id) });
  });

  return router;
}
