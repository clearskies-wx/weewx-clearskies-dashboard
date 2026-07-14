import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'threads',
    setupFiles: ['./src/test/setup.ts'],
    // Vitest owns unit tests under src/; Playwright owns e2e/ specs and must not
    // be collected here (its test.describe() throws under the vitest runner).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
