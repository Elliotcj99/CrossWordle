import { createHash } from 'node:crypto';
import { SLUR, type WordNet } from './wordnet';

/**
 * Keeps slurs out of Naughty mode. Its words are meant to be funny-rude, so anything that attacks
 * people for their race, ethnicity, religion, sexuality, gender identity or disability is kept
 * out on purpose (see `data/wordlists-naughty/NOTICE.md`).
 *
 * The blocked words are stored as SHA-256 hashes so the repository never holds them as readable
 * text. That only keeps them off the page: short words are easy to recover from their hashes, so
 * it is not a secret.
 */

/** SHA-256 (hex) of the lowercase word. */
export function hashWord(word: string): string {
  return createHash('sha256').update(word.toLowerCase()).digest('hex');
}

/** The hashes in a blocked-words file: one per line; blank lines and `#` comments ignored. */
export function parseBlocked(text: string): Set<string> {
  const hashes = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (line === '' || line.startsWith('#')) continue;
    if (!/^[0-9a-f]{64}$/.test(line)) throw new Error(`Not a SHA-256 hash: "${raw.trim()}"`);
    hashes.add(line);
  }
  return hashes;
}

/** Reviewed words (`word<tab>why it's fine`): the first column, lowercase. */
export function parseReviewed(text: string): Set<string> {
  const words = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [word] = line.split('\t');
    if (word !== undefined && word.trim() !== '') words.add(word.trim().toLowerCase());
  }
  return words;
}

const SUFFIXES: readonly (readonly [string, string])[] = [
  ['ies', 'y'],
  ['iest', 'y'],
  ['ier', 'y'],
  ['ers', ''],
  ['ing', ''],
  ['es', ''],
  ['ed', ''],
  ['er', ''],
  ['s', ''],
  ['y', ''],
  ['d', ''],
];

/** The word and the stems left after taking off a common ending (FAGS → FAG, SPAZZED → SPAZZ). */
export function forms(word: string): string[] {
  const lower = word.toLowerCase();
  const out = new Set([lower]);
  for (const [ending, replacement] of SUFFIXES) {
    if (lower.length > ending.length + 2 && lower.endsWith(ending)) {
      const stem = lower.slice(0, -ending.length) + replacement;
      out.add(stem);
      // A doubled final consonant (SPAZZED → SPAZ).
      if (/([b-df-hj-np-tv-z])\1$/.test(stem)) out.add(stem.slice(0, -1));
    }
  }
  return [...out];
}

/** The leading and trailing pieces of a compound, each at least three letters, with their forms. */
function pieces(word: string): string[] {
  const lower = word.toLowerCase();
  const out = new Set<string>();
  for (let i = 3; i <= lower.length - 3; i++) {
    for (const piece of [lower.slice(0, i), lower.slice(i)]) {
      for (const form of forms(piece)) out.add(form);
    }
  }
  return [...out];
}

export interface NaughtyLists {
  /** The naughty words, any case. */
  readonly words: readonly string[];
  /** Each clue file's clues: answer → clue. */
  readonly clues: readonly { readonly name: string; readonly clues: ReadonlyMap<string, string> }[];
  /** Hashes of blocked words. */
  readonly blocked: ReadonlySet<string>;
  /** Words looked at and found fine: they pass the compound and WordNet checks (never an exact match). */
  readonly reviewed: ReadonlySet<string>;
  /** Open English WordNet, to flag words with a sense it labels as a slur. Optional. */
  readonly wordnet?: WordNet;
}

/**
 * Problems that keep a word or clue out of Naughty mode:
 * - a word, or a clue word, is a blocked word or one of its forms (never overridable);
 * - a word is a compound with a blocked word at either end, unless reviewed (BASTARD ends in a
 *   blocked word but isn't one);
 * - with WordNet, a word has a sense WordNet labels as a slur, unless reviewed.
 */
export function checkNaughty(lists: NaughtyLists): string[] {
  const { blocked, reviewed, wordnet } = lists;
  const isBlocked = (candidates: readonly string[]) =>
    candidates.some((candidate) => blocked.has(hashWord(candidate)));
  const problems: string[] = [];

  for (const raw of lists.words) {
    const word = raw.toLowerCase();
    if (isBlocked(forms(word))) {
      problems.push(`${word}: a blocked word. Take it out.`);
      continue;
    }
    if (reviewed.has(word)) continue;
    if (isBlocked(pieces(word))) {
      problems.push(
        `${word}: starts or ends with a blocked word. Take it out, or add it to reviewed.tsv ` +
          `if it's a false alarm.`,
      );
    }
    if (wordnet !== undefined) {
      const senses = [...(wordnet.entries.get(word)?.values() ?? [])].flat();
      const definitions = senses.flatMap((id) => wordnet.definitions.get(id) ?? []);
      const slur = definitions.find((definition) => SLUR.test(definition));
      if (slur !== undefined) {
        problems.push(
          `${word}: WordNet labels a sense as a slur ("${slur}"). Take it out, or add it to ` +
            `reviewed.tsv saying why it's fine.`,
        );
      }
    }
  }

  for (const { name, clues } of lists.clues) {
    for (const [answer, clue] of clues) {
      const words = clue.toLowerCase().match(/[a-z]+/g) ?? [];
      if (words.some((word) => isBlocked(forms(word)))) {
        problems.push(`${name}: the clue for ${answer} uses a blocked word.`);
      }
    }
  }
  return problems;
}
