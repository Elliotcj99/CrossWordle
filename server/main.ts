import { createServer } from 'node:http';
import { pathsFromEnv } from './config';
import { ErrorLog } from './log';
import { createRequestListener } from './node-adapter';
import { apiRoutes } from './routes';
import { startServices } from './services';

/**
 * The API as a standalone Node server, bundled by `scripts/build-iis.mjs` into `server.mjs` with
 * the answers bundles inlined. IIS (HttpPlatformHandler) starts it and passes the port in
 * HTTP_PLATFORM_PORT; PORT works for running it by hand. It only listens on loopback.
 *
 * It reads the site's settings and opens (and migrates) the database before taking requests, so a
 * broken config or an unwritable data folder stops it at start-up rather than on a player's guess.
 */
const port = Number(process.env.HTTP_PLATFORM_PORT ?? process.env.PORT ?? 8787);
const log = new ErrorLog(pathsFromEnv().logs);
let services: ReturnType<typeof startServices>;
try {
  services = startServices(log);
} catch (error) {
  // Nothing else would show why: IIS doesn't keep Node's output.
  log.error('start-up', error);
  process.exit(1);
}

const server = createServer(createRequestListener(apiRoutes(services), log)).listen(
  port,
  '127.0.0.1',
  () => console.log(`CrossWordle API listening on http://127.0.0.1:${port}`),
);

// IIS stops Node when it recycles the app pool; close the database cleanly when that happens.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close();
    services.close();
    process.exit(0);
  });
}
