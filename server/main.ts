import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathsFromEnv, readConfig } from './config';
import { openDatabase } from './db';
import { createRequestListener } from './node-adapter';
import { apiRoutes } from './routes';

/**
 * The API as a standalone Node server, bundled by `scripts/build-iis.mjs` into `server.mjs` with
 * the answers bundles inlined. IIS (HttpPlatformHandler) starts it and passes the port in
 * HTTP_PLATFORM_PORT; PORT works for running it by hand. It only listens on loopback.
 *
 * It reads the site's settings and opens (and migrates) the database before taking requests, so a
 * broken config or an unwritable data folder stops it at start-up rather than on a player's guess.
 */
const port = Number(process.env.HTTP_PLATFORM_PORT ?? process.env.PORT ?? 8787);
const paths = pathsFromEnv();
readConfig(paths.config);
const db = openDatabase(join(paths.data, 'crosswordle.db'));

const server = createServer(createRequestListener(apiRoutes())).listen(port, '127.0.0.1', () =>
  console.log(`CrossWordle API listening on http://127.0.0.1:${port}`),
);

// IIS stops Node when it recycles the app pool; close the database cleanly when that happens.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
