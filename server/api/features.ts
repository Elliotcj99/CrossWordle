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
];

/**
 * The feature list, plus the public Turnstile site key when the site has one, so the page can show
 * the bot check on its forms. (The secret key never leaves the server.)
 */
export function features(config: Config): Handler {
  const body = JSON.stringify({
    features: FEATURES,
    ...(config.turnstile === undefined ? {} : { turnstileSiteKey: config.turnstile.siteKey }),
  });
  return () =>
    Promise.resolve(
      new Response(body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      }),
    );
}
