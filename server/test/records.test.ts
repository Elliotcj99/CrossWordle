import {
  evaluateGuess,
  loadClientPuzzle,
  toPublicFile,
  type ClientPuzzle,
  type PuzzleFile,
} from '@crosswordle/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import { playerIdFrom, Records } from '../records';

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

let records: Records;
let clock: number;

beforeEach(() => {
  clock = Date.parse('2026-11-04T09:00:00Z');
  records = new Records(openDatabase(':memory:'), () => new Date((clock += 1000)));
});

function guess(entryId: string, word: string, player = ALICE) {
  records.recordGuess(
    player,
    puzzle,
    entryId,
    evaluateGuess(word, answers[entryId]!, {
      duplicateCounts: puzzle.rules.duplicateCounts,
    }),
  );
}

describe('Records', () => {
  it('ranks an unbroken first attempt that was won, with its guesses and hints', () => {
    guess('1A', 'COT');
    records.recordHint(ALICE, puzzle, '1D', 'crossword');
    records.recordHint(ALICE, puzzle, '3A', 'wordle', { index: 0, letter: 'D' });
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
    records.recordHint(ALICE, puzzle, '1A', 'crossword');
    records.recordHint(ALICE, puzzle, '1A', 'crossword');
    records.recordHint(ALICE, puzzle, '1A', 'wordle', { index: 1, letter: 'A' });
    records.recordHint(ALICE, puzzle, '1A', 'wordle', { index: 2, letter: 'T' });
    SOLUTION.forEach(([id, word]) => guess(id, word));
    expect(records.result(ALICE, 'ring')).toMatchObject({ crosswordHints: 1, wordleHints: 1 });
  });

  it('keeps players apart', () => {
    const bob = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    SOLUTION.forEach(([id, word]) => guess(id, word));
    guess('1A', 'COT', bob);
    expect(records.result(ALICE, 'ring')).toMatchObject({ ranked: true });
    expect(records.result(bob, 'ring')).toBeUndefined();
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
