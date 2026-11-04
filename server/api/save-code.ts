import type { Handler } from '../node-adapter';

/**
 * `POST /api/save-code`: where the "Save in my password manager" form goes in browsers that can't
 * be asked to save a password from script (Safari and Firefox have no `PasswordCredential`).
 * They offer to save a password only when a form with it is really submitted and the page moves
 * on, so the form posts here and is sent straight back to the game, which shows the code again
 * from this tab's session storage. The body (the code) is never read, kept or logged: it's only
 * there for the browser to see.
 */
export function saveCode(): Handler {
  return () =>
    Promise.resolve(
      new Response(null, { status: 303, headers: { location: '/', 'cache-control': 'no-store' } }),
    );
}
