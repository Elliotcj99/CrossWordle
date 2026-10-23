import { readFile } from 'node:fs/promises';
import type { Candidate } from './layout';
import { givesAway } from './wordnet';

/** In a clue list, this clue removes the answer from the pool instead of cluing it. */
export const EXCLUDE = '-';

export interface ClueLists {
  /** Answer → clue, after later lists have overridden earlier ones. */
  readonly clues: ReadonlyMap<string, string>;
  readonly problems: readonly string[];
}

/**
 * Merges clue lists in priority order (later wins). Each line is `ANSWER<tab>clue`; blank lines
 * and `#` comments are ignored; a clue of `-` removes the answer.
 */
export function parseClueLists(sources: readonly { name: string; text: string }[]): ClueLists {
  const clues = new Map<string, string>();
  const problems: string[] = [];
  for (const { name, text } of sources) {
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) return;
      const at = `${name}:${i + 1}`;
      const [rawAnswer, clue, extra] = line.split('\t').map((part) => part.trim());
      if (rawAnswer === undefined || clue === undefined || clue === '' || extra !== undefined) {
        problems.push(`${at}: expected "ANSWER<tab>clue".`);
        return;
      }
      if (!/^[A-Za-z]+$/.test(rawAnswer)) {
        problems.push(`${at}: "${rawAnswer}" is not letters only.`);
        return;
      }
      const answer = rawAnswer.toUpperCase();
      if (clue === EXCLUDE) {
        clues.delete(answer);
        return;
      }
      if (givesAway(clue, answer)) {
        problems.push(`${at}: the clue for ${answer} contains the answer.`);
        return;
      }
      clues.set(answer, clue);
    });
  }
  return { clues, problems };
}

export async function readClueLists(paths: readonly string[]): Promise<ClueLists> {
  const sources = await Promise.all(
    paths.map(async (path) => ({ name: path, text: await readFile(path, 'utf8') })),
  );
  return parseClueLists(sources);
}

/** The answers a puzzle can use: clued, in the dictionary, and within the allowed lengths. */
export function candidatePool(
  clues: ReadonlyMap<string, string>,
  words: ReadonlySet<string>,
): Candidate[] {
  return [...clues]
    .filter(([answer]) => words.has(answer))
    .map(([answer, clue]) => ({ answer, clue }));
}
