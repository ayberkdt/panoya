import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the real app and real IndexedDB. Uses the installed Microsoft Edge (Chromium) so no
 * browser download is needed; set PW_CHANNEL=chromium after `playwright install` to use bundled
 * Chromium, or add WebKit/Firefox projects when those browsers are installed (spec 21).
 */
const channel = process.env.PW_CHANNEL ?? 'msedge';
// PW_TARGET=prod (`pnpm e2e:prod`): build, then serve dist with the Vercel headers on 4173.
const prod = process.env.PW_TARGET === 'prod';
const PORT = prod ? 4173 : 5173; // 5173 = `pnpm dev`; an already running dev server is reused
const VITE = 'node apps/web/node_modules/vite/bin/vite.js';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel === 'chromium' ? {} : { channel }),
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], ...(channel === 'chromium' ? {} : { channel }) },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], ...(channel === 'chromium' ? {} : { channel }) },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: prod
      ? `${VITE} build apps/web && ${VITE} preview apps/web --port ${PORT} --strictPort`
      : `${VITE} apps/web --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse a preview server: it could be serving an older build.
    reuseExistingServer: !process.env.CI && !prod,
    timeout: 120_000,
  },
});
