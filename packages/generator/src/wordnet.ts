import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Clues from Open English WordNet (CC BY 4.0, derived from Princeton WordNet), read from the
 * release's JSON edition (`english-wordnet-<year>-json.zip`, unzipped). Its entries list each
 * word's senses in WordNet's rank order, main sense first.
 */
export interface WordNet {
  /** Lemma → part of speech → synset ids, main sense first. */
  readonly entries: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  /** Synset id → definitions. */
  readonly definitions: ReadonlyMap<string, readonly string[]>;
}

interface EntriesFile {
  [lemma: string]: { [pos: string]: { sense?: { synset: string }[] } };
}

interface SynsetsFile {
  [id: string]: { definition?: string[] };
}

export async function readWordNet(folder: string): Promise<WordNet> {
  const entries = new Map<string, Map<string, string[]>>();
  const definitions = new Map<string, string[]>();
  for (const name of (await readdir(folder)).sort()) {
    const isEntries = /^entries-.+\.json$/.test(name);
    const isSynsets = /^(noun|verb|adj|adv)\..+\.json$/.test(name);
    if (!isEntries && !isSynsets) continue;

    const data: unknown = JSON.parse(await readFile(join(folder, name), 'utf8'));
    if (isEntries) {
      for (const [lemma, byPos] of Object.entries(data as EntriesFile)) {
        const senses = new Map<string, string[]>();
        for (const [pos, entry] of Object.entries(byPos)) {
          // Adjective satellites (s) are adjectives (a) for choosing the main part of speech.
          const group = pos === 's' ? 'a' : pos;
          senses.set(group, [
            ...(senses.get(group) ?? []),
            ...(entry.sense ?? []).map((s) => s.synset),
          ]);
        }
        entries.set(lemma, senses);
      }
    } else {
      for (const [id, synset] of Object.entries(data as SynsetsFile)) {
        definitions.set(id, synset.definition ?? []);
      }
    }
  }
  if (entries.size === 0 || definitions.size === 0) {
    throw new Error(`${folder} does not look like an Open English WordNet JSON release.`);
  }
  return { entries, definitions };
}

/**
 * How WordNet labels a sense that is a slur ("(ethnic slur)", "offensive term for …"). Such a
 * sense is never used as a clue. Rude, vulgar and sexual senses are fine: they're real words.
 */
export const SLUR =
  /\bslur\b|\b(offensive|disparaging|derogatory|contemptuous)\s+(term|name|word|way of referring)\b|\((offensive|disparaging|derogatory)\)/i;

/** Long enough for most main senses; a rare short sense makes a worse clue than a long one. */
const MAX_CLUE_LENGTH = 90;

/**
 * A clue for `word` (lowercase): the first definition, in the word's main part of speech (the
 * one with most senses; ties go to noun, adjective, verb, adverb), that is short enough, isn't
 * a slur sense and doesn't give the answer away. `undefined` if there is none.
 */
export function clueFor(word: string, wordnet: WordNet): string | undefined {
  const byPos = wordnet.entries.get(word);
  if (byPos === undefined) return undefined;

  const order = ['n', 'a', 'v', 'r'];
  const parts = [...byPos.entries()].sort(
    (a, b) => b[1].length - a[1].length || order.indexOf(a[0]) - order.indexOf(b[0]),
  );
  for (const [, synsets] of parts) {
    for (const id of synsets) {
      for (const definition of wordnet.definitions.get(id) ?? []) {
        if (SLUR.test(definition)) continue;
        const clue = tidy(definition);
        if (clue.length >= 8 && clue.length <= MAX_CLUE_LENGTH && !givesAway(clue, word)) {
          return clue;
        }
      }
    }
  }
  return undefined;
}

/** First clause, without bracketed asides, starting with a capital. */
function tidy(definition: string): string {
  const clause = definition
    .replace(/\([^)]*\)/g, '')
    .split(';')[0]!
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s,]+|[\s,]+$/g, '');
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}

/**
 * True if any word in the clue is the answer, shares its stem (LEVEL, LEVELLING), or is a part
 * of four or more letters of it (MAIL in MAILMAN).
 */
export function givesAway(clue: string, answer: string): boolean {
  const word = answer.toLowerCase();
  const stem = word.length > 4 ? word.slice(0, Math.max(4, word.length - 2)) : word;
  return (clue.toLowerCase().match(/[a-z]+/g) ?? []).some(
    (t) => t === word || t.startsWith(stem) || (t.length >= 4 && word.includes(t)),
  );
}
