import { describe, expect, it } from 'vitest';
import {
  checkGuess,
  computeStats,
  evaluateGuess,
  loadClientPuzzle,
  loadPuzzle,
  newGame,
  recordGuess,
  shareText,
  toPublicFile,
  type GameState,
  type PuzzleFile,
} from '../src';

/**
 *   C A T      1A CAT   1D COD
 *   O . O      2D TOE   3A DUE
 *   D U E
 *
 * As in game.test.ts, the client plays the public puzzle while the answers are scored on the side.
 */
const ring = (guessesPerEntry = 3) => {
  const file: PuzzleFile = {
    version: 1,
    id: 'ring',
    title: 'Ring',
    answerEncoding: 'plain',
    rules: { guessBudget: { kind: 'shared', guessesPerEntry } },
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
};

function play(ctx: ReturnType<typeof ring>, moves: [string, string][]): GameState {
  return moves.reduce((state, [id, word]) => {
    const check = checkGuess(ctx.puzzle, state, id, word, () => true);
    if (!check.ok) throw new Error(check.error);
    const letters = evaluateGuess(check.guess, ctx.answers.get(check.entry.id)!, {
      duplicateCounts: ctx.puzzle.rules.duplicateCounts,
    });
    return recordGuess(state, check.entry, letters);
  }, newGame(ctx.puzzle));
}

describe('shareText', () => {
  it('shows each guess as a spoiler-free square', () => {
    const ctx = ring();
    const state = play(ctx, [
      ['1A', 'BOX'], // nothing found
      ['1A', 'COT'], // some letters
      ['1A', 'CAT'],
      ['3A', 'DUE'],
      ['1D', 'COD'],
      ['2D', 'TOE'],
    ]);
    expect(shareText(ctx.puzzle, state)).toBe(
      [
        'CrossWordle · Ring',
        'Solved in 6 guesses',
        '',
        '1A  ⬛🟨🟩',
        '1D  🟩',
        '2D  🟩',
        '3A  🟩',
      ].join('\n'),
    );
  });

  it('marks unsolved entries when the puzzle is lost', () => {
    const ctx = ring(1);
    const state = play(ctx, [
      ['1A', 'CAT'],
      ['3A', 'DUE'],
      ['1D', 'CUD'],
      ['2D', 'TEE'],
    ]);
    expect(shareText(ctx.puzzle, state)).toContain('1D  🟨❌');
    expect(shareText(ctx.puzzle, state)).toContain('Out of guesses after 4');
  });
});

describe('computeStats', () => {
  const win = { won: true, guesses: 20 };
  const loss = { won: false, guesses: 36 };

  it('counts wins and consecutive-day streaks', () => {
    const stats = computeStats(
      {
        '2026-10-20': win,
        '2026-10-21': win,
        '2026-10-22': loss,
        '2026-10-23': win,
        '2026-10-24': { won: true, guesses: 30 },
        sample: win,
      },
      '2026-10-24',
    );
    expect(stats).toEqual({
      played: 6,
      won: 5,
      currentStreak: 2,
      bestStreak: 2,
      averageGuesses: 22,
    });
  });

  it('breaks the streak on a missed day', () => {
    const results = { '2026-10-20': win, '2026-10-22': win };
    expect(computeStats(results, '2026-10-22').currentStreak).toBe(1);
    expect(computeStats(results, '2026-10-25').currentStreak).toBe(0);
    expect(computeStats({}, '2026-10-25').averageGuesses).toBeUndefined();
  });
});
