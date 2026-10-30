import { describe, expect, it } from 'vitest';
import {
  cellKey,
  checkGuess,
  evaluateGuess,
  fitsPuzzle,
  gameStatus,
  guessesRemaining,
  guessLimit,
  isSolved,
  loadClientPuzzle,
  loadPuzzle,
  lockedLetters,
  newGame,
  recordGuess,
  toPublicFile,
  type ClientEntry,
  type ClientPuzzle,
  type GameState,
  type PuzzleFile,
  type RuleOverrides,
  type ScoredLetter,
} from '../src';

/**
 *   C A T      1A CAT   1D COD
 *   O . O      2D TOE   3A DUE
 *   D U E
 *
 * The client only ever sees the public (answer-free) puzzle; this helper keeps the answers on the
 * side and scores guesses the way the server does, so the tests exercise the real client flow.
 */
function ring(rules?: RuleOverrides) {
  const file: PuzzleFile = {
    version: 1,
    id: 'ring',
    title: 'Ring',
    answerEncoding: 'plain',
    ...(rules === undefined ? {} : { rules }),
    entries: [
      { row: 0, col: 0, direction: 'across', answer: 'CAT', clue: 'Pet that purrs' },
      { row: 0, col: 0, direction: 'down', answer: 'COD', clue: 'White fish' },
      { row: 0, col: 2, direction: 'down', answer: 'TOE', clue: 'Foot digit' },
      { row: 2, col: 0, direction: 'across', answer: 'DUE', clue: 'Owed' },
    ],
  };
  const puzzle = loadClientPuzzle(toPublicFile(file));
  const answers = new Map(loadPuzzle(file).entries.map((e) => [e.id, e.answer]));
  return { puzzle, answers };
}

type Ring = ReturnType<typeof ring>;

/** Accepts every word, for puzzles that only take real words. */
const anyWord = () => true;

/** Plays a sequence of [entryId, guess] moves, scoring each one server-style. */
function play(ctx: Ring, moves: [string, string][], from?: GameState): GameState {
  return moves.reduce(
    (state, [entryId, guess]) => {
      const check = checkGuess(ctx.puzzle, state, entryId, guess, anyWord);
      if (!check.ok) throw new Error(`${entryId} ${guess}: ${check.error}`);
      const answer = ctx.answers.get(check.entry.id)!;
      const letters = evaluateGuess(check.guess, answer, {
        duplicateCounts: ctx.puzzle.rules.duplicateCounts,
      });
      return recordGuess(state, check.entry, letters);
    },
    from ?? newGame(ctx.puzzle),
  );
}

function entry(puzzle: ClientPuzzle, id: string): ClientEntry {
  return puzzle.entries.find((e) => e.id === id)!;
}

/** A row of grey tiles for the given word, for building saved states directly. */
const greyRow = (word: string): ScoredLetter[] =>
  Array.from(word, (letter) => ({ letter, mark: 'absent' }));

describe('crossing locks', () => {
  it('keeps greens off the grid until the entry is solved', () => {
    const ctx = ring();
    const state = play(ctx, [['1A', 'COT']]);
    expect(lockedLetters(ctx.puzzle, state).size).toBe(0);
  });

  it('locks every cell of a solved entry, which the crossing entries share', () => {
    const ctx = ring();
    const state = play(ctx, [
      ['1A', 'COT'],
      ['1A', 'CAT'],
    ]);
    const locks = lockedLetters(ctx.puzzle, state);

    expect(entry(ctx.puzzle, '1A').cells.map((cell) => locks.get(cellKey(cell)))).toEqual([
      'C',
      'A',
      'T',
    ]);
    expect(locks.has(cellKey({ row: 1, col: 0 }))).toBe(false);
  });

  it('locks greens as soon as they are found when lockGreens is on', () => {
    const ctx = ring({ lockGreens: true });
    const state = play(ctx, [['1A', 'COT']]);
    const locks = lockedLetters(ctx.puzzle, state);

    expect(locks.get(cellKey({ row: 0, col: 0 }))).toBe('C');
    expect(locks.get(cellKey({ row: 0, col: 2 }))).toBe('T');
    expect(locks.has(cellKey({ row: 0, col: 1 }))).toBe(false);
  });

  it('lets a guess fish with other letters where a cell is locked, and keeps the lock', () => {
    const ctx = ring({ lockGreens: true });
    // 1A's C is green, then BAT ignores it; 1D's guess DOC also crosses that locked C.
    const state = play(ctx, [
      ['1A', 'COP'],
      ['1A', 'BAT'],
      ['1D', 'DOC'],
    ]);
    const locks = lockedLetters(ctx.puzzle, state);

    expect(locks.get(cellKey({ row: 0, col: 0 }))).toBe('C');
    expect(locks.get(cellKey({ row: 0, col: 1 }))).toBe('A');
    expect(locks.get(cellKey({ row: 0, col: 2 }))).toBe('T');
  });

  it('only solves an entry when its exact word is guessed', () => {
    const ctx = ring();
    // Every cell of 1A is green across these guesses, but CAT itself hasn't been guessed.
    const state = play(ctx, [
      ['1A', 'COP'],
      ['1A', 'BAT'],
    ]);
    expect(isSolved(state, entry(ctx.puzzle, '1A'))).toBe(false);
    expect(gameStatus(ctx.puzzle, state)).toBe('playing');

    const after = play(ctx, [['1A', 'CAT']], state);
    expect(isSolved(after, entry(ctx.puzzle, '1A'))).toBe(true);
  });

  it('does not solve an entry whose cells are all filled in by crossings and greens', () => {
    const ctx = ring({ lockGreens: true });
    // COD and TOE lock 1A's C and T; BAN turns its middle A green.
    const state = play(ctx, [
      ['1D', 'COD'],
      ['2D', 'TOE'],
      ['1A', 'BAN'],
    ]);
    const locks = lockedLetters(ctx.puzzle, state);
    expect(entry(ctx.puzzle, '1A').cells.map((cell) => locks.get(cellKey(cell)))).toEqual([
      'C',
      'A',
      'T',
    ]);
    expect(isSolved(state, entry(ctx.puzzle, '1A'))).toBe(false);
  });

  it('keeps a solved entry solved when a crossing guess puts another letter in its cells', () => {
    const ctx = ring();
    const state = play(ctx, [
      ['1A', 'CAT'],
      ['1D', 'DOC'],
    ]);
    const locks = lockedLetters(ctx.puzzle, state);

    expect(isSolved(state, entry(ctx.puzzle, '1A'))).toBe(true);
    expect(locks.get(cellKey({ row: 0, col: 0 }))).toBe('C');
  });

  it('refuses guesses on a solved entry', () => {
    const ctx = ring();
    const state = play(ctx, [['1A', 'cat']]);
    expect(isSolved(state, entry(ctx.puzzle, '1A'))).toBe(true);
    expect(checkGuess(ctx.puzzle, state, '1A', 'CAT', anyWord)).toEqual({
      ok: false,
      error: 'entry-solved',
    });
  });
});

