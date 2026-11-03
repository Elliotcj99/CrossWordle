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
    baseURL: deployed ?? 'http://localhost:4173',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  ...(deployed === undefined && {
    webServer: {
      // The full stack (static site + the scoring Functions), since guesses are scored on the
      // server.
      command: 'npm run preview -- --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
    },
  }),
});
