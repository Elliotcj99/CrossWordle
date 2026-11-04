import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity';

/**
 * Checks for nicknames shown on the public leaderboard. Two layers: the `obscenity` library, which
 * knows English profanity and slurs with their usual disguises (look-alike characters, repeated
 * letters) and leaves innocent words like "Scunthorpe" alone, and our own list of rude words (the
 * Naughty mode list), matched as whole words. Spelling a word out with gaps ("f u c k", "s.h.i.t")
 * is caught by joining runs of single characters before checking; ordinary words are never joined,
 * so "Pen Island" stays allowed.
 */

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

const MIN_LENGTH = 2;
const MAX_LENGTH = 20;

/**
 * A nickname tidied up (trimmed, inner spaces collapsed), or `undefined` if it isn't 2–20
 * characters of letters, digits, spaces, `-`, `_` and `.`.
 */
export function tidyNickname(raw: string): string | undefined {
  const nickname = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (nickname.length < MIN_LENGTH || nickname.length > MAX_LENGTH) return undefined;
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(nickname) ? nickname : undefined;
}

/** Common digit and symbol stand-ins for letters. */
const LOOKALIKES: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
};

/** Runs of single characters separated by spaces or punctuation, joined: "f u c k" → "fuck". */
function joinSpelledOut(text: string): string {
  return text.replace(
    /(?:^|(?<=[\s._-]))(?:[\p{L}\p{N}][\s._-]+){2,}[\p{L}\p{N}](?=$|[\s._-])/gu,
    (run) => run.replace(/[\s._-]+/g, ''),
  );
}

/** The words of a nickname, lowercased and with look-alike digits turned into letters. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s._-]+/)
    .map((word) => word.replace(/[0-9]/g, (d) => LOOKALIKES[d] ?? d))
    .filter((word) => word !== '');
}

/**
 * Whether a tidied nickname may be shown. `rudeWords` are lowercase whole words to refuse, on top
 * of the library's list.
 */
export function nicknameAllowed(nickname: string, rudeWords: ReadonlySet<string>): boolean {
  const joined = joinSpelledOut(nickname);
  if (matcher.hasMatch(nickname) || matcher.hasMatch(joined)) return false;
  return !wordsOf(joined).some((word) => rudeWords.has(word));
}
