import Constants from 'expo-constants';

/** Version and build details, shown in More so you can confirm an update reached the phone. */
export const BUILD = {
  version: Constants.expoConfig?.version ?? '0.0.0',
  /** ISO time the web bundle was built (set by scripts/deploy-web.mjs); undefined in local dev. */
  builtAt: process.env.EXPO_PUBLIC_BUILD_TIME,
  release: process.env.EXPO_PUBLIC_RELEASE ?? 'development',
  dataMode: process.env.EXPO_PUBLIC_DATA_MODE ?? 'mock',
} as const;
