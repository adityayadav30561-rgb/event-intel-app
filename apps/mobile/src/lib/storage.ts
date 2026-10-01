import type { StateStorage } from 'zustand/middleware';

/**
 * Small persistent key-value storage for per-device preferences. Browser storage can be
 * unavailable (private mode, cleared site data), so every access is guarded and the app
 * works without it.
 */
const memory = new Map<string, string>();

const local = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

export const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return local()?.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItem: (key, value) => {
    memory.set(key, value);
    try {
      local()?.setItem(key, value);
    } catch {
      /* storage full or blocked: memory copy still works for this session */
    }
  },
  removeItem: (key) => {
    memory.delete(key);
    try {
      local()?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
