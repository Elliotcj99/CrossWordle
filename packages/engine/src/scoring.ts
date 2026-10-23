/** `correct` = right letter, right place; `present` = in the word elsewhere; `absent` = not (or no copies left). */
export type Mark = 'correct' | 'present' | 'absent';

export interface ScoredLetter {
  readonly letter: string;
  readonly mark: Mark;
  /**
   * How many times this letter appears in the answer. Only set on green or yellow tiles whose
   * letter appears more than once in the answer, and only when the duplicate-count rule is on.
   */
  readonly answerCount?: number;
}

export function countLetters(word: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const letter of word) {
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  return counts;
}

/**
 * Wordle scoring with repeated letters on either side. Greens are taken first, then yellows
 * left to right while unmatched copies of that letter remain in the answer.
 */
export function scoreGuess(guess: string, answer: string): Mark[] {
  if (guess.length !== answer.length) {
    throw new RangeError(`Guess "${guess}" is not the length of the answer (${answer.length}).`);
  }

  const marks: Mark[] = Array.from({ length: guess.length }, () => 'absent');
  const unmatched = new Map<string, number>();

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) {
      marks[i] = 'correct';
    } else {
      const letter = answer[i]!;
      unmatched.set(letter, (unmatched.get(letter) ?? 0) + 1);
    }
  }

  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'correct') continue;
    const letter = guess[i]!;
    const remaining = unmatched.get(letter) ?? 0;
    if (remaining > 0) {
      marks[i] = 'present';
      unmatched.set(letter, remaining - 1);
    }
  }

  return marks;
}

/**
 * The duplicate-count badge for each tile: how many times its letter appears in the answer, on
 * green and yellow tiles whose letter appears more than once there; `undefined` elsewhere
 * (grey tiles, and letters the answer has only once).
 */
export function duplicateCounts(
  guess: string,
  answer: string,
  marks: readonly Mark[] = scoreGuess(guess, answer),
): (number | undefined)[] {
  const inAnswer = countLetters(answer);
  return Array.from(guess, (letter, i) => {
    const count = inAnswer.get(letter) ?? 0;
    return marks[i] !== 'absent' && count > 1 ? count : undefined;
  });
}

/** The best mark each letter has earned across some scored letters, e.g. for keyboard colours. */
export function bestMarks(letters: readonly ScoredLetter[]): Map<string, Mark> {
  const rank: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
  const marks = new Map<string, Mark>();
  for (const { letter, mark } of letters) {
    const current = marks.get(letter);
    if (current === undefined || rank[mark] > rank[current]) marks.set(letter, mark);
  }
  return marks;
}

/** Scores a guess and, when enabled, adds the duplicate-count badges. */
export function evaluateGuess(
  guess: string,
  answer: string,
  options: { readonly duplicateCounts: boolean },
): ScoredLetter[] {
  const marks = scoreGuess(guess, answer);
  const counts = options.duplicateCounts ? duplicateCounts(guess, answer, marks) : [];
  return marks.map((mark, i) => {
    const answerCount = counts[i];
    const letter = guess[i]!;
    return answerCount === undefined ? { letter, mark } : { letter, mark, answerCount };
  });
}
