import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { pathsFromEnv, readConfig } from './config';
import { openDatabase } from './db';
import { createRequestListener } from './node-adapter';
import { apiRoutes } from './routes';

/**
 * The whole site on one local Node server: the built static files (apps/web/dist) and the API,
 * the way IIS serves them. `npm run preview` runs it, and so do the browser tests, so both test
 * the same API code and headers that go live. Not shipped: IIS serves the static files itself.
 *
 * PORT sets the port (default 4173). The database and settings come from CROSSWORDLE_DATA and
 * CROSSWORDLE_CONFIG, as on IIS (default: a `.data` folder here).
 */

const root = resolve('apps/web/dist');
const port = Number(process.env.PORT ?? 4173);

/** deploy/security-headers.json: "/" applies everywhere, and longer prefixes add to it. */
const headerRules = JSON.parse(await readFile('deploy/security-headers.json', 'utf8')) as Record<
  string,
  Record<string, string>
>;

function headersFor(path: string): Record<string, string> {
  return Object.entries(headerRules)
    .filter(([prefix]) => path.startsWith(prefix))
    .sort(([a], [b]) => a.length - b.length)
    .reduce<Record<string, string>>((all, [, headers]) => ({ ...all, ...headers }), {});
}

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function plain(
  res: ServerResponse,
  status: number,
  text: string,
  extra: Record<string, string> = {},
) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...extra });
  res.end(text);
}

/** A file under the site root, or `undefined`. Folder URLs are 404, as on IIS. */
async function fileFor(pathname: string): Promise<string | undefined> {
  if (pathname === '/') return join(root, 'index.html');
  if (pathname.endsWith('/')) return undefined;
  const file = resolve(root, `.${pathname}`);
  if (!file.startsWith(root + sep)) return undefined;
  try {
    return (await stat(file)).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return plain(res, 405, 'Method not allowed', { allow: 'GET, HEAD' });
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    return plain(res, 400, 'Bad request');
  }
  const file = pathname.includes('\0') ? undefined : await fileFor(pathname);
  if (file === undefined) return plain(res, 404, 'Not found');

  const body = await readFile(file);
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'content-length': body.length,
    ...headersFor(pathname),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const paths = pathsFromEnv();
readConfig(paths.config);
const db = openDatabase(join(paths.data, 'crosswordle.db'));
const api = createRequestListener(apiRoutes());

const server = createServer((req, res) => {
  if ((req.url ?? '').startsWith('/api/')) return api(req, res);
  serveStatic(req, res).catch((error: unknown) => {
    console.error(error);
    if (!res.headersSent) plain(res, 500, 'Server error');
  });
}).listen(port, '127.0.0.1', () => console.log(`CrossWordle preview on http://127.0.0.1:${port}/`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
