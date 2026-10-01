import type { StateStorage } from 'zustand/middleware';

/** Native builds would use SQLite; the app ships as a web app, so these keep data in memory only. */
const memory = new Map<string, string>();
export const localDbStorage: StateStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
};

const packs = new Map<string, unknown>();
export const packStorage = {
  get: async <T>(id: string) => packs.get(id) as T | undefined,
  set: async (id: string, value: unknown) => void packs.set(id, value),
  remove: async (id: string) => void packs.delete(id),
  all: async <T>() => [...packs.values()] as T[],
  clear: async () => packs.clear(),
};
