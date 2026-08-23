import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.js'],
      reporter: ['text', 'lcov'],
    },
  },
});
