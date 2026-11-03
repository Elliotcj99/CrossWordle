// Renders deploy/security-headers.json for each host, so they all serve the same headers.
//
//   node scripts/render-headers.mjs --format cloudflare --out apps/web/dist/_headers
//   node scripts/render-headers.mjs --format iis --out <site>/web.config
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

const generated = '# Generated from deploy/security-headers.json';

const xml = (value) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderers = {
  // Cloudflare Pages applies every matching block, so each block lists only its own headers.
  cloudflare: async () =>
    [
      generated,
      ...Object.entries(rules).map(([prefix, headers]) =>
        [`${prefix}*`, ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)].join('\n'),
      ),
    ].join('\n\n'),

  // IIS merges a <location>'s customHeaders into the site's, so the base headers go in the
  // template's site-wide block and each location adds its own (removing first, in case it
  // overrides a base header: IIS refuses a duplicate name).
  iis: async () => {
    const template = await readFile(new URL('../deploy/iis/web.config', import.meta.url), 'utf8');
    const add = (name, value, indent) =>
      `${indent}<add name="${xml(name)}" value="${xml(value)}" />`;
    const headers = Object.entries(base)
      .map(([k, v]) => add(k, v, '        '))
      .join('\n');
    const locations = Object.entries(rules)
      .filter(([prefix]) => prefix !== '/')
      .map(([prefix, own]) =>
        [
          '',
          `  <location path="${xml(prefix.replace(/^\/|\/$/g, ''))}">`,
          '    <system.webServer>',
          '      <httpProtocol>',
          '        <customHeaders>',
          ...Object.entries(own).flatMap(([k, v]) => [
            `          <remove name="${xml(k)}" />`,
            add(k, v, '          '),
          ]),
          '        </customHeaders>',
          '      </httpProtocol>',
          '    </system.webServer>',
          '  </location>',
        ].join('\n'),
      )
      .join('\n');
    return template
      .replace('{{headers}}', () => headers)
      .replace('{{locations}}', () => locations)
      .trimEnd();
  },
};

const render = renderers[values.format];
if (render === undefined || values.out === undefined) {
  console.error('Usage: node scripts/render-headers.mjs --format cloudflare|iis --out <file>');
  process.exit(2);
}

await writeFile(values.out, `${await render()}\n`);
console.log(`Wrote ${values.format} headers to ${values.out}`);
