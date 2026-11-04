import {
  evaluateGuess,
  loadClientPuzzle,
  toPublicFile,
  type ClientPuzzle,
  type PuzzleFile,
} from '@crosswordle/engine';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import { Records } from '../records';
import { Stats, Visits } from '../stats';

const file: PuzzleFile = {
  version: 1,
  id: '2026-11-04',
  title: 'Ring',
  answerEncoding: 'plain',
  entries: [
    { row: 0, col: 0, direction: 'across', answer: 'CAT', clue: 'Pet that purrs' },
    { row: 0, col: 0, direction: 'down', answer: 'COD', clue: 'White fish' },
    { row: 0, col: 2, direction: 'down', answer: 'TOE', clue: 'Foot digit' },
    { row: 2, col: 0, direction: 'across', answer: 'DUE', clue: 'Owed' },
  ],
};
const answers: Record<string, string> = { '1A': 'CAT', '1D': 'COD', '2D': 'TOE', '3A': 'DUE' };
const on = (id: string): ClientPuzzle => loadClientPuzzle(toPublicFile({ ...file, id }));
const daily = on('2026-11-04');
const naughty = on('naughty-2026-11-04');

const ALICE = '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f';
const BOB = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const CAROL = '6c1f3a52-8d2e-4f7b-a1c9-3e5d7f9b2a4c';

let db: DatabaseSync;
let records: Records;
let clock: Date;

beforeEach(() => {
  db = openDatabase(':memory:');
  clock = new Date('2026-11-04T09:00:00Z');
  records = new Records(db, () => clock);
});

function guess(player: string, puzzle: ClientPuzzle, entryId: string, word: string) {
  records.recordGuess(
    player,
    puzzle,
    entryId,
    evaluateGuess(word, answers[entryId]!, { duplicateCounts: puzzle.rules.duplicateCounts }),
  );
}

const solve = (player: string, puzzle: ClientPuzzle) =>
  Object.entries(answers).forEach(([id, word]) => guess(player, puzzle, id, word));

describe('Stats', () => {
  it('sums up each puzzle, daily and Naughty apart, and each day', () => {
    // Alice wins first time with a Wordle clue; Bob restarts, then wins; Carol only looks at a clue.
    records.recordHint(ALICE, daily, '1A', { kind: 'wordle', letter: { index: 0, letter: 'C' } });
    solve(ALICE, daily);
    guess(BOB, daily, '1A', 'COT');
    records.recordRestart(BOB, daily);
    solve(BOB, daily);
    records.recordHint(CAROL, daily, '1D', { kind: 'crossword', clue: 'Fish' });
    clock = new Date('2026-11-05T10:00:00Z');
    solve(ALICE, naughty);

    const visits = new Visits(db, () => clock);
    visits.count();
    visits.count();

    const report = new Stats(db).report('2026-11-04', '2026-11-05');
    expect(report.daily).toEqual([
      {
        puzzleId: '2026-11-04',
        started: 3,
        finished: 2,
        won: 2,
        lost: 0,
        ranked: 1,
        restarted: 1,
        guesses: 9,
        crosswordClues: 1,
        wordleClues: 1,
      },
    ]);
    expect(report.naughty).toMatchObject([{ puzzleId: 'naughty-2026-11-04', started: 1, won: 1 }]);
    expect(report.days).toEqual([
      { day: '2026-11-04', pageLoads: 0, newPlayers: 3, activePlayers: 2 },
      { day: '2026-11-05', pageLoads: 2, newPlayers: 0, activePlayers: 1 },
    ]);
    expect(report).toMatchObject({ players: 3, playersWithoutGuesses: 1 });
  });

  it('leaves out puzzles dated outside the range', () => {
    solve(ALICE, on('2026-10-01'));
    expect(new Stats(db).report('2026-11-01', '2026-11-07').daily).toEqual([]);
  });
});
