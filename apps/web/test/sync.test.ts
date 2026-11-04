import { loadClientPuzzle, newGame, toPublicFile, type PuzzleFile } from '@crosswordle/engine';
import { describe, expect, it } from 'vitest';
import { preferServerGame } from '../src/lib/sync';

const file: PuzzleFile = {
  version: 1,
  id: 'ring',
  title: 'Ring',
  answerEncoding: 'plain',
  entries: [
    { row: 0, col: 0, direction: 'across', answer: 'CAT', clue: 'Pet that purrs' },
    { row: 0, col: 0, direction: 'down', answer: 'COD', clue: 'White fish' },
  ],
};
const puzzle = loadClientPuzzle(toPublicFile(file));
const cot = [
  { letter: 'C', mark: 'correct' },
  { letter: 'O', mark: 'absent' },
  { letter: 'T', mark: 'correct' },
] as const;
const empty = newGame(puzzle);
const oneGuess = { ...empty, guesses: { '1A': [cot] } };
const guessAndHint = { ...oneGuess, wordleClues: { '1D': { index: 0, letter: 'C' } } };

describe('preferServerGame', () => {
  it("carries on from the server's game when it's further on", () => {
    expect(preferServerGame(puzzle, empty, oneGuess)).toBe(true);
    expect(preferServerGame(puzzle, oneGuess, guessAndHint)).toBe(true);
  });

  it("keeps this browser's game when the server's isn't further on", () => {
    expect(preferServerGame(puzzle, oneGuess, oneGuess)).toBe(false);
    expect(preferServerGame(puzzle, oneGuess, empty)).toBe(false);
  });
});
