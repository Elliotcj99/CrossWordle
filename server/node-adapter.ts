import type {
  IncomingHttpHeaders,
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'node:http';

/**
 * Runs the Pages Function handlers (`functions/api/*`) on a plain Node HTTP server, so the API can
 * be hosted outside Cloudflare (e.g. behind IIS). The handlers take a Web `Request` and return a
 * Web `Response`, both built into Node 22, so this only converts between those and `node:http`.
 * Scoring stays in the handlers and the engine; nothing here knows about puzzles.
 */

export type Handler = (context: { request: Request }) => Promise<Response>;

/** POST handlers keyed by exact path, e.g. `/api/guess`. */
export type Routes = Readonly<Record<string, Handler>>;

/** Guess and hint bodies are a few hundred bytes; anything far bigger is refused unread. */
export const MAX_BODY_BYTES = 16 * 1024;

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function toHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

/** Reads the whole body, or returns `undefined` as soon as it passes `limit` bytes. */
async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  const declared = Number(req.headers['content-length']);
  if (declared > limit) return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) return undefined;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handle(routes: Routes, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const handler = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : undefined;
  if (handler === undefined) return json(res, 404, { error: 'not-found' });
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method-not-allowed' }, { allow: 'POST' });
  }

  const body = await readBody(req, MAX_BODY_BYTES);
  if (body === undefined) {
    // Stop reading the rest of an oversized upload.
    return json(res, 413, { error: 'too-large' }, { connection: 'close' });
  }

  const response = await handler({
    request: new Request(url, {
      method: 'POST',
      headers: toHeaders(req.headers),
      body: new Uint8Array(body),
    }),
  });
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function createRequestListener(routes: Routes): RequestListener {
  return (req, res) => {
    handle(routes, req, res).catch((error: unknown) => {
      console.error(error);
      if (res.headersSent) res.destroy();
      else json(res, 500, { error: 'server-error' });
    });
  };
}
