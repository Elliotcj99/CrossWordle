import type { ErrorContext } from './log';
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

/** A path's handlers by method. A GET route also answers HEAD. */
export interface Route {
  readonly GET?: Handler;
  readonly POST?: Handler;
}

/** Routes keyed by exact path, e.g. `/api/guess`. */
export type Routes = Readonly<Record<string, Route>>;

/** Request bodies are a few hundred bytes; anything far bigger is refused unread. */
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
  const route = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : undefined;
  if (route === undefined) return json(res, 404, { error: 'not-found' });

  const head = req.method === 'HEAD';
  const method = head ? 'GET' : (req.method ?? '');
  const handler = method === 'GET' ? route.GET : method === 'POST' ? route.POST : undefined;
  if (handler === undefined) {
    const allow = [route.GET && 'GET, HEAD', route.POST && 'POST'].filter(Boolean).join(', ');
    return json(res, 405, { error: 'method-not-allowed' }, { allow });
  }

  let body: Buffer | undefined;
  if (method === 'POST') {
    body = await readBody(req, MAX_BODY_BYTES);
    if (body === undefined) {
      // Stop reading the rest of an oversized upload.
      return json(res, 413, { error: 'too-large' }, { connection: 'close' });
    }
  }

  const response = await handler({
    request: new Request(url, {
      method,
      headers: toHeaders(req.headers),
      ...(body === undefined ? {} : { body: new Uint8Array(body) }),
    }),
  });
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(head ? undefined : Buffer.from(await response.arrayBuffer()));
}

/** A request that threw is logged here (see log.ts) and answered with a 500. */
export interface ErrorSink {
  error(where: string, error: unknown, context?: ErrorContext): void;
}

export function createRequestListener(routes: Routes, log: ErrorSink): RequestListener {
  return (req, res) => {
    handle(routes, req, res).catch((error: unknown) => {
      log.error('request', error, { request: req });
      if (res.headersSent) res.destroy();
      else json(res, 500, { error: 'server-error' });
    });
  };
}
