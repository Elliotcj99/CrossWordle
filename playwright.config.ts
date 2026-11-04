import { defineConfig, devices } from '@playwright/test';

/**
 * A site that is already running, such as a staging deploy (`http://127.0.0.1:8081`, or its
 * public name). When it's set, the tests run against it and no local server is started.
 */
const deployed = process.env.CROSSWORDLE_BASE_URL || undefined;

/**
 * The address to reach that site at, in place of looking its name up: the server's address for
 * the site's IIS binding. The browser still asks for the site by name (the Host header, and SNI
 * over HTTPS), so the binding answers as it would through Cloudflare, but the tests never go
 * through Cloudflare, whose per-address limits they would trip.
 */
const connectTo = process.env.CROSSWORDLE_CONNECT_TO || undefined;

/** Accept a certificate that doesn't cover the site's name (set it to 1), as on a staging site. */
const ignoreHttpsErrors = process.env.CROSSWORDLE_IGNORE_HTTPS_ERRORS === '1';

if (connectTo !== undefined && deployed === undefined) {
  throw new Error('CROSSWORDLE_CONNECT_TO needs CROSSWORDLE_BASE_URL.');
}

export default defineConfig({
  testDir: 'apps/web/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: deployed ?? 'http://127.0.0.1:4173',
    ignoreHTTPSErrors: ignoreHttpsErrors,
    ...(connectTo !== undefined && {
      launchOptions: {
        args: [`--host-resolver-rules=MAP ${new URL(deployed!).hostname} ${connectTo}`],
      },
    }),
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
