// Renders deploy/security-headers.json for each host, so both serve the same headers.
//
//   node scripts/render-headers.mjs --format cloudflare --out apps/web/dist/_headers
//   node scripts/render-headers.mjs --format nginx --out crosswordle-headers.conf
//
// Keys are path prefixes. "/" applies everywhere; longer prefixes add to it.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { format: { type: 'string' }, out: { type: 'string' } },
});

const source = new URL('../deploy/security-headers.json', import.meta.url);
const rules = JSON.parse(await readFile(source, 'utf8'));
const base = rules['/'] ?? {};

/** Every prefix with the full set of headers it gets, "/" first. */
const prefixes = Object.entries(rules).map(([prefix, headers]) => [
  prefix,
  prefix === '/' ? base : { ...base, ...headers },
]);

const renderers = {
  // Cloudflare Pages applies every matching block, so each block lists only its own headers.
  cloudflare: () =>
    Object.entries(rules)
      .map(([prefix, headers]) =>
        [`${prefix}*`, ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)].join('\n'),
      )
      .join('\n\n'),

  // nginx drops inherited add_header lines inside a location that has its own, so each
  // location repeats the base headers.
  nginx: () =>
    prefixes
      .map(([prefix, headers]) =>
        [
          `location ${prefix} {`,
          ...Object.entries(headers).map(([k, v]) => `    add_header ${k} "${v}" always;`),
          '}',
        ].join('\n'),
      )
      .join('\n\n'),
};

const render = renderers[values.format];
if (render === undefined || values.out === undefined) {
  console.error('Usage: node scripts/render-headers.mjs --format cloudflare|nginx --out <file>');
  process.exit(2);
}

await writeFile(values.out, `# Generated from deploy/security-headers.json\n${render()}\n`);
console.log(`Wrote ${values.format} headers to ${values.out}`);
