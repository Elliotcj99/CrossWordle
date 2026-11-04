/**
 * Forms of the same word: JIZZ, JIZZED and JIZZING; FUCKER and FUCKERS; WHORE and WHORED. One
 * puzzle never uses two forms of a word, and a word's forms rest along with it between puzzles.
 * Compounds (SHIT and SHITHEAD) are different words.
 */

/** Endings taken off to find a word's stem, with what replaces them (FLOOZIES → FLOOZY). */
const ENDINGS: readonly (readonly [string, string])[] = [
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

/**
 * The word (lowercase) and the stems left after taking off one common ending: SPAZZED → SPAZZ and
 * SPAZ (a doubled consonant), BOOZING → BOOZ and BOOZE (a dropped E). A stem keeps at least three
 * letters, and a bare -D only comes off after an E (WHORED, not CARD).
 */
export function forms(word: string): string[] {
  const lower = word.toLowerCase();
  const out = new Set([lower]);
  for (const [ending, replacement] of ENDINGS) {
    if (lower.length <= ending.length + 2 || !lower.endsWith(ending)) continue;
    const stem = lower.slice(0, -ending.length) + replacement;
    if (ending === 'd' && !stem.endsWith('e')) continue;
    out.add(stem);
    // A doubled final consonant (SHAGGED → SHAG).
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) out.add(stem.slice(0, -1));
    // A dropped final E (WHORING → WHORE).
    if (replacement === '' && /^(ing|ed|er|ers|y)$/.test(ending)) out.add(`${stem}e`);
  }
  return [...out];
}

/** True if the two words are forms of the same word (they share a stem). */
export function sameWord(a: string, b: string): boolean {
  const theirs = new Set(forms(b));
  return forms(a).some((form) => theirs.has(form));
}

/** Every stem of every word, for checking many candidates against a set of used words. */
export function stemsOf(words: Iterable<string>): Set<string> {
  const stems = new Set<string>();
  for (const word of words) for (const form of forms(word)) stems.add(form);
  return stems;
}

/** True if `word` is a form of any word whose stems are in `stems`. */
export function sharesStem(word: string, stems: ReadonlySet<string>): boolean {
  return forms(word).some((form) => stems.has(form));
}
