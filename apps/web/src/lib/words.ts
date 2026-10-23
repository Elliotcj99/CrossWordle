import type { WordChecker } from '@crosswordle/engine';

/**
 * Loads the guess dictionary for the given word lengths (`words/<length>.txt`, written by
 * `npm run words`) and returns a checker for it.
 */
export async function loadWordChecker(lengths: Iterable<number>): Promise<WordChecker> {
  const lists = await Promise.all(
    [...new Set(lengths)].map(async (length) => {
      const response = await fetch(`words/${length}.txt`);
      if (!response.ok) {
        throw new Error(`Could not load the ${length}-letter word list (${response.status}).`);
      }
      // The first line is a `#` pointer to NOTICE.md; it can never match a letters-only guess.
      return (await response.text()).split('\n');
    }),
  );
  const words = new Set(lists.flat());
  return (word) => words.has(word);
}
