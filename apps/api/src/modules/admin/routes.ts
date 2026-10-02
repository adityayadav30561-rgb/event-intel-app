import { adminCreateEventSchema, adminEventPatchSchema, mergeSchema } from '@eii/shared';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, parse } from '../../lib/http';
import { requireRole } from '../auth/routes';
import type { AdminService } from './service';

/** Data-quality tools (Phase 8): admins and researchers. Team management stays admin-only. */
export function adminRoutes(admin: AdminService): Router {
  const router = Router();
  router.use(requireRole('admin', 'researcher'));
  const id = z.string().min(1).max(160);
  const actor = (req: { auth?: { id: string } }) => req.auth!.id;
  const noStore = (res: { set: (k: string, v: string) => unknown }) => res.set('Cache-Control', 'no-store');

  router.get('/overview', async (_req, res) => {
    noStore(res);
    res.json(await admin.overview());
  });

  router.get('/review', async (_req, res) => {
    noStore(res);
    res.json({ items: await admin.reviewQueue() });
  });

  router.get('/events/:id', async (req, res) => {
    noStore(res);
    res.json(await admin.event(parse(id, req.params.id)));
  });

  router.patch('/events/:id', async (req, res) => {
    const patch = parse(adminEventPatchSchema, req.body);
    if (!Object.keys(patch).length) throw new HttpError(400, 'invalid_request', 'Nothing to change');
    res.json(await admin.edit(actor(req), parse(id, req.params.id), patch));
  });

  router.delete('/events/:id/overrides/:field', async (req, res) => {
    res.json(await admin.clearOverride(actor(req), parse(id, req.params.id), parse(z.string().max(40), req.params.field)));
  });

  router.post('/events/:id/verify', async (req, res) => {
    await admin.verify(actor(req), parse(id, req.params.id));
    res.status(204).end();
  });

  router.post('/events/:id/reject', async (req, res) => {
    await admin.reject(actor(req), parse(id, req.params.id));
    res.status(204).end();
  });

  router.post('/import', async (req, res) => {
    const { url } = parse(z.object({ url: z.url().max(1000) }), req.body);
    try {
      res.json(await admin.importUrl(url));
    } catch (error) {
      const status = (error as { status?: number }).status;
      throw new HttpError(422, 'unreadable', status ? `That page answered ${status}. Add the event by hand instead.` : `That page couldn’t be read (${(error as Error).message}). Add the event by hand instead.`);
    }
  });

  router.post('/events', async (req, res) => {
    res.status(201).json({ id: await admin.create(actor(req), parse(adminCreateEventSchema, req.body)) });
  });

  router.get('/duplicates', async (_req, res) => {
    noStore(res);
    res.json({ items: await admin.duplicates() });
  });

  router.post('/duplicates/:id/merge', async (req, res) => {
    res.json({ id: await admin.merge(actor(req), parse(id, req.params.id), parse(mergeSchema, req.body)) });
  });

  router.post('/duplicates/:id/dismiss', async (req, res) => {
    await admin.dismissDuplicate(actor(req), parse(id, req.params.id));
    res.status(204).end();
  });

  router.get('/conflicts', async (_req, res) => {
    noStore(res);
    res.json({ items: await admin.conflicts() });
  });

  router.post('/conflicts/:id/resolve', async (req, res) => {
    await admin.resolveConflict(actor(req), parse(id, req.params.id), parse(z.object({ index: z.number().int().min(0).max(10) }), req.body).index);
    res.status(204).end();
  });

  router.get('/sync', async (_req, res) => {
    noStore(res);
    res.json(await admin.syncInfo());
  });

  router.post('/sync/run', async (req, res) => {
    const started = await admin.runSyncNow(actor(req));
    res.status(started ? 202 : 409).json({ started });
  });

  router.patch('/sources/:id', async (req, res) => {
    const { enabled } = parse(z.object({ enabled: z.boolean().nullable() }), req.body);
    await admin.setSourceEnabled(actor(req), parse(id, req.params.id), enabled);
    res.status(204).end();
  });

  return router;
}
