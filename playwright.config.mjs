// Playwright configuration for the functional tests (tests/functional).
// The production build in dist/ is served by scripts/build/serve.mjs; run `npm run build` first
// (`npm test` does both).
import './scripts/lib/env.mjs';
import { defineConfig, devices } from '@playwright/test';

// own port, and never reuse a server already running there (it could be another project)
const PORT = Number(process.env.TEST_PORT || 4391);

export default defineConfig({
  testDir: 'tests/functional',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  // the JSON-editing test temporarily changes files in data/, so it runs alone, after
  // every other test has finished (other tests read data/ to know what to expect)
  projects: [
    { name: 'functional', testIgnore: /content-editing/ },
    { name: 'content-editing', testMatch: /content-editing/, dependencies: ['functional'], fullyParallel: false },
  ],
  webServer: {
    command: `node scripts/build/serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
