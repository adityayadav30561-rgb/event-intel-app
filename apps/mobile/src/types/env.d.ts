/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_DATA_MODE?: 'mock' | 'api';
    EXPO_PUBLIC_API_URL?: string;
    /** Set by scripts/deploy-web.mjs at build time. */
    EXPO_PUBLIC_BUILD_TIME?: string;
    EXPO_PUBLIC_RELEASE?: 'production' | 'preview';
  }
}
