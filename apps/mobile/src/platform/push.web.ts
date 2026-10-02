import { accountRepository } from '@/repositories';

/**
 * Web Push on the phone (Phase 7). On iPhone it works only in the installed app (opened from
 * the home screen, iOS 16.4+), and permission can only be asked for after a tap.
 */
export type PushStatus = 'on' | 'off' | 'denied' | 'needs_install' | 'unsupported' | 'unavailable';

const installed = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  // Only production builds register the worker (see serviceWorker.web.ts).
  return (await navigator.serviceWorker.getRegistration()) ?? undefined;
}

export async function pushStatus(): Promise<PushStatus> {
  if (isIOS() && !installed()) return 'needs_install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unavailable';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

/** Must be called from a tap. Asks for permission, subscribes this device and registers it. */
export async function enablePush(): Promise<PushStatus> {
  const status = await pushStatus();
  if (status === 'needs_install' || status === 'unsupported' || status === 'denied' || status === 'unavailable') return status;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) return 'unavailable';
  const key = await accountRepository.pushKey();
  const subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(key) }));
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await accountRepository.registerPush({ endpoint: json.endpoint, keys: json.keys });
  return 'on';
}

export async function disablePush(): Promise<void> {
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  await accountRepository.unregisterPush(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}

/** Keeps the server's copy current (subscriptions can be renewed by the browser). */
export async function refreshPushRegistration(): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return;
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await accountRepository.registerPush({ endpoint: json.endpoint, keys: json.keys }).catch(() => undefined);
}
