// Writes server/_rude-words.json, the words a leaderboard nickname may not contain, from the
// Naughty mode word list (data/wordlists-naughty/rude.txt), so the two can't drift apart. Run by
// `npm run build`, `dev` and `preview`; the server bundle imports it. Generated, not committed.
import { readFile, writeFile } from 'node:fs/promises';

const source = 'data/wordlists-naughty/rude.txt';
const out = 'server/_rude-words.json';

const words = (await readFile(source, 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.trim().toLowerCase())
  .filter((line) => line !== '' && !line.startsWith('#'));

await writeFile(out, `${JSON.stringify([...new Set(words)].sort())}\n`);
console.log(`Wrote ${words.length} rude words to ${out}`);
