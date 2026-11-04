import type { Config } from '../config';
import { BOT_CHECK_LIMIT, type RateLimits } from '../rate-limits';
import { verifyTurnstile } from '../turnstile';

/** What the form endpoints (nickname, recovery) share: the visitor's address and the bot check. */

/**
 * The visitor's address, from Cloudflare's `CF-Connecting-IP` (every request comes through the
 * proxy, so the socket's address is the proxy's). Used for rate limits only.
 */
export function clientAddress(request: Request): string {
  return request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

/**
 * Runs the Turnstile bot check: `ok` (always, where the site has no keys), `failed`, or
 * `too-many` when this player or address has asked for too many checks (BOT_CHECK_LIMIT). Every
 * check is counted, passed or failed, as each one calls Cloudflare.
 */
export async function botCheck(
  config: Config,
  limits: RateLimits,
  playerId: string,
  token: unknown,
  ip: string,
): Promise<'ok' | 'failed' | 'too-many'> {
  if (config.turnstile === undefined) return 'ok';
  if (!limits.allow('bot-check', playerId, ip, BOT_CHECK_LIMIT)) return 'too-many';
  return (await passesBotCheck(config, token, ip)) ? 'ok' : 'failed';
}

/** Whether the request passes the Turnstile bot check; always true where the site has no keys. */
export async function passesBotCheck(config: Config, token: unknown, ip: string): Promise<boolean> {
  if (config.turnstile === undefined) return true;
  return verifyTurnstile({
    secretKey: config.turnstile.secretKey,
    token: typeof token === 'string' ? token : '',
    ...(ip === 'unknown' ? {} : { ip }),
  });
}

/** The request's JSON body as an object, or `undefined` if it isn't one. */
export async function jsonBody<T extends object>(
  request: Request,
): Promise<Partial<T> | undefined> {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Partial<T>)
      : undefined;
  } catch {
    return undefined;
  }
}
