import { cellKey, type Entry, type Puzzle } from './puzzle';
import { evaluateGuess, type ScoredLetter } from './scoring';

/**
 * Everything the player has done. Feedback, locked cells, budgets and the result are all worked
 * out from this, so it is the only thing that needs saving.
 */
export interface GameState {
  readonly puzzleId: string;
  /** Guesses so far, keyed by entry id, oldest first. */
  readonly guesses: Readonly<Record<string, readonly string[]>>;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export type GuessError =
  | 'game-over'
  | 'unknown-entry'
  | 'entry-solved'
  | 'no-guesses-left'
  | 'wrong-length'
  | 'not-letters'
  | 'conflicts-with-lock'
  | 'not-a-word';

export type GuessResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly error: GuessError };

/**
 * Answers whether a word may be guessed, for puzzles with `realWordsOnly`. The entry's own answer
 * is always allowed.
 */
export type WordChecker = (word: string) => boolean;

export function newGame(puzzle: Puzzle): GameState {
  return { puzzleId: puzzle.id, guesses: {} };
}

/**
 * Whether saved progress fits this puzzle: every guess belongs to one of its entries and is the
 * right length. Saved progress from an earlier version of a puzzle may not.
 */
export function fitsPuzzle(puzzle: Puzzle, state: GameState): boolean {
  return (
    state.puzzleId === puzzle.id &&
    Object.entries(state.guesses).every(([id, guesses]) => {
      const entry = puzzle.entries.find((e) => e.id === id);
      return (
        entry !== undefined &&
        guesses.every((guess) => guess.length === entry.answer.length && /^[A-Z]+$/.test(guess))
      );
    })
  );
}

export function guessesFor(state: GameState, entry: Entry): readonly string[] {
  return state.guesses[entry.id] ?? [];
}

export function feedbackFor(puzzle: Puzzle, state: GameState, entry: Entry): ScoredLetter[][] {
  return guessesFor(state, entry).map((guess) => evaluateGuess(guess, entry.answer, puzzle.rules));
}

/** Cells confirmed by a green in any entry, keyed by `cellKey`. */
export function lockedLetters(puzzle: Puzzle, state: GameState): Map<string, string> {
  const locks = new Map<string, string>();
  for (const entry of puzzle.entries) {
    for (const guess of guessesFor(state, entry)) {
      entry.cells.forEach((cell, i) => {
        if (guess[i] === entry.answer[i]) locks.set(cellKey(cell), entry.answer[i]!);
      });
    }
  }
  return locks;
}

/** The entry's letters as far as they are locked; `undefined` where a cell is still open. */
export function lockedPattern(
  entry: Entry,
  locks: ReadonlyMap<string, string>,
): (string | undefined)[] {
  return entry.cells.map((cell) => locks.get(cellKey(cell)));
}

/** An entry is solved once every cell is locked, whether by its own guesses or by crossings. */
export function isSolved(entry: Entry, locks: ReadonlyMap<string, string>): boolean {
  return entry.cells.every((cell) => locks.has(cellKey(cell)));
}

/** The most guesses allowed: for the whole puzzle (shared budget) or for this entry. */
export function guessLimit(puzzle: Puzzle, entry: Entry): number {
  const budget = puzzle.rules.guessBudget;
  return budget.kind === 'shared'
    ? budget.guessesPerEntry * puzzle.entries.length
    : entry.answer.length + budget.extraGuesses;
}

export function guessesRemaining(puzzle: Puzzle, state: GameState, entry: Entry): number {
  const used =
    puzzle.rules.guessBudget.kind === 'shared'
      ? puzzle.entries.reduce((sum, e) => sum + guessesFor(state, e).length, 0)
      : guessesFor(state, entry).length;
  return guessLimit(puzzle, entry) - used;
}

export function gameStatus(puzzle: Puzzle, state: GameState): GameStatus {
  const locks = lockedLetters(puzzle, state);
  const unsolved = puzzle.entries.filter((entry) => !isSolved(entry, locks));
  if (unsolved.length === 0) return 'won';
  return unsolved.some((entry) => guessesRemaining(puzzle, state, entry) <= 0) ? 'lost' : 'playing';
}

export function submitGuess(
  puzzle: Puzzle,
  state: GameState,
  entryId: string,
  rawGuess: string,
  isWord?: WordChecker,
): GuessResult {
  if (gameStatus(puzzle, state) !== 'playing') return { ok: false, error: 'game-over' };

  const entry = puzzle.entries.find((e) => e.id === entryId);
  if (entry === undefined) return { ok: false, error: 'unknown-entry' };

  const locks = lockedLetters(puzzle, state);
  if (isSolved(entry, locks)) return { ok: false, error: 'entry-solved' };
  if (guessesRemaining(puzzle, state, entry) <= 0) return { ok: false, error: 'no-guesses-left' };

  const guess = rawGuess.toUpperCase();
  if (guess.length !== entry.answer.length) return { ok: false, error: 'wrong-length' };
  if (!/^[A-Z]+$/.test(guess)) return { ok: false, error: 'not-letters' };

  const pattern = lockedPattern(entry, locks);
  if (pattern.some((letter, i) => letter !== undefined && letter !== guess[i])) {
    return { ok: false, error: 'conflicts-with-lock' };
  }
  if (puzzle.rules.realWordsOnly && guess !== entry.answer) {
    if (isWord === undefined) throw new Error('This puzzle needs a word checker for its guesses.');
    if (!isWord(guess)) return { ok: false, error: 'not-a-word' };
  }

  return {
    ok: true,
    state: {
      ...state,
      guesses: { ...state.guesses, [entry.id]: [...guessesFor(state, entry), guess] },
    },
  };
}
