import { clear, createStore, del, entries, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

/**
 * IndexedDB on the phone for data that must survive offline (Phase 5): the tracking state with
 * its queue of unsent changes, and offline event packs. Larger and sturdier than localStorage.
 */
const kv = typeof indexedDB === 'undefined' ? undefined : createStore('eii-local', 'kv');
const packs = typeof indexedDB === 'undefined' ? undefined : createStore('eii-packs', 'packs');

const memory = new Map<string, string>();

export const localDbStorage: StateStorage = {
  getItem: async (key) => (kv ? ((await get<string>(key, kv)) ?? null) : (memory.get(key) ?? null)),
  setItem: async (key, value) => {
    if (kv) await set(key, value, kv);
    else memory.set(key, value);
  },
  removeItem: async (key) => {
    if (kv) await del(key, kv);
    else memory.delete(key);
  },
};

const packMemory = new Map<string, unknown>();

export const packStorage = {
  get: async <T>(id: string): Promise<T | undefined> => (packs ? get<T>(id, packs) : (packMemory.get(id) as T | undefined)),
  set: async (id: string, value: unknown) => {
    if (packs) await set(id, value, packs);
    else packMemory.set(id, value);
  },
  remove: async (id: string) => {
    if (packs) await del(id, packs);
    else packMemory.delete(id);
  },
  all: async <T>(): Promise<T[]> => (packs ? (await entries<string, T>(packs)).map(([, v]) => v) : ([...packMemory.values()] as T[])),
  clear: async () => {
    if (packs) await clear(packs);
    else packMemory.clear();
  },
};
