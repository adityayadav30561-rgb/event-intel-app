import webpush from 'web-push';
import type { Db } from '../../db/client';

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag?: string };
/** "gone": the device unsubscribed or the subscription expired; it should be forgotten. */
export type PushResult = 'ok' | 'gone' | 'error';

export interface PushSender {
  readonly publicKey: string;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

/**
 * Web Push with VAPID (works on iPhone 16.4+ for home-screen apps, and on Android and desktop).
 * The key pair comes from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set; otherwise it is
 * generated once and kept in the database, so a fresh deployment needs no setup.
 */
export async function createWebPushSender(db: Db, opts: { publicKey?: string; privateKey?: string; subject: string }): Promise<PushSender> {
  let keys = opts.publicKey && opts.privateKey ? { publicKey: opts.publicKey, privateKey: opts.privateKey } : undefined;
  if (!keys) {
    const generated = webpush.generateVAPIDKeys();
    await db.query(`insert into app_state (key, value) values ('vapid_keys', $1::jsonb) on conflict (key) do nothing`, [JSON.stringify(generated)]);
    const [row] = await db.query<{ value: { publicKey: string; privateKey: string } }>(`select value from app_state where key = 'vapid_keys'`);
    keys = row!.value;
  }
  const details = { subject: opts.subject, publicKey: keys.publicKey, privateKey: keys.privateKey };
  return {
    publicKey: keys.publicKey,
    async send(target, payload) {
      try {
        await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
          vapidDetails: details,
          TTL: 24 * 3600,
          urgency: 'high',
        });
        return 'ok';
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? 'gone' : 'error';
      }
    },
  };
}
