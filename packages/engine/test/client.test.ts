import { describe, expect, it } from 'vitest';
import {
  loadClientPuzzle,
  loadPuzzle,
  parsePublicPuzzleFile,
  PuzzleError,
  toPublicFile,
  withSecondClues,
  type PuzzleFile,
} from '../src';

/**
 *   C A T
 *   O . O
 *   D U E
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

describe('toPublicFile', () => {
  it('replaces each answer with its length and drops the encoding', () => {
    const pub = toPublicFile(file);
    expect(pub.entries[0]).toEqual({
      row: 0,
      col: 0,
      direction: 'across',
      length: 3,
      clue: 'Pet that purrs',
    });
    expect(pub).not.toHaveProperty('answerEncoding');
    expect(JSON.stringify(pub)).not.toContain('CAT');
  });

  it('keeps rule overrides', () => {
    const pub = toPublicFile({ ...file, rules: { realWordsOnly: false } });
    expect(pub.rules).toEqual({ realWordsOnly: false });
  });

  it('works from an encoded file too, using the decoded length', () => {
    const encoded: PuzzleFile = {
      version: 1,
      id: 'ab',
      title: 'Two',
      answerEncoding: 'plain',
      entries: [
        { row: 0, col: 0, direction: 'across', answer: 'ABASE', clue: 'Humble' },
        { row: 0, col: 0, direction: 'down', answer: 'ANT', clue: 'Picnic pest' },
      ],
    };
    expect(toPublicFile(encoded).entries[0]!.length).toBe(5);
  });

  it('says which entries have a second clue, but never what it is', () => {
    const clues = new Map([
      ['CAT', 'Feline'],
      ['COD', 'white FISH '], // the same as the entry's own clue, so not a second clue
    ]);
    const full = withSecondClues(
      {
        ...file,
        entries: file.entries.map((e, i) => (i === 1 ? { ...e, clue: 'White fish' } : e)),
      },
      (answer) => clues.get(answer),
    );
    expect(full.entries.map((e) => e.clue2)).toEqual(['Feline', undefined, undefined, undefined]);

    const pub = toPublicFile(full);
    expect(pub.entries.map((e) => e.hasClue2)).toEqual([true, undefined, undefined, undefined]);
    expect(JSON.stringify(pub)).not.toContain('Feline');
    expect(loadClientPuzzle(pub).entries.find((e) => e.id === '1A')!.hasClue2).toBe(true);
  });

  it("keeps a source's own second clue where the list has none, and every other field", () => {
    const withOwn: PuzzleFile = {
      ...file,
      entries: file.entries.map((e, i) => (i === 0 ? { ...e, clue2: 'Moggy' } : e)),
    };
    const full = withSecondClues(withOwn, (answer) => (answer === 'COD' ? 'Fish' : undefined));
    expect(full.entries.map((e) => e.clue2)).toEqual(['Moggy', 'Fish', undefined, undefined]);
    // A listed clue that's just the main clue again doesn't push out the source's own.
    const same = withSecondClues(withOwn, (answer) =>
      answer === 'CAT' ? 'pet that purrs' : undefined,
    );
    expect(same.entries[0]!.clue2).toBe('Moggy');
    expect(full.entries[0]).toMatchObject({ row: 0, col: 0, direction: 'across', answer: 'CAT' });
  });

  it("keeps the second clue in the server's copy of the puzzle", () => {
    const full = withSecondClues(file, (answer) => (answer === 'TOE' ? 'Digit' : undefined));
    expect(loadPuzzle(full).entries.find((e) => e.answer === 'TOE')!.clue2).toBe('Digit');
  });

  it('rejects an invalid puzzle', () => {
    const bad: PuzzleFile = {
      ...file,
      entries: [{ row: 0, col: 0, direction: 'across', answer: 'CA7', clue: 'Bad' }],
    };
    expect(() => toPublicFile(bad)).toThrow(PuzzleError);
  });
});

describe('loadClientPuzzle', () => {
  it('numbers entries exactly like the full loader, without answers', () => {
    const client = loadClientPuzzle(toPublicFile(file));
    const full = loadPuzzle(file);

    expect(client.entries.map((e) => e.id)).toEqual(full.entries.map((e) => e.id));
    expect(client.entries.map((e) => e.cells)).toEqual(full.entries.map((e) => e.cells));
    expect({ width: client.width, height: client.height }).toEqual({ width: 3, height: 3 });
    expect(client.entries.find((e) => e.id === '1A')).toMatchObject({
      length: 3,
      clue: 'Pet that purrs',
    });
    expect(JSON.stringify(client)).not.toContain('CAT');
  });

  it('resolves rules with the defaults', () => {
    const client = loadClientPuzzle(toPublicFile(file));
    expect(client.rules.realWordsOnly).toBe(true);
  });
});

describe('parsePublicPuzzleFile', () => {
  it('accepts a well-formed public file', () => {
    expect(() => parsePublicPuzzleFile(toPublicFile(file))).not.toThrow();
  });

  it('reports every shape problem at once', () => {
    let problems: readonly string[] = [];
    try {
      parsePublicPuzzleFile({
        version: 2,
        id: 'Ring',
        title: '',
        entries: [{ row: -1, col: 0, direction: 'sideways', length: 0, clue: '' }],
      });
    } catch (error) {
      if (error instanceof PuzzleError) problems = error.problems;
    }
    expect(problems.length).toBeGreaterThan(3);
  });
});
