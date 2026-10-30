/**
 * Every tunable rule lives here so a puzzle (or a future settings screen) can change the game
 * without touching the engine's logic.
 */

/** How many guesses a player gets. */
export type GuessBudget =
  /**
   * One pool for the whole puzzle: `guessesPerEntry` × number of entries, rounded to the nearest
   * guess. `guessesPerEntry` may be fractional but is at least 1.
   */
  | { readonly kind: 'shared'; readonly guessesPerEntry: number }
  /** Each entry gets its own limit: its length + `extraGuesses`. */
  | { readonly kind: 'perEntry'; readonly extraGuesses: number };

export interface RuleSet {
  /** Shortest allowed entry. */
  readonly minLength: number;
  /** Longest allowed entry. */
  readonly maxLength: number;
  readonly guessBudget: GuessBudget;
  /**
   * On green and yellow tiles whose letter appears more than once in the answer, show how many
   * times it appears.
   */
  readonly duplicateCounts: boolean;
  /** Guesses must be in the word list, as in Wordle. Off: any combination of letters is a guess. */
  readonly realWordsOnly: boolean;
  /**
   * A green locks its cell on the grid as soon as it is found, and the crossing entry shows it.
   * Off: the grid only shows an entry's letters once its exact word is guessed, so greens stay in
   * the entry's own guesses until then.
   */
  readonly lockGreens: boolean;
}

/** What a puzzle file may override. Overrides replace whole fields. */
export type RuleOverrides = Partial<RuleSet>;

export const DEFAULT_RULES: RuleSet = {
  minLength: 3,
  maxLength: 10,
  // A shared pool of 2 guesses per entry (50 for a 25-entry puzzle), rounded for the whole puzzle.
  // A simulated clue-blind player needs about 3.3 an entry, so this budget has to be won by using
  // the clues and spending the shared pool where it is needed; 8/3 an entry still left too much room.
  guessBudget: { kind: 'shared', guessesPerEntry: 2 },
  duplicateCounts: true,
  realWordsOnly: true,
  lockGreens: false,
};

export function resolveRules(overrides: RuleOverrides = {}): RuleSet {
  return { ...DEFAULT_RULES, ...overrides };
}
