import { describe, expect, it } from 'vitest';
import {
  cellKey,
  checkGuess,
  clueOrder,
  evaluateGuess,
  fitsPuzzle,
  gameStatus,
  gameSummary,
  guessesRemaining,
  guessLimit,
  isSolved,
  loadClientPuzzle,
  loadPuzzle,
  lockedLetters,
  newGame,
  nextUnsolved,
  recordGuess,
  recordWordleClue,
  toPublicFile,
  type ClientEntry,
  type ClientPuzzle,
  type GameState,
  type PuzzleFile,
  type RuleOverrides,
  type ScoredLetter,
  canRevealWordleClue,
  crosswordClueFor,
  gridLetters,
  hasSecondClue,
  recordCrosswordClue,
  wordleClueRow,
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

describe('game summary', () => {
  it('counts guesses and each kind of hint, with the status', () => {
    const ctx = ring();
    const state: GameState = {
      ...play(ctx, [
        ['1A', 'COT'],
        ['1A', 'CAT'],
        ['3A', 'DUE'],
      ]),
      crosswordClues: { '1A': 'Feline', '1D': 'Fish' },
      wordleClues: { '3A': { index: 0, letter: 'D' } },
    };
    expect(gameSummary(ctx.puzzle, state)).toEqual({
      status: 'playing',
      guesses: 3,
      crosswordHints: 2,
      wordleHints: 1,
    });

    const done = play(
      ctx,
      [
        ['1D', 'COD'],
        ['2D', 'TOE'],
      ],
      state,
    );
    expect(gameSummary(ctx.puzzle, done)).toMatchObject({ status: 'won', guesses: 5 });
  });

  it("ignores hints for entries that aren't in the puzzle", () => {
    const ctx = ring();
    const state: GameState = {
      ...newGame(ctx.puzzle),
      crosswordClues: { '9A': 'Not here' },
      wordleClues: { '9D': { index: 0, letter: 'X' } },
    };
    expect(gameSummary(ctx.puzzle, state)).toMatchObject({ crosswordHints: 0, wordleHints: 0 });
  });
});

describe('the Crossword clue', () => {
  // A puzzle where 1A has a second clue and 1D doesn't.
  function withClue2() {
    const file: PuzzleFile = {
      version: 1,
      id: 'ring',
      title: 'Ring',
      answerEncoding: 'plain',
      entries: [
        { row: 0, col: 0, direction: 'across', answer: 'CAT', clue: 'Pet', clue2: 'Feline' },
        { row: 0, col: 0, direction: 'down', answer: 'COD', clue: 'Fish' },
      ],
    };
    return loadClientPuzzle(toPublicFile(file));
  }

  it('is offered only for entries with a second clue', () => {
    const puzzle = withClue2();
    expect(hasSecondClue(entry(puzzle, '1A'))).toBe(true);
    expect(hasSecondClue(entry(puzzle, '1D'))).toBe(false);
  });

  it('keeps the clue text the server sent, once', () => {
    const puzzle = withClue2();
    const cat = entry(puzzle, '1A');
    const shown = recordCrosswordClue(newGame(puzzle), cat, 'Feline');
    expect(crosswordClueFor(shown, cat)).toBe('Feline');
    // Already shown: unchanged, the same object.
    expect(recordCrosswordClue(shown, cat, 'Something else')).toBe(shown);
  });

  it("ignores a clue for an entry that hasn't got one", () => {
    const puzzle = withClue2();
    const cod = entry(puzzle, '1D');
    const state = newGame(puzzle);
    expect(recordCrosswordClue(state, cod, 'Made up')).toBe(state);
    expect(crosswordClueFor(state, cod)).toBeUndefined();
  });
});

describe('the Wordle-clue row', () => {
  const letters = (row: ReturnType<typeof wordleClueRow>) =>
    row?.map((cell) => (cell === undefined ? '.' : cell.starred ? `${cell.letter}*` : cell.letter));

  it('shows nothing until the hint is used', () => {
    const ctx = ring();
    expect(wordleClueRow(ctx.puzzle, newGame(ctx.puzzle), entry(ctx.puzzle, '1A'))).toBeUndefined();
  });

  it('adds letters the grid shows from solved crossings, including ones solved after the hint', () => {
    const ctx = ring();
    const cat = entry(ctx.puzzle, '1A');
    // 1A CAT crosses 1D COD at its C and 2D TOE at its T.
    let state = recordWordleClue(newGame(ctx.puzzle), cat, { index: 1, letter: 'A' });
    expect(letters(wordleClueRow(ctx.puzzle, state, cat))).toEqual(['.', 'A*', '.']);

    state = play(ctx, [['2D', 'TOE']], state);
    expect(letters(wordleClueRow(ctx.puzzle, state, cat))).toEqual(['.', 'A*', 'T']);

    state = play(ctx, [['1D', 'COD']], state);
    expect(letters(wordleClueRow(ctx.puzzle, state, cat))).toEqual(['C', 'A*', 'T']);
  });

  it("doesn't add a crossing's unconfirmed greens unless the puzzle locks them", () => {
    const cat = (ctx: Ring) => entry(ctx.puzzle, '1A');
    // COT on 1D has a green C (shared with 1A) but doesn't solve 1D.
    for (const [lockGreens, expected] of [
      [false, ['.', 'A*', '.']],
      [true, ['C', 'A*', '.']],
    ] as const) {
      const ctx = ring({ lockGreens });
      const state = play(
        ctx,
        [['1D', 'CAT']],
        recordWordleClue(newGame(ctx.puzzle), cat(ctx), { index: 1, letter: 'A' }),
      );
      expect(letters(wordleClueRow(ctx.puzzle, state, cat(ctx)))).toEqual(expected);
    }
  });

  it('lists the letters the grid shows in an entry, by position', () => {
    const ctx = ring();
    const state = play(ctx, [['2D', 'TOE']]);
    expect(gridLetters(entry(ctx.puzzle, '1A'), lockedLetters(ctx.puzzle, state))).toEqual([
      { index: 2, letter: 'T' },
    ]);
  });

  it('offers a Wordle clue only while there is something left to reveal', () => {
    const ctx = ring();
    const cat = entry(ctx.puzzle, '1A');
    const offered = (state: GameState) =>
      canRevealWordleClue(state, cat, lockedLetters(ctx.puzzle, state));
    expect(offered(newGame(ctx.puzzle))).toBe(true);
    // C and T from the crossings, A green in a guess: nothing left.
    const known = play(ctx, [
      ['1D', 'COD'],
      ['2D', 'TOE'],
    ]);
    expect(offered(known)).toBe(true);
    expect(offered(play(ctx, [['1A', 'BAD']], known))).toBe(false);
    // Used already, or solved: not offered.
    expect(offered(recordWordleClue(newGame(ctx.puzzle), cat, { index: 0, letter: 'C' }))).toBe(
      false,
    );
    expect(offered(play(ctx, [['1A', 'CAT']]))).toBe(false);
  });

  it('keeps the hint letter starred, and the player’s own greens', () => {
    const ctx = ring();
    const cat = entry(ctx.puzzle, '1A');
    const state = play(
      ctx,
      [
        ['1A', 'COT'],
        ['1D', 'COD'],
      ],
      recordWordleClue(newGame(ctx.puzzle), cat, { index: 0, letter: 'C' }),
    );
    expect(letters(wordleClueRow(ctx.puzzle, state, cat))).toEqual(['C*', '.', 'T']);
  });
});

describe('moving between clues', () => {
  const ids = (entries: readonly ClientEntry[]) => entries.map((e) => e.id);

  it('lists the clues as the clue list shows them: Across, then Down', () => {
    // The puzzle file lists them 1A, 1D, 2D, 3A.
    expect(ids(clueOrder(ring().puzzle))).toEqual(['1A', '3A', '1D', '2D']);
  });

  it('moves on to the next clue in the list, not back to the first unsolved one', () => {
    const ctx = ring();
    const state = play(ctx, [['3A', 'DUE']]);
    expect(nextUnsolved(ctx.puzzle, state, '3A')?.id).toBe('1D');
  });

  it('skips solved clues and wraps round to the top of the list', () => {
    const ctx = ring();
    const state = play(ctx, [
      ['1D', 'COD'],
      ['2D', 'TOE'],
    ]);
    expect(nextUnsolved(ctx.puzzle, state, '2D')?.id).toBe('1A');
    expect(nextUnsolved(ctx.puzzle, state, '1A')?.id).toBe('3A');
  });

  it('starts from the first unsolved clue when there is no current one', () => {
    const ctx = ring();
    expect(nextUnsolved(ctx.puzzle, newGame(ctx.puzzle))?.id).toBe('1A');
    expect(nextUnsolved(ctx.puzzle, play(ctx, [['1A', 'CAT']]))?.id).toBe('3A');
  });

  it('has nowhere to go once every clue is solved', () => {
    const ctx = ring();
    const state = play(ctx, [
      ['1A', 'CAT'],
      ['3A', 'DUE'],
      ['1D', 'COD'],
      ['2D', 'TOE'],
    ]);
    expect(nextUnsolved(ctx.puzzle, state, '2D')).toBeUndefined();
  });
});
