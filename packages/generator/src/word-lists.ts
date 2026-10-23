import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_RULES } from '@crosswordle/engine';

export interface WordLists {
  /** Uppercase words of every allowed length, sorted, without duplicates. */
  readonly words: ReadonlySet<string>;
  readonly problems: readonly string[];
}

/**
 * Merges word list sources (one word per line; blank lines and `#` comments ignored) into the
 * words a puzzle can use: letters only, within the default rules' lengths.
 */
export function parseWordLists(
  sources: readonly { name: string; text: string }[],
  minLength = DEFAULT_RULES.minLength,
  maxLength = DEFAULT_RULES.maxLength,
): WordLists {
  const words = new Set<string>();
  const problems: string[] = [];
  for (const { name, text } of sources) {
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) return;
      if (!/^[A-Za-z]+$/.test(line)) {
        problems.push(`${name}:${i + 1}: "${line}" is not a word of letters only.`);
        return;
      }
      if (line.length >= minLength && line.length <= maxLength) words.add(line.toUpperCase());
    });
  }
  return { words: new Set([...words].sort()), problems };
}

/** Reads every `.txt` file in a folder as a word list source. */
export async function readWordLists(folder: string): Promise<WordLists> {
  const names = (await readdir(folder)).filter((name) => name.endsWith('.txt')).sort();
  const sources = await Promise.all(
    names.map(async (name) => ({ name, text: await readFile(join(folder, name), 'utf8') })),
  );
  return parseWordLists(sources);
}

/** The licence notice that must travel with the published word files. */
export const NOTICE_FILE = 'NOTICE.md';

/**
 * Replaces `outFolder` with one `<length>.txt` per word length (one word per line, after a `#`
 * line pointing to the notice) and the sources' licence notice.
 */
export async function writeWordFiles(
  words: ReadonlySet<string>,
  notice: string,
  outFolder: string,
): Promise<number[]> {
  const byLength = new Map<number, string[]>();
  for (const word of words) {
    const list = byLength.get(word.length) ?? [];
    list.push(word);
    byLength.set(word.length, list);
  }

  await rm(outFolder, { recursive: true, force: true });
  await mkdir(outFolder, { recursive: true });
  await writeFile(join(outFolder, NOTICE_FILE), notice);
  const header = `# Sources and licences of these words: ${NOTICE_FILE}`;
  const lengths = [...byLength.keys()].sort((a, b) => a - b);
  for (const length of lengths) {
    const lines = [header, ...byLength.get(length)!];
    await writeFile(join(outFolder, `${length}.txt`), `${lines.join('\n')}\n`);
  }
  return lengths;
}
