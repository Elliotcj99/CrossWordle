import {
  evaluateGuess,
  loadClientPuzzle,
  toPublicFile,
  type ClientPuzzle,
  type PuzzleFile,
} from '@crosswordle/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db';
import { playerIdFrom, Records } from '../records';
import { ForgottenPlayerError, playerTables } from '../players';
import { Review } from '../review';

/**
 *   C A T      1A CAT   1D COD
 *   O . O      2D TOE   3A DUE
 *   D U E
 *
 * Two guesses per entry (the default), so eight for the puzzle.
 */
const file: PuzzleFile = {
  version: 1,
  id: 'ring',
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
const puzzle: ClientPuzzle = loadClientPuzzle(toPublicFile(file));
const SOLUTION: [string, string][] = Object.entries(answers);

const ALICE = '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f';

/** Another puzzle with the same grid, for a player's earlier games. */
const puzzleOn = (id: string): ClientPuzzle => loadClientPuzzle(toPublicFile({ ...file, id }));

let db: DatabaseSync;
let records: Records;
let clock: number;

beforeEach(() => {
  // Each stamp moves the clock on a second; `wait` moves it on further.
  clock = Date.parse('2026-11-04T09:00:00Z');
  db = openDatabase(':memory:');
  records = new Records(db, () => new Date((clock += 1000)));
});

const wait = (minutes: number) => (clock += minutes * 60_000);

function guess(entryId: string, word: string, player = ALICE, on = puzzle) {
  records.recordGuess(
    player,
    on,
    entryId,
    evaluateGuess(word, answers[entryId]!, {
      duplicateCounts: puzzle.rules.duplicateCounts,
    }),
  );
}

describe('Records', () => {
  it('ranks an unbroken first attempt that was won, with its guesses and hints', () => {
    guess('1A', 'COT');
    records.recordHint(ALICE, puzzle, '1D', { kind: 'crossword', clue: 'Fish' });
    records.recordHint(ALICE, puzzle, '3A', { kind: 'wordle', letter: { index: 0, letter: 'D' } });
    SOLUTION.forEach(([id, word]) => guess(id, word));

    expect(records.result(ALICE, 'ring')).toEqual({
      attempt: 1,
      won: true,
      guesses: 5,
      crosswordHints: 1,
      wordleHints: 1,
      ranked: true,
      unrankedReason: null,
    });
  });

  it('records nothing until the game ends', () => {
    guess('1A', 'CAT');
    expect(records.result(ALICE, 'ring')).toBeUndefined();
  });

  it('records a lost game, unranked', () => {
    ['COT', 'CUT'].forEach((w) => guess('1A', w));
    ['CAD', 'COT'].forEach((w) => guess('1D', w));
    ['TOT', 'TIE'].forEach((w) => guess('2D', w));
    ['DIE', 'DYE'].forEach((w) => guess('3A', w));
    expect(records.result(ALICE, 'ring')).toMatchObject({
      won: false,
      guesses: 8,
      ranked: false,
      unrankedReason: 'lost',
    });
  });

  it('unranks a game the player restarted, counting only the attempt they finished', () => {
    guess('1A', 'COT');
    guess('1A', 'CAT');
    records.recordRestart(ALICE, puzzle);
    SOLUTION.forEach(([id, word]) => guess(id, word));

    expect(records.result(ALICE, 'ring')).toMatchObject({
      attempt: 2,
      won: true,
      guesses: 4,
      ranked: false,
      unrankedReason: 'restarted',
    });
  });

  it('treats a guess on an entry already solved as a restart the page did not report', () => {
    guess('1A', 'CAT');
    guess('1A', 'CAT');
    SOLUTION.filter(([id]) => id !== '1A').forEach(([id, word]) => guess(id, word));
    expect(records.result(ALICE, 'ring')).toMatchObject({ attempt: 2, ranked: false });
  });

  it('ignores a restart before the player has done anything', () => {
    records.recordRestart(ALICE, puzzle);
    SOLUTION.forEach(([id, word]) => guess(id, word));
    expect(records.result(ALICE, 'ring')).toMatchObject({ attempt: 1, ranked: true });
  });

  it('keeps the first finish when the player plays the puzzle again', () => {
    SOLUTION.forEach(([id, word]) => guess(id, word));
    const first = records.result(ALICE, 'ring');
    // Playing again after finishing is a new attempt, and its finish doesn't replace the first.
    ['COT', 'CUT'].forEach((w) => guess('1A', w));
    ['CAD', 'COT'].forEach((w) => guess('1D', w));
    ['TOT', 'TIE'].forEach((w) => guess('2D', w));
    ['DIE', 'DYE'].forEach((w) => guess('3A', w));
    expect(records.result(ALICE, 'ring')).toEqual(first);
  });

  it('counts each kind of hint once per entry', () => {
    records.recordHint(ALICE, puzzle, '1A', { kind: 'crossword', clue: 'Feline' });
    records.recordHint(ALICE, puzzle, '1A', { kind: 'crossword', clue: 'Feline' });
    records.recordHint(ALICE, puzzle, '1A', { kind: 'wordle', letter: { index: 1, letter: 'A' } });
    records.recordHint(ALICE, puzzle, '1A', { kind: 'wordle', letter: { index: 2, letter: 'T' } });
    SOLUTION.forEach(([id, word]) => guess(id, word));
    expect(records.result(ALICE, 'ring')).toMatchObject({ crosswordHints: 1, wordleHints: 1 });
  });

  it('keeps the revealed clue and letter in its record of the game', () => {
    records.recordHint(ALICE, puzzle, '1D', { kind: 'crossword', clue: 'Fish' });
    records.recordHint(ALICE, puzzle, '3A', { kind: 'wordle', letter: { index: 0, letter: 'D' } });
    expect(records.state(ALICE, puzzle, 1)).toMatchObject({
      crosswordClues: { '1D': 'Fish' },
      wordleClues: { '3A': { index: 0, letter: 'D' } },
    });
  });

  it("gives back the player's current game, read-only, and their finished puzzles", () => {
    expect(records.currentGame(ALICE, puzzle)).toBeUndefined();
    expect(db.prepare('SELECT count(*) AS n FROM players').get()).toEqual({ n: 0 });

    guess('1A', 'COT');
    records.recordHint(ALICE, puzzle, '1D', { kind: 'crossword', clue: 'Fish' });
    expect(records.currentGame(ALICE, puzzle)).toMatchObject({
      puzzleId: 'ring',
      guesses: { '1A': [expect.any(Array)] },
      crosswordClues: { '1D': 'Fish' },
    });

    // After a restart, the current game is the new, empty attempt.
    records.recordRestart(ALICE, puzzle);
    expect(records.currentGame(ALICE, puzzle)).toMatchObject({ guesses: {}, crosswordClues: {} });

    SOLUTION.forEach(([id, word]) => guess(id, word, ALICE, puzzleOn('other')));
    expect(records.results(ALICE)).toEqual([
      expect.objectContaining({ puzzleId: 'other', won: true, guesses: 4, ranked: true }),
    ]);
  });

  it('forgets a player completely, leaving others alone', () => {
    const bob = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    records.recordHint(ALICE, puzzle, '1D', { kind: 'crossword', clue: 'Fish' });
    guess('1A', 'COT');
    records.recordRestart(ALICE, puzzle);
    SOLUTION.forEach(([id, word]) => guess(id, word));
    SOLUTION.forEach(([id, word]) => guess(id, word, bob));
    db.prepare(
      "INSERT INTO submissions (kind, player_id, ip, at) VALUES ('nickname', ?, '192.0.2.1', 'now')",
    ).run(ALICE);

    records.forget(ALICE);

    // Every table with the player's own data, found the same way forget finds them.
    const tables = playerTables(db);
    expect(tables).toEqual(expect.arrayContaining(['feedback', 'guesses', 'hints', 'plays']));
    for (const table of [...tables, 'players']) {
      const column = table === 'players' ? 'id' : 'player_id';
      expect(
        db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`).get(ALICE),
      ).toEqual({ n: 0 });
    }
    expect(records.result(bob, 'ring')).toMatchObject({ won: true });
    // The rate-limit log keeps its rows for their 30 days, so deleting can't reset the limits.
    expect(
      db.prepare('SELECT count(*) AS n FROM submissions WHERE player_id = ?').get(ALICE),
    ).toEqual({ n: 1 });
  });

  it("won't let a deleted player id come back", () => {
    guess('1A', 'COT');
    records.forget(ALICE);
    expect(records.isForgotten(ALICE)).toBe(true);
    expect(() => guess('1A', 'CAT')).toThrow(ForgottenPlayerError);
    expect(records.currentGame(ALICE, puzzle)).toBeUndefined();
    expect(JSON.stringify(db.prepare('SELECT * FROM forgotten_players').all())).not.toContain(
      ALICE,
    );
  });

  it('keeps players apart', () => {
    const bob = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    SOLUTION.forEach(([id, word]) => guess(id, word));
    guess('1A', 'COT', bob);
    expect(records.result(ALICE, 'ring')).toMatchObject({ ranked: true });
    expect(records.result(bob, 'ring')).toBeUndefined();
  });
});

describe('review flags', () => {
  // The flags on this puzzle's result (a player's earlier games may have their own).
  const flagged = () =>
    new Review(db)
      .flagged()
      .filter((r) => r.puzzleId === 'ring')
      .map((r) => [r.puzzleId, r.flags]);

  /** Solves a puzzle with one wrong guess first, taking `minutes` over it. */
  function solveSteadily(on: ClientPuzzle, minutes: number) {
    guess('1A', 'COT', ALICE, on);
    wait(minutes);
    SOLUTION.forEach(([id, word]) => guess(id, word, ALICE, on));
  }

  it('flags a strong first game, leaving it ranked', () => {
    SOLUTION.forEach(([id, word]) => guess(id, word));
    expect(records.result(ALICE, 'ring')).toMatchObject({ ranked: true });
    expect(flagged()).toEqual([['ring', ['first-game', 'flawless', 'fast']]]);
  });

  it('leaves an ordinary game alone', () => {
    solveSteadily(puzzleOn('earlier'), 10);
    solveSteadily(puzzle, 10);
    expect(flagged()).toEqual([]);
  });

  it("flags a game much faster than the player's usual", () => {
    ['one', 'two', 'three'].forEach((id) => solveSteadily(puzzleOn(id), 10));
    solveSteadily(puzzle, 2);
    expect(flagged()).toEqual([['ring', ['faster-than-usual']]]);
  });

  it("doesn't flag games that aren't on the leaderboard", () => {
    guess('1A', 'COT');
    records.recordRestart(ALICE, puzzle);
    SOLUTION.forEach(([id, word]) => guess(id, word));
    expect(records.result(ALICE, 'ring')).toMatchObject({ ranked: false });
    expect(flagged()).toEqual([]);
  });
});

describe('playerIdFrom', () => {
  const request = (id?: string) =>
    new Request('http://localhost/api/guess', {
      method: 'POST',
      headers: id === undefined ? {} : { 'x-player-id': id },
    });

  it('accepts a random UUID, lowercased', () => {
    expect(playerIdFrom(request(ALICE.toUpperCase()))).toBe(ALICE);
  });

  it('ignores a missing or malformed id', () => {
    expect(playerIdFrom(request())).toBeUndefined();
    expect(playerIdFrom(request('not-a-uuid'))).toBeUndefined();
    expect(playerIdFrom(request("x' OR 1=1 --"))).toBeUndefined();
  });
});
