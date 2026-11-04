import { loadClientPuzzle, newGame, toPublicFile, type PuzzleFile } from '@crosswordle/engine';
import { describe, expect, it } from 'vitest';
import { readSavedGame } from '../src/lib/storage';

const file: PuzzleFile = {
  version: 1,
  id: 'ring',
  title: 'Ring',
  answerEncoding: 'plain',
  entries: [
    { row: 0, col: 0, direction: 'across', answer: 'CAT', clue: 'Pet that purrs', clue2: 'Feline' },
    { row: 0, col: 0, direction: 'down', answer: 'COD', clue: 'White fish' },
    { row: 0, col: 2, direction: 'down', answer: 'TOE', clue: 'Foot digit' },
    { row: 2, col: 0, direction: 'across', answer: 'DUE', clue: 'Owed' },
  ],
};
const puzzle = loadClientPuzzle(toPublicFile(file));
const guesses = {
  '1A': [
    [
      { letter: 'C', mark: 'correct' },
      { letter: 'O', mark: 'absent' },
      { letter: 'T', mark: 'correct' },
    ],
  ],
};

describe('readSavedGame', () => {
  it('reads a saved game with its revealed clues', () => {
    const game = { ...newGame(puzzle), guesses, crosswordClues: { '1A': 'Feline' } };
    expect(readSavedGame(game, puzzle)).toEqual({ game, cluesToFetch: [] });
  });

  it('asks for the clues an older version showed from the puzzle file', () => {
    const saved = { ...newGame(puzzle), guesses, crosswordClues: ['1A', '9A'] };
    expect(readSavedGame(saved, puzzle)).toEqual({
      game: { ...newGame(puzzle), guesses, crosswordClues: {} },
      cluesToFetch: ['1A'],
    });
  });

  it('rejects anything else', () => {
    expect(readSavedGame(null, puzzle)).toBeUndefined();
    expect(
      readSavedGame({ ...newGame(puzzle), crosswordClues: { '1A': 3 } }, puzzle),
    ).toBeUndefined();
    expect(readSavedGame({ ...newGame(puzzle), puzzleId: 'other' }, puzzle)).toBeUndefined();
  });
});
