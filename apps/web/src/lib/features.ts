/** What this host offers beyond the game itself, from `api/features`. */
export interface Features {
  /** Optional features the server supports, e.g. `records`, `nicknames`. */
  readonly names: ReadonlySet<string>;
  /** The public Turnstile site key for the bot check on forms, if the site uses one. */
  readonly turnstileSiteKey?: string;
}

const NONE: Features = { names: new Set() };

/**
 * The optional features this host supports, asked once per page. The Node server (IIS) lists
 * them at `api/features`; Cloudflare Pages has no such endpoint, so there (or offline) the answer
 * is none, and the page hides anything that needs the server's database.
 */
let request: Promise<Features> | undefined;

export function features(): Promise<Features> {
  request ??= load();
  return request;
}

async function load(): Promise<Features> {
  try {
    const response = await fetch('api/features');
    if (!response.ok) return NONE;
    const data = (await response.json()) as { features?: unknown; turnstileSiteKey?: unknown };
    const names = new Set(
      Array.isArray(data.features)
        ? data.features.filter((f): f is string => typeof f === 'string')
        : [],
    );
    return typeof data.turnstileSiteKey === 'string'
      ? { names, turnstileSiteKey: data.turnstileSiteKey }
      : { names };
  } catch {
    return NONE;
  }
}
