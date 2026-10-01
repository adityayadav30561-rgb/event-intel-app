/** Native builds would use SQLite here; none is built yet (web app only). */
export const queryStorage: { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> } | undefined =
  undefined;

export function requestPersistentStorage(): void {}
