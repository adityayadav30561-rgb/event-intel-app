import type { EventDetail } from '@eii/shared';
import { create } from 'zustand';
import { packStorage } from '@/platform/localDb';

/**
 * Offline event packs (§81): a full copy of an event — overview, venue, agenda, speakers,
 * exhibitors — kept on the phone for venues with no signal. Your note and checklist are already
 * kept locally by the tracking store. The event image is cached for the service worker to serve.
 */
export type EventPack = { event: EventDetail; savedAt: string; bytes: number };
type PackInfo = Pick<EventPack, 'savedAt' | 'bytes'> & { id: string; title: string; startAt: string };

const IMAGE_CACHE = 'eii-images';

type PackIndex = { loaded: boolean; packs: Record<string, PackInfo> };
export const usePackIndex = create<PackIndex>(() => ({ loaded: false, packs: {} }));

const info = (pack: EventPack): PackInfo => ({ id: pack.event.id, title: pack.event.title, startAt: pack.event.startAt, savedAt: pack.savedAt, bytes: pack.bytes });

export async function loadPackIndex(): Promise<void> {
  const all = await packStorage.all<EventPack>();
  usePackIndex.setState({ loaded: true, packs: Object.fromEntries(all.map((p) => [p.event.id, info(p)])) });
}

async function cacheImage(url: string | undefined) {
  if (!url || typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(IMAGE_CACHE);
    if (await cache.match(url)) return;
    // Most image hosts don't allow reading their images from another site, so store the opaque copy.
    const response = await fetch(url, { mode: 'no-cors' });
    await cache.put(url, response);
  } catch {
    /* the generated artwork shows instead */
  }
}

async function uncacheImage(url: string | undefined) {
  if (!url || typeof caches === 'undefined') return;
  try {
    await (await caches.open(IMAGE_CACHE)).delete(url);
  } catch {
    /* ignore */
  }
}

export async function savePack(event: EventDetail): Promise<void> {
  const pack: EventPack = { event, savedAt: new Date().toISOString(), bytes: JSON.stringify(event).length };
  await packStorage.set(event.id, pack);
  usePackIndex.setState((s) => ({ packs: { ...s.packs, [event.id]: info(pack) } }));
  void cacheImage(event.imageUrl);
}

/** Keeps an existing pack current when fresher details arrive online. */
export async function refreshPackIfSaved(event: EventDetail): Promise<void> {
  if (usePackIndex.getState().packs[event.id]) await savePack(event);
}

export async function getPack(id: string): Promise<EventPack | undefined> {
  return packStorage.get<EventPack>(id);
}

export async function removePack(id: string): Promise<void> {
  const pack = await packStorage.get<EventPack>(id);
  await packStorage.remove(id);
  void uncacheImage(pack?.event.imageUrl);
  usePackIndex.setState((s) => {
    const packs = { ...s.packs };
    delete packs[id];
    return { packs };
  });
}

export async function removeAllPacks(): Promise<void> {
  await packStorage.clear();
  if (typeof caches !== 'undefined') await caches.delete(IMAGE_CACHE).catch(() => false);
  usePackIndex.setState({ packs: {} });
}

export const useHasPack = (id: string | undefined) => usePackIndex((s) => Boolean(id && s.packs[id]));
