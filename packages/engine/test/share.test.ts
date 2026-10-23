import { describe, expect, it } from 'vitest';
import { computeStats, loadPuzzle, newGame, shareText, submitGuess, type GameState } from '../src';

/**
 *   C A T      1A CAT   1D COD
 *   O . O      2D TOE   3A DUE
 *   D U E
 */
const ring = (guessesPerEntry = 3) =>
  loadPuzzle({
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
  });

function play(puzzle: ReturnType<typeof ring>, moves: [string, string][]): GameState {
  return moves.reduce((state, [id, word]) => {
    const result = submitGuess(puzzle, state, id, word);
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }, newGame(puzzle));
}

describe('shareText', () => {
  it('shows each guess as a spoiler-free square', () => {
    const puzzle = ring();
    const state = play(puzzle, [
      ['1A', 'BOX'], // nothing found
      ['1A', 'COT'], // some letters
      ['1A', 'CAT'],
      ['3A', 'DUE'],
      ['1D', 'COD'],
      ['2D', 'TOE'],
    ]);
    expect(shareText(puzzle, state)).toBe(
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
    const puzzle = ring(1);
    const state = play(puzzle, [
      ['1A', 'CAT'],
      ['3A', 'DUE'],
      ['1D', 'CUD'],
      ['2D', 'TEE'],
    ]);
    expect(shareText(puzzle, state)).toContain('1D  🟨❌');
    expect(shareText(puzzle, state)).toContain('Out of guesses after 4');
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
