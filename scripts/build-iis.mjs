// Packages a release for the IIS host (deploy/iis/README.md) from an existing `npm run build`:
//
//   dist/iis/site     apps/web/dist without the Cloudflare _headers, plus the rendered web.config
//   dist/iis/server   server.mjs: the scoring API with the answers bundles inlined
//
// Run it through `npm run build:iis`, which builds first. The server folder must stay outside the
// site folder, so IIS can never serve the answers.
import { spawnSync } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const out = 'dist/iis';

await rm(out, { recursive: true, force: true });
await cp('apps/web/dist', `${out}/site`, {
  recursive: true,
  filter: (path) => !path.replace(/\\/g, '/').endsWith('/_headers'),
});

const headers = spawnSync(
  process.execPath,
  ['scripts/render-headers.mjs', '--format', 'iis', '--out', `${out}/site/web.config`],
  { stdio: 'inherit' },
);
if (headers.status !== 0) process.exit(1);

await build({
  entryPoints: ['server/main.ts'],
  outfile: `${out}/server/server.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'none',
  logLevel: 'info',
});
