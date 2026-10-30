import type { ClientEntry, ClientPuzzle } from './client';
import { cellKey } from './puzzle';
import type { ScoredLetter } from './scoring';

/**
 * Everything the player has done, as the *scored* guesses the server returned. The browser never
 * has the answers, so it keeps each guess's marks rather than recomputing them: locks, budgets,
 * the result and the share card are all worked out from this.
 */
export interface GameState {
  readonly puzzleId: string;
  /** Scored guesses so far, keyed by entry id, oldest first. */
  readonly guesses: Readonly<Record<string, readonly (readonly ScoredLetter[])[]>>;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export type GuessError =
  | 'game-over'
  | 'unknown-entry'
  | 'entry-solved'
  | 'no-guesses-left'
  | 'wrong-length'
  | 'not-letters'
  | 'not-a-word';

/** A guess that passed every local check, ready to send to the scoring server. */
export type GuessCheck =
  | { readonly ok: true; readonly entry: ClientEntry; readonly guess: string }
  | { readonly ok: false; readonly error: GuessError };

/**
 * Answers whether a word may be guessed, for puzzles with `realWordsOnly`. Every answer is in the
 * word list (publishing checks this), so the answer itself never needs a special case.
 */
export type WordChecker = (word: string) => boolean;

export function newGame(puzzle: ClientPuzzle): GameState {
  return { puzzleId: puzzle.id, guesses: {} };
}

/**
 * Whether saved progress fits this puzzle: every guess belongs to one of its entries and is the
 * right length. Saved progress from an earlier version of a puzzle may not.
 */
export function fitsPuzzle(puzzle: ClientPuzzle, state: GameState): boolean {
  return (
    state.puzzleId === puzzle.id &&
    Object.entries(state.guesses).every(([id, guesses]) => {
      const entry = puzzle.entries.find((e) => e.id === id);
      return entry !== undefined && guesses.every((guess) => guess.length === entry.length);
    })
  );
}

export function feedbackFor(
  state: GameState,
  entry: ClientEntry,
): readonly (readonly ScoredLetter[])[] {
  return state.guesses[entry.id] ?? [];
}

/** How many guesses have been spent on an entry. */
export function guessCount(state: GameState, entry: ClientEntry): number {
  return feedbackFor(state, entry).length;
}

/** The word of a scored guess, read back from its tiles. */
export function wordOf(guess: readonly ScoredLetter[]): string {
  return guess.map((letter) => letter.letter).join('');
}

/**
 * An entry is solved once its exact word has been guessed. Greens from crossings fill in its cells
 * on the grid, but never solve it on their own.
 */
export function isSolved(state: GameState, entry: ClientEntry): boolean {
  return feedbackFor(state, entry).some(
    (guess) => guess.length === entry.length && guess.every((letter) => letter.mark === 'correct'),
  );
}

/**
 * Cells shown on the grid, keyed by `cellKey`: every cell of a solved entry, plus every green
 * when the puzzle's `lockGreens` rule is on. A lock is for good: later guesses may put other
 * letters there to fish for information, but they never undo it.
 */
export function lockedLetters(puzzle: ClientPuzzle, state: GameState): Map<string, string> {
  const locks = new Map<string, string>();
  for (const entry of puzzle.entries) {
    // A solved entry shows its whole word, read back from the all-green guess that solved it
    // (the browser has no answers of its own).
    if (isSolved(state, entry)) {
      const solving = feedbackFor(state, entry).find(
        (guess) => guess.length === entry.length && guess.every((l) => l.mark === 'correct'),
      )!;
      entry.cells.forEach((cell, i) => locks.set(cellKey(cell), solving[i]!.letter));
      continue;
    }
    if (!puzzle.rules.lockGreens) continue;
    for (const guess of feedbackFor(state, entry)) {
      entry.cells.forEach((cell, i) => {
        if (guess[i]?.mark === 'correct') locks.set(cellKey(cell), guess[i]!.letter);
      });
    }
  }
  return locks;
}

/** The most guesses allowed: for the whole puzzle (shared budget) or for this entry. */
export function guessLimit(puzzle: ClientPuzzle, entry: ClientEntry): number {
  const budget = puzzle.rules.guessBudget;
  return budget.kind === 'shared'
    ? Math.round(budget.guessesPerEntry * puzzle.entries.length)
    : entry.length + budget.extraGuesses;
}

export function guessesRemaining(
  puzzle: ClientPuzzle,
  state: GameState,
  entry: ClientEntry,
): number {
  const used =
    puzzle.rules.guessBudget.kind === 'shared'
      ? puzzle.entries.reduce((sum, e) => sum + guessCount(state, e), 0)
      : guessCount(state, entry);
  return guessLimit(puzzle, entry) - used;
}

export function gameStatus(puzzle: ClientPuzzle, state: GameState): GameStatus {
  const unsolved = puzzle.entries.filter((entry) => !isSolved(state, entry));
  if (unsolved.length === 0) return 'won';
  return unsolved.some((entry) => guessesRemaining(puzzle, state, entry) <= 0) ? 'lost' : 'playing';
}

/**
 * Checks a guess against every rule the browser can enforce without the answer: the game is still
 * going, the entry exists and isn't solved, there are guesses left, and the word is the right
 * length, letters-only and (when required) real. Scoring itself is left to the server.
 */
export function checkGuess(
  puzzle: ClientPuzzle,
  state: GameState,
  entryId: string,
  rawGuess: string,
  isWord?: WordChecker,
): GuessCheck {
  if (gameStatus(puzzle, state) !== 'playing') return { ok: false, error: 'game-over' };

  const entry = puzzle.entries.find((e) => e.id === entryId);
  if (entry === undefined) return { ok: false, error: 'unknown-entry' };

  if (isSolved(state, entry)) return { ok: false, error: 'entry-solved' };
  if (guessesRemaining(puzzle, state, entry) <= 0) return { ok: false, error: 'no-guesses-left' };

  const guess = rawGuess.toUpperCase();
  if (guess.length !== entry.length) return { ok: false, error: 'wrong-length' };
  if (!/^[A-Z]+$/.test(guess)) return { ok: false, error: 'not-letters' };

  if (puzzle.rules.realWordsOnly) {
    if (isWord === undefined) throw new Error('This puzzle needs a word checker for its guesses.');
    if (!isWord(guess)) return { ok: false, error: 'not-a-word' };
  }

  return { ok: true, entry, guess };
}

/** Appends a scored guess (as returned by the server) to an entry. */
export function recordGuess(
  state: GameState,
  entry: ClientEntry,
  letters: readonly ScoredLetter[],
): GameState {
  return {
    ...state,
    guesses: { ...state.guesses, [entry.id]: [...feedbackFor(state, entry), letters] },
  };
}