describe('guess checks', () => {
  const ctx = ring();
  const start = newGame(ctx.puzzle);

  it('refuses words of the wrong length or with non-letters', () => {
    expect(checkGuess(ctx.puzzle, start, '1A', 'CATS', anyWord)).toMatchObject({
      error: 'wrong-length',
    });
    expect(checkGuess(ctx.puzzle, start, '1A', 'C4T', anyWord)).toMatchObject({
      error: 'not-letters',
    });
  });

  it('only takes real words when realWordsOnly is on, and needs a word checker', () => {
    const inList = (word: string) => word === 'COT';
    expect(checkGuess(ctx.puzzle, start, '1A', 'XYZ', inList)).toMatchObject({
      error: 'not-a-word',
    });
    expect(checkGuess(ctx.puzzle, start, '1A', 'COT', inList).ok).toBe(true);
    expect(() => checkGuess(ctx.puzzle, start, '1A', 'XYZ')).toThrow(/word checker/);
  });

  it('accepts any combination of letters when realWordsOnly is off', () => {
    const relaxed = ring({ realWordsOnly: false });
    expect(checkGuess(relaxed.puzzle, newGame(relaxed.puzzle), '1A', 'XQZ').ok).toBe(true);
  });

  it('refuses unknown entries', () => {
    expect(checkGuess(ctx.puzzle, start, '9A', 'CAT', anyWord)).toMatchObject({
      error: 'unknown-entry',
    });
  });
});

describe('guess budget', () => {
  it('shares 2 guesses per entry across the puzzle by default', () => {
    const ctx = ring();
    const state = play(ctx, [
      ['1A', 'COT'],
      ['3A', 'DYE'],
    ]);
    // 4 entries at 2 each = 8 guesses.
    expect(guessLimit(ctx.puzzle, entry(ctx.puzzle, '2D'))).toBe(8);
    expect(guessesRemaining(ctx.puzzle, state, entry(ctx.puzzle, '2D'))).toBe(8 - 2);
  });

  it('is lost when the shared pool runs out', () => {
    const ctx = ring({ guessBudget: { kind: 'shared', guessesPerEntry: 1 } });
    const state = play(ctx, [
      ['1A', 'COT'],
      ['3A', 'DYE'],
      ['1D', 'CUD'],
      ['2D', 'TEE'],
    ]);
    expect(gameStatus(ctx.puzzle, state)).toBe('lost');
    expect(checkGuess(ctx.puzzle, state, '1A', 'CAT', anyWord)).toMatchObject({
      error: 'game-over',
    });
  });

  it('can give each entry its own limit instead', () => {
    const ctx = ring({ guessBudget: { kind: 'perEntry', extraGuesses: 1 } });
    const state = play(ctx, [['1A', 'COT']]);
    expect(guessesRemaining(ctx.puzzle, state, entry(ctx.puzzle, '1A'))).toBe(3);
    expect(guessesRemaining(ctx.puzzle, state, entry(ctx.puzzle, '3A'))).toBe(4);
  });
});

describe('saved progress', () => {
  it('fits the puzzle it was saved for', () => {
    const ctx = ring();
    expect(fitsPuzzle(ctx.puzzle, play(ctx, [['1A', 'COT']]))).toBe(true);
  });

  it('does not fit a puzzle whose entries have changed', () => {
    const ctx = ring();
    // Right entry, wrong length:
    expect(
      fitsPuzzle(ctx.puzzle, { puzzleId: 'ring', guesses: { '1A': [greyRow('LEVEL')] } }),
    ).toBe(false);
    // Unknown entry id:
    expect(fitsPuzzle(ctx.puzzle, { puzzleId: 'ring', guesses: { '9D': [greyRow('CAT')] } })).toBe(
      false,
    );
    // Saved for a different puzzle:
    expect(fitsPuzzle(ctx.puzzle, { puzzleId: 'other', guesses: {} })).toBe(false);
  });
});

describe('game status', () => {
  it('is won once every entry is solved', () => {
    const ctx = ring();
    const state = play(ctx, [
      ['1A', 'CAT'],
      ['3A', 'DUE'],
      ['1D', 'COD'],
    ]);
    expect(gameStatus(ctx.puzzle, state)).toBe('playing');

    const done = play(ctx, [['2D', 'TOE']], state);
    expect(gameStatus(ctx.puzzle, done)).toBe('won');
  });
});
