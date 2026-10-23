/**
 * Every tunable rule lives here so a puzzle (or a future settings screen) can change the game
 * without touching the engine's logic.
 */

/** How many guesses a player gets. */
export type GuessBudget =
  /** One pool for the whole puzzle: `guessesPerEntry` × number of entries. */
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
}

/** What a puzzle file may override. Overrides replace whole fields. */
export type RuleOverrides = Partial<RuleSet>;

export const DEFAULT_RULES: RuleSet = {
  minLength: 3,
  maxLength: 10,
  guessBudget: { kind: 'shared', guessesPerEntry: 3 },
  duplicateCounts: true,
  realWordsOnly: true,
};

export function resolveRules(overrides: RuleOverrides = {}): RuleSet {
  return { ...DEFAULT_RULES, ...overrides };
}
