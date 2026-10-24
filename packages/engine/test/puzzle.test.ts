import { describe, expect, it } from 'vitest';
import sample from '../../../puzzles/sample.json';
import {
  gridCells,
  loadPuzzle,
  parsePuzzleFile,
  publishPuzzle,
  PuzzleError,
  type EntryFile,
  type PuzzleFile,
} from '../src';

const sampleFile = parsePuzzleFile(sample);

function withEntries(entries: EntryFile[]): PuzzleFile {
  return { version: 1, id: 'test', title: 'Test', answerEncoding: 'plain', entries };
}

function problemsOf(file: PuzzleFile): readonly string[] {
  try {
    loadPuzzle(file);
    return [];
  } catch (error) {
    if (error instanceof PuzzleError) return error.problems;
    throw error;
  }
}

describe('loadPuzzle', () => {
  it('numbers entries crossword-style', () => {
    const puzzle = loadPuzzle(sampleFile);
    expect(puzzle.entries.map((e) => `${e.id} ${e.answer}`)).toEqual([
      '1A LEVEL',
      '1D LATTE',
      '2D VALET',
      '3D LLAMA',
      '4A ABYSS',
      '5D SETTLED',
      '6A EXTRA',
      '7A HELLO',
      '8D ODD',
    ]);
    expect([puzzle.width, puzzle.height]).toEqual([11, 9]);
  });

  it('lists each grid cell once, numbered where an entry starts', () => {
    const cells = gridCells(loadPuzzle(sampleFile));
    // 45 letters across all entries, 10 of them shared by two entries.
    expect(cells).toHaveLength(35);
    expect(cells.find((c) => c.key === '0,0')?.number).toBe(1);
    expect(cells.find((c) => c.key === '2,4')?.number).toBe(4);
    expect(cells.find((c) => c.key === '0,1')?.number).toBeUndefined();
  });

  it('reads back a published puzzle with the same answers', () => {
    const published = publishPuzzle(sampleFile);
    expect(published.answerEncoding).toBe('xor-base64');
    expect(JSON.stringify(published)).not.toContain('SETTLED');
    expect(loadPuzzle(published).entries).toEqual(loadPuzzle(sampleFile).entries);
  });
});

describe('puzzle validation', () => {
  const cat: EntryFile = { row: 0, col: 0, direction: 'across', answer: 'CAT', clue: 'Pet' };

  it('rejects letters that disagree where entries cross', () => {
    const problems = problemsOf(
      withEntries([cat, { row: 0, col: 0, direction: 'down', answer: 'DOG', clue: 'Pet' }]),
    );
    expect(problems.some((p) => p.includes('where a crossing entry has'))).toBe(true);
  });

  it('rejects entries that touch side-on and form stray words', () => {
    const problems = problemsOf(
      withEntries([cat, { row: 1, col: 0, direction: 'across', answer: 'OWL', clue: 'Bird' }]),
    );
    expect(problems.some((p) => p.includes('are not exactly one entry'))).toBe(true);
  });

  it('rejects entries that do not connect', () => {
    const problems = problemsOf(
      withEntries([cat, { row: 5, col: 5, direction: 'across', answer: 'OWL', clue: 'Bird' }]),
    );
    expect(problems).toContain('Every entry must connect to the others through crossings.');
  });

  it('rejects two entries with the same clue', () => {
    const problems = problemsOf(
      withEntries([cat, { row: 0, col: 0, direction: 'down', answer: 'CUB', clue: 'pet' }]),
    );
    expect(problems.some((p) => p.includes('A clue is used twice'))).toBe(true);
  });

  it('rejects entries outside the allowed lengths', () => {
    const problems = problemsOf(
      withEntries([{ row: 0, col: 0, direction: 'across', answer: 'OX', clue: 'Bovine' }]),
    );
    expect(problems.some((p) => p.includes('entries must be 3 to 10'))).toBe(true);
  });

  it('rejects malformed JSON shapes', () => {
    expect(() => parsePuzzleFile({ version: 2, entries: [] })).toThrow(PuzzleError);
    expect(() =>
      parsePuzzleFile({ ...sampleFile, rules: { guessBudget: { kind: 'unlimited' } } }),
    ).toThrow(PuzzleError);
  });
});
