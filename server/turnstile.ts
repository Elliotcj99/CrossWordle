/**
 * Cloudflare Turnstile: the bot check on the nickname (and later feature request) forms. The page
 * shows Cloudflare's widget, which gives it a one-time token; the server checks that token with
 * Cloudflare before accepting the form. Keys come from the site's config.json. Cloudflare publishes
 * test keys that always pass, which staging and the browser tests use.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileCheck {
  readonly secretKey: string;
  readonly token: string;
  /** The visitor's address (CF-Connecting-IP), which Cloudflare uses as an extra signal. */
  readonly ip?: string;
}

/**
 * Whether Cloudflare accepts a widget token. Any failure to ask (network, timeout, a bad reply)
 * counts as not accepted: the form is refused, and the player can try again.
 */
export async function verifyTurnstile(
  { secretKey, token, ip }: TurnstileCheck,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (token === '' || token.length > 2048) return false;
  const form = new URLSearchParams({ secret: secretKey, response: token });
  if (ip !== undefined) form.set('remoteip', ip);
  try {
    const response = await fetcher(VERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
