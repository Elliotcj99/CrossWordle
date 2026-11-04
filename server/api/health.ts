import type { Health } from '../health';
import type { Handler } from '../node-adapter';

/**
 * `GET /api/health`, for the uptime monitor. Public on purpose and unlinked: the answer is one
 * word, `{"status":"ok"}` (200), `{"status":"ok","warning":"puzzles"}` (200, puzzles running
 * out) or `{"status":"down"}` (503), and nothing else (no versions, paths or errors). The detail
 * is on the server: `admin.mjs health`.
 *
 * The result is kept for `CACHE_MS`, so a flood of requests costs no more than the monitor's own.
 * `no-store` stops Cloudflare (or anything else) serving a stale "ok" while the site is down.
 */

export const CACHE_MS = 30_000;

export function health(checker: Health, now: () => number = Date.now): Handler {
  let cached: { at: number; status: number; body: string } | undefined;
  return () => {
    const time = now();
    if (cached === undefined || time - cached.at >= CACHE_MS) {
      const report = checker.check();
      cached = {
        at: time,
        status: report.ok ? 200 : 503,
        body: JSON.stringify(
          report.ok
            ? { status: 'ok', ...(report.warning === undefined ? {} : { warning: report.warning }) }
            : { status: 'down' },
        ),
      };
    }
    return Promise.resolve(
      new Response(cached.body, {
        status: cached.status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      }),
    );
  };
}
