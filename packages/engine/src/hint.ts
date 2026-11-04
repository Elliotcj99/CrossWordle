import { scoreGuess } from './scoring';

/** A position of the answer to reveal, and the letter there. */
export interface HintLetter {
  readonly index: number;
  readonly letter: string;
}

/**
 * Picks a letter of the answer to reveal as a Wordle-clue hint, given the guesses made so far and
 * the letters the grid already shows in the entry (`known`: from solved crossings, or locked
 * crossing greens).
 *
 * A known letter counts only where it really is the answer's letter at that position, the same as
 * a green in a guess. The browser sends `known`, so this check is what stops a caller naming
 * positions it doesn't know to choose which letter is revealed (and so read the answer a letter at
 * a time): to rule a position out, the caller has to know its letter already.
 *
 * It never reveals a position the player can already see (green in a guess, or on the grid), and
 * prefers, in order:
 *   1. letters not seen at all (never green or yellow in any guess, nor on the grid),
 *   2. then letters only ever seen as yellow,
 *   3. then letters already seen green somewhere else (e.g. one of a repeated letter);
 * and within each group it prefers letters that occur fewer times in the answer (single, then
 * double, then triple, …). Ties go to the leftmost position. Returns `undefined` when every
 * position is already known, so there is nothing new to reveal.
 */
export function chooseHintLetter(
  answer: string,
  guesses: readonly string[],
  known: readonly HintLetter[] = [],
): HintLetter | undefined {
  const greenAt = new Set<number>();
  const greenLetters = new Set<string>();
  const yellowLetters = new Set<string>();
  // A letter the grid shows counts as a green, if it's right: the player can see it in place.
  for (const { index, letter } of known) {
    if (answer[index] === letter) {
      greenAt.add(index);
      greenLetters.add(letter);
    }
  }
  for (const guess of guesses) {
    if (guess.length !== answer.length) continue;
    scoreGuess(guess, answer).forEach((mark, i) => {
      if (mark === 'correct') {
        greenAt.add(i);
        greenLetters.add(answer[i]!);
      } else if (mark === 'present') {
        yellowLetters.add(guess[i]!);
      }
    });
  }

  const counts = new Map<string, number>();
  for (const letter of answer) counts.set(letter, (counts.get(letter) ?? 0) + 1);

  // Lower is better: 0 = unseen, 1 = seen only as yellow, 2 = seen green elsewhere.
  const tierOf = (letter: string): number => {
    if (greenLetters.has(letter)) return 2;
    if (yellowLetters.has(letter)) return 1;
    return 0;
  };

  let best: { index: number; tier: number; count: number } | undefined;
  for (let i = 0; i < answer.length; i++) {
    if (greenAt.has(i)) continue; // Rule 1: never a position the player can already see.
    const letter = answer[i]!;
    const candidate = { index: i, tier: tierOf(letter), count: counts.get(letter)! };
    if (
      best === undefined ||
      candidate.tier < best.tier ||
      (candidate.tier === best.tier && candidate.count < best.count)
    ) {
      best = candidate;
    }
  }

  return best === undefined ? undefined : { index: best.index, letter: answer[best.index]! };
}
