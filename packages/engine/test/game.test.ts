import { describe, expect, it } from 'vitest';
import {
  cellKey,
  fitsPuzzle,
  gameStatus,
  guessesRemaining,
  isSolved,
  loadPuzzle,
  lockedLetters,
  lockedPattern,
  newGame,
  submitGuess,
  type GameState,
  type Puzzle,
  type RuleOverrides,
} from '../src';

/**
 *   C A T      1A CAT   1D COD
 *   O . O      2D TOE   3A DUE
 *   D U E
 */
function ring(rules?: RuleOverrides): Puzzle {
  return loadPuzzle({
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
  });
}

const anyWord = () => true;

function play(puzzle: Puzzle, moves: [string, string][]): GameState {
  return moves.reduce((state, [entryId, guess]) => {
    const result = submitGuess(puzzle, state, entryId, guess, anyWord);
    if (!result.ok) throw new Error(`${entryId} ${guess}: ${result.error}`);
    return result.state;
  }, newGame(puzzle));
}

function entry(puzzle: Puzzle, id: string) {
  return puzzle.entries.find((e) => e.id === id)!;
}

describe('crossing locks', () => {
  it('locks greens and shows them in the crossing entry', () => {
    const puzzle = ring();
    const state = play(puzzle, [['1A', 'COT']]);
    const locks = lockedLetters(puzzle, state);

    expect(locks.get(cellKey({ row: 0, col: 0 }))).toBe('C');
    expect(locks.get(cellKey({ row: 0, col: 2 }))).toBe('T');
    expect(locks.has(cellKey({ row: 0, col: 1 }))).toBe(false);
    expect(lockedPattern(entry(puzzle, '2D'), locks)).toEqual(['T', undefined, undefined]);
  });

  it('refuses a guess that overwrites a locked letter', () => {
    const puzzle = ring();
    const state = play(puzzle, [['1A', 'CAT']]);
    expect(submitGuess(puzzle, state, '1D', 'DOC', anyWord)).toEqual({
      ok: false,
      error: 'conflicts-with-lock',
    });
  });

  it('refuses guesses on a solved entry', () => {
    const puzzle = ring();
    const state = play(puzzle, [['1A', 'cat']]);
    expect(isSolved(entry(puzzle, '1A'), lockedLetters(puzzle, state))).toBe(true);
    expect(submitGuess(puzzle, state, '1A', 'CAT', anyWord)).toEqual({
      ok: false,
      error: 'entry-solved',
    });
  });
});

describe('guess checks', () => {
  const puzzle = ring();
  const start = newGame(puzzle);

  it('refuses words of the wrong length or with non-letters', () => {
    expect(submitGuess(puzzle, start, '1A', 'CATS', anyWord)).toMatchObject({
      error: 'wrong-length',
    });
    expect(submitGuess(puzzle, start, '1A', 'C4T', anyWord)).toMatchObject({
      error: 'not-letters',
    });
  });

  it('refuses words the dictionary does not know, but always accepts the answer', () => {
    const noWords = () => false;
    expect(submitGuess(puzzle, start, '1A', 'XYZ', noWords)).toMatchObject({ error: 'not-a-word' });
    expect(submitGuess(puzzle, start, '1A', 'CAT', noWords).ok).toBe(true);
  });

  it('refuses unknown entries', () => {
    expect(submitGuess(puzzle, start, '9A', 'CAT', anyWord)).toMatchObject({
      error: 'unknown-entry',
    });
  });
});

describe('guess budget', () => {
  it('shares 3 guesses per entry across the puzzle by default', () => {
    const puzzle = ring();
    const state = play(puzzle, [
      ['1A', 'COT'],
      ['3A', 'DYE'],
    ]);
    expect(guessesRemaining(puzzle, state, entry(puzzle, '2D'))).toBe(4 * 3 - 2);
  });

  it('is lost when the shared pool runs out', () => {
    const puzzle = ring({ guessBudget: { kind: 'shared', guessesPerEntry: 1 } });
    const state = play(puzzle, [
      ['1A', 'COT'],
      ['3A', 'DYE'],
      ['1D', 'CUD'],
      ['2D', 'TEE'],
    ]);
    expect(gameStatus(puzzle, state)).toBe('lost');
    expect(submitGuess(puzzle, state, '1A', 'CAT', anyWord)).toMatchObject({ error: 'game-over' });
  });

  it('can give each entry its own limit instead', () => {
    const puzzle = ring({ guessBudget: { kind: 'perEntry', extraGuesses: 1 } });
    const state = play(puzzle, [['1A', 'COT']]);
    expect(guessesRemaining(puzzle, state, entry(puzzle, '1A'))).toBe(3);
    expect(guessesRemaining(puzzle, state, entry(puzzle, '3A'))).toBe(4);
  });
});

describe('saved progress', () => {
  it('fits the puzzle it was saved for', () => {
    const puzzle = ring();
    expect(fitsPuzzle(puzzle, play(puzzle, [['1A', 'COT']]))).toBe(true);
  });

  it('does not fit a puzzle whose entries have changed', () => {
    const puzzle = ring();
    expect(fitsPuzzle(puzzle, { puzzleId: 'ring', guesses: { '1A': ['LEVEL'] } })).toBe(false);
    expect(fitsPuzzle(puzzle, { puzzleId: 'ring', guesses: { '9D': ['CAT'] } })).toBe(false);
    expect(fitsPuzzle(puzzle, { puzzleId: 'other', guesses: {} })).toBe(false);
  });
});

describe('game status', () => {
  it('is won once every entry is solved', () => {
    const puzzle = ring();
    const state = play(puzzle, [
      ['1A', 'CAT'],
      ['3A', 'DUE'],
      ['1D', 'COD'],
    ]);
    expect(gameStatus(puzzle, state)).toBe('playing');

    const done = play(puzzle, [
      ['1A', 'CAT'],
      ['3A', 'DUE'],
      ['1D', 'COD'],
      ['2D', 'TOE'],
    ]);
    expect(gameStatus(puzzle, done)).toBe('won');
  });
});
