import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity';

/**
 * Checks for nicknames shown on the public leaderboard. Two layers: the `obscenity` library, which
 * knows English profanity and slurs with their usual disguises (look-alike characters, repeated
 * letters) and leaves innocent words like "Scunthorpe" alone, and our own list of rude words (the
 * Naughty mode list), matched as whole words. Spelling a word out with gaps ("f u c k", "s.h.i.t")
 * is caught by joining runs of single characters and looking for our words anywhere inside the run
 * (so a stray letter beside it, "x b u m", doesn't hide it); ordinary words are never joined, so
 * "Pen Island" stays allowed.
 */

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

const MIN_LENGTH = 2;
const MAX_LENGTH = 20;

/**
 * Characters that show as nothing: the Hangul fillers, the braille blank, zero-width and invisible
 * formatting characters, and the marks that draw nothing (the grapheme joiner and variation
 * selectors), which could otherwise split a word unseen. A name with any of them is refused.
 */
const INVISIBLE: readonly (readonly [number, number])[] = [
  [0x034f, 0x034f],
  [0x115f, 0x1160],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x2060, 0x2064],
  [0x2800, 0x2800],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xe0100, 0xe01ef],
];

function hasInvisible(text: string): boolean {
  return [...text].some((char) => {
    const code = char.codePointAt(0)!;
    return INVISIBLE.some(([from, to]) => code >= from && code <= to);
  });
}

/**
 * A nickname tidied up (trimmed, inner spaces collapsed), or `undefined` if it isn't 2–20
 * characters of letters (with the marks some scripts write on them), digits, spaces, `-`, `_` and
 * `.`, starting with a letter or digit and with nothing invisible.
 */
export function tidyNickname(raw: string): string | undefined {
  const nickname = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const length = [...nickname].length;
  if (length < MIN_LENGTH || length > MAX_LENGTH || hasInvisible(nickname)) return undefined;
  return /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u.test(nickname) ? nickname : undefined;
}

/** Common digit stand-ins for letters. A 1 can be an i or an l, so both readings are checked. */
const LOOKALIKES: Readonly<Record<string, readonly string[]>> = {
  '0': ['o'],
  '1': ['i', 'l'],
  '3': ['e'],
  '4': ['a'],
  '5': ['s'],
  '7': ['t'],
  '8': ['b'],
};

/** Runs of single characters separated by spaces or punctuation: "x f u c k" in "Mr x f u c k". */
const SPELLED_OUT = /(?:^|(?<=[\s._-]))(?:[\p{L}\p{N}][\s._-]+){2,}[\p{L}\p{N}](?=$|[\s._-])/gu;

/** The text with each spelled-out run joined up: "f u c k" → "fuck". */
function joinSpelledOut(text: string): string {
  return text.replace(SPELLED_OUT, (run) => run.replace(/[\s._-]+/g, ''));
}

/** Every reading of a word with its look-alike digits turned into letters: "be11end" → …, "bellend". */
function readings(word: string): string[] {
  let out = [''];
  for (const char of word) {
    const options = LOOKALIKES[char] ?? [char];
    out = out.flatMap((prefix) => options.map((option) => prefix + option));
    if (out.length > 64) return [word]; // A name full of digits: the library's check covers it.
  }
  return out;
}

/** The words of a nickname, lowercased, in every look-alike reading. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter((word) => word !== '')
    .flatMap(readings);
}

/**
 * Whether a tidied nickname may be shown. `rudeWords` are lowercase whole words to refuse, on top
 * of the library's list.
 */
export function nicknameAllowed(nickname: string, rudeWords: ReadonlySet<string>): boolean {
  // A mark on a letter ("Bel̵lend") mustn't hide the word: check the name with every mark
  // removed too. Only for checking; the name keeps its marks.
  const bare = nickname.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  return allowedAsWritten(nickname, rudeWords) && allowedAsWritten(bare, rudeWords);
}

function allowedAsWritten(nickname: string, rudeWords: ReadonlySet<string>): boolean {
  const joined = joinSpelledOut(nickname);
  if (matcher.hasMatch(nickname) || matcher.hasMatch(joined)) return false;
  if (wordsOf(joined).some((word) => rudeWords.has(word))) return false;
  // Inside a spelled-out run, a word on our list counts wherever it is: the gaps hide its edges.
  const runs = (nickname.match(SPELLED_OUT) ?? []).flatMap((run) =>
    readings(run.replace(/[\s._-]+/g, '').toLowerCase()),
  );
  return !runs.some((run) => [...rudeWords].some((word) => word.length >= 3 && run.includes(word)));
}
