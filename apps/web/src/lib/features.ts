/**
 * The optional features this host supports, asked once per page. The Node server (IIS) lists
 * them at `api/features`; Cloudflare Pages has no such endpoint, so there (or offline) the answer
 * is none, and the page hides anything that needs the server's database.
 */
let request: Promise<ReadonlySet<string>> | undefined;

export function features(): Promise<ReadonlySet<string>> {
  request ??= load();
  return request;
}

async function load(): Promise<ReadonlySet<string>> {
  try {
    const response = await fetch('api/features');
    if (!response.ok) return new Set();
    const data = (await response.json()) as { features?: unknown };
    return new Set(
      Array.isArray(data.features)
        ? data.features.filter((f): f is string => typeof f === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}
