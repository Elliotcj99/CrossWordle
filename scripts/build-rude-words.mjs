// Writes server/_rude-words.json, the words a leaderboard nickname may not contain, from the
// Naughty mode word list (data/wordlists-naughty/rude.txt), so the two can't drift apart. Run by
// `npm run build`, `dev`, `preview` and `typecheck`; the server bundle imports it. Generated, not
// committed.
//
// The list's "Innuendo" section is left out: those are ordinary words with a rude second meaning
// ("kitty", "rod", "wolf"), fine as Naughty mode answers but not reasons to refuse a name.
import { readFile, writeFile } from 'node:fs/promises';

const source = 'data/wordlists-naughty/rude.txt';
const out = 'server/_rude-words.json';

const words = [];
let innuendo = false;
for (const raw of (await readFile(source, 'utf8')).split(/\r?\n/)) {
  const line = raw.trim().toLowerCase();
  if (line.startsWith('#')) {
    innuendo = line.startsWith('# innuendo');
    continue;
  }
  if (line !== '' && !innuendo) words.push(line);
}

await writeFile(out, `${JSON.stringify([...new Set(words)].sort())}\n`);
console.log(`Wrote ${words.length} rude words to ${out}`);
