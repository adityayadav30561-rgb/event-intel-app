import { createStore, del, get, set } from 'idb-keyval';

/**
 * IndexedDB storage for the persisted query cache: the app opens with the last events it saw,
 * even offline, and refreshes in the background (spec §114, §143).
 */
const store = typeof indexedDB === 'undefined' ? undefined : createStore('eii-cache', 'queries');

export const queryStorage = store
  ? {
      getItem: async (key: string) => (await get<string>(key, store)) ?? null,
      setItem: (key: string, value: string) => set(key, value, store),
      removeItem: (key: string) => del(key, store),
    }
  : undefined;

/** Ask the browser to keep this site's data under storage pressure (important on iPhone). */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}
