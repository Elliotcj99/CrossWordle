import { defineConfig, devices } from '@playwright/test';

/**
 * A site that is already running, such as a staging deploy (`http://127.0.0.1:8081`). When it's
 * set, the tests run against it and no local server is started.
 */
const deployed = process.env.CROSSWORDLE_BASE_URL || undefined;

export default defineConfig({
  testDir: 'apps/web/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: deployed ?? 'http://127.0.0.1:4173',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  ...(deployed === undefined && {
    webServer: {
      // The full stack, as IIS runs it: the static site and the Node API (server/preview.ts).
      // Its database goes under test-results, so every run starts empty.
      command: 'npm run preview',
      env: { PORT: '4173', CROSSWORDLE_DATA: 'test-results/.data' },
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
  }),
});
