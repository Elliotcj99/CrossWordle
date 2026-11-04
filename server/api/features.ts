import type { Config } from '../config';
import type { Handler } from '../node-adapter';

/**
 * Which optional features this server supports. The browser asks before showing their UI: the
 * Node server (IIS) answers with this list, while Cloudflare Pages has no such endpoint and
 * answers 404, so the same build hides features that need the database. Each feature adds its
 * name here when it ships.
 */
export const FEATURES: readonly string[] = [
  // The server keeps its own record of each player's game (guesses, hints, restarts), and gives
  // it back: the player's finished puzzles (/api/record) and current game (/api/game).
  'records',
  // Each puzzle's leaderboard (/api/leaderboard).
  'leaderboard',
  // Players can name themselves after finishing a puzzle.
  'nicknames',
  // Players can make a recovery code, to get their record back in another browser.
  'recovery',
  // Players can delete their record (/api/forget).
  'forget',
  // Players can send a feature request.
  'feedback',
  // TEMPORARY, a one-off: the page sends the puzzles its browser finished before the server kept
  // records (/api/import-history). Remove by Friday 6 November 2026.
  'import-history',
];

/**
 * The feature list, plus the public Turnstile site key when the site has one, so the page can show
 * the bot check on its forms. (The secret key never leaves the server.) The page asks once per
 * load, so this is also where page loads are counted (`onVisit`).
 */
export function features(config: Config, onVisit: () => void = () => undefined): Handler {
  // The contact link only where the site has an address to show.
  const names = config.contactEmail === undefined ? FEATURES : [...FEATURES, 'contact'];
  const body = JSON.stringify({
    features: names,
    ...(config.turnstile === undefined ? {} : { turnstileSiteKey: config.turnstile.siteKey }),
  });
  return () => {
    onVisit();
    return Promise.resolve(
      new Response(body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      }),
    );
  };
}
