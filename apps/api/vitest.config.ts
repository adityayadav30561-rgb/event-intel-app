import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Seeding the embedded database takes a few seconds.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
