import type { GuessError } from '@crosswordle/engine';

export const guessErrorText: Record<GuessError, string> = {
  'game-over': 'The puzzle is over.',
  'unknown-entry': 'Pick an entry first.',
  'entry-solved': 'That entry is already solved.',
  'no-guesses-left': 'No guesses left.',
  'wrong-length': 'Not enough letters.',
  'not-letters': 'Letters only.',
  'not-a-word': 'Not in the word list.',
};
