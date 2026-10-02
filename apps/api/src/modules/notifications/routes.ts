import { notificationSettingsSchema, pushSubscriptionSchema, reminderSchema } from '@eii/shared';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, notFound, parse } from '../../lib/http';
import type { EventService } from '../events/service';
import type { NotificationService } from './service';

/** Push devices, alert settings, the inbox and reminders (docs/DEVELOPMENT_PLAN.md §7, Phase 7). */
export function notificationRoutes(notifications: NotificationService, events: EventService): Router {
  const router = Router();
  const id = z.string().min(1).max(120);

  router.get('/push/key', (_req, res) => {
    res.json({ publicKey: notifications.sender.publicKey });
  });

  router.post('/me/push-subscriptions', async (req, res) => {
    await notifications.subscribe(req.auth!.id, parse(pushSubscriptionSchema, req.body), req.get('user-agent'));
    res.status(204).end();
  });

  router.post('/me/push-subscriptions/remove', async (req, res) => {
    await notifications.unsubscribe(req.auth!.id, parse(z.object({ endpoint: z.url() }), req.body).endpoint);
    res.status(204).end();
  });

  router.post('/me/push-test', async (req, res) => {
    const delivered = await notifications.test(req.auth!.id);
    if (!delivered) throw new HttpError(409, 'no_device', 'This device isn’t registered for alerts yet. Turn alerts on first.');
    res.status(204).end();
  });

  router.get('/me/notification-settings', async (req, res) => {
    res.json(await notifications.settings(req.auth!.id));
  });

  router.put('/me/notification-settings', async (req, res) => {
    res.json(await notifications.saveSettings(req.auth!.id, parse(notificationSettingsSchema, req.body)));
  });

  router.get('/me/notifications', async (req, res) => {
    const { before } = parse(z.object({ before: z.iso.datetime().optional() }), req.query);
    res.set('Cache-Control', 'no-store').json(await notifications.inbox(req.auth!.id, before));
  });

  router.post('/me/notifications/read', async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(z.string().max(60)).max(200).optional() }), req.body ?? {});
    await notifications.markRead(req.auth!.id, ids);
    res.status(204).end();
  });

  router.get('/me/reminders', async (req, res) => {
    res.set('Cache-Control', 'no-store').json({ items: await notifications.reminders(req.auth!.id) });
  });

  router.post('/me/reminders', async (req, res) => {
    const input = parse(reminderSchema, req.body);
    if (!(await events.get(input.eventId))) throw notFound('Event');
    await notifications.addReminder(req.auth!.id, input.eventId, input.offsetMinutes);
    res.status(201).json({ items: await notifications.reminders(req.auth!.id) });
  });

  router.delete('/me/reminders/:id', async (req, res) => {
    await notifications.removeReminder(req.auth!.id, parse(id, req.params.id));
    res.status(204).end();
  });

  return router;
}
