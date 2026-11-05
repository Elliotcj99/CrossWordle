import { describe, expect, it } from 'vitest';
import { NAUGHTY, NORMAL } from '../src/lib/collections';
import { historyFor, statsFor } from '../src/lib/stats';

const results = {
  '2026-11-03': { won: true, guesses: 14 },
  '2026-11-04': { won: true, guesses: 12 },
  'naughty-2026-11-04': { won: false, guesses: 20 },
  'naughty-2026-11-05': { won: true, guesses: 10 },
  sample: { won: false, guesses: 20 },
};

describe('statsFor', () => {
  it("counts the daily puzzles without the Naughty ones, which don't break the streak", () => {
    expect(statsFor(results, NORMAL, '2026-11-05')).toEqual({
      played: 3,
      won: 2,
      currentStreak: 2,
      bestStreak: 2,
      averageGuesses: 13,
    });
  });

  it('counts the Naughty puzzles alone, with streaks by their dates', () => {
    expect(statsFor(results, NAUGHTY, '2026-11-05')).toEqual({
      played: 2,
      won: 1,
      currentStreak: 1,
      bestStreak: 1,
      averageGuesses: 10,
    });
  });

  it('is all zeros with nothing finished', () => {
    expect(statsFor({}, NAUGHTY, '2026-11-05')).toMatchObject({ played: 0, currentStreak: 0 });
  });
});

describe('historyFor', () => {
  it("lists one collection's puzzles newest first, undated last", () => {
    expect(historyFor(results, NORMAL).map((r) => [r.puzzleId, r.date])).toEqual([
      ['2026-11-04', '2026-11-04'],
      ['2026-11-03', '2026-11-03'],
      ['sample', undefined],
    ]);
    expect(historyFor(results, NAUGHTY).map((r) => r.puzzleId)).toEqual([
      'naughty-2026-11-05',
      'naughty-2026-11-04',
    ]);
  });
});
