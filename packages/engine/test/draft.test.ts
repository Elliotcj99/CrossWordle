import { describe, expect, it } from 'vitest';
import { deleteLetter, draftCells, draftWord, emptyDraft, typeLetter, type Draft } from '../src';

function type(letters: string, draft: Draft = emptyDraft()): Draft {
  return [...letters].reduce((d, letter) => typeLetter(d, 5, letter), draft);
}

describe('draft typing', () => {
  it('starts empty', () => {
    expect(draftCells(emptyDraft(), 5)).toEqual({ letters: Array(5).fill(undefined), cursor: 0 });
  });

  it('fills the cells in order', () => {
    expect(draftCells(type('LEV'), 5)).toEqual({
      letters: ['L', 'E', 'V', undefined, undefined],
      cursor: 3,
    });
  });

  it('ignores letters once every cell is filled', () => {
    expect(draftWord(type('LEVELS'), 5)).toBe('LEVEL');
    expect(draftCells(type('LEVELS'), 5).cursor).toBe(5);
  });

  it('is unfinished until every cell has a letter', () => {
    expect(draftWord(type('LEV'), 5)).toBeUndefined();
  });
});

describe('draft deleting', () => {
  it('removes the last letter typed', () => {
    expect(draftCells(deleteLetter(type('LEV')), 5).letters).toEqual([
      'L',
      'E',
      undefined,
      undefined,
      undefined,
    ]);
    expect(deleteLetter(emptyDraft())).toEqual(emptyDraft());
  });

  it('lets the player retype after deleting', () => {
    expect(draftWord(type('L', deleteLetter(type('LEVEX'))), 5)).toBe('LEVEL');
  });
});
