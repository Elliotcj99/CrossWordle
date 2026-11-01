import { createServer } from 'node:http';
import { onRequestPost as guess } from '../functions/api/guess';
import { onRequestPost as hint } from '../functions/api/hint';
import { createRequestListener } from './node-adapter';

/**
 * The scoring API as a standalone Node server, bundled by `scripts/build-iis.mjs` into
 * `server.mjs` with the answers bundles inlined. IIS (HttpPlatformHandler) starts it and passes the
 * port in HTTP_PLATFORM_PORT; PORT works for running it by hand. It only listens on loopback.
 */
const port = Number(process.env.HTTP_PLATFORM_PORT ?? process.env.PORT ?? 8787);

createServer(createRequestListener({ '/api/guess': guess, '/api/hint': hint })).listen(
  port,
  '127.0.0.1',
  () => console.log(`CrossWordle API listening on http://127.0.0.1:${port}`),
);
