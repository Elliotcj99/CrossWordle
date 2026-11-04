import type { Handler } from '../node-adapter';

/**
 * Which optional features this server supports. The browser asks before showing their UI: the
 * Node server (IIS) answers with this list, while Cloudflare Pages has no such endpoint and
 * answers 404, so the same build hides features that need the database. Each feature adds its
 * name here when it ships.
 */
export const FEATURES: readonly string[] = [
  // The server keeps its own record of each player's game (guesses, hints, restarts).
  'records',
];

export const features: Handler = () =>
  Promise.resolve(
    new Response(JSON.stringify({ features: FEATURES }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    }),
  );
