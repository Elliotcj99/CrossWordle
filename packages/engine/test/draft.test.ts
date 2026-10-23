import { describe, expect, it } from 'vitest';
import {
  deleteLetter,
  draftCells,
  draftWord,
  emptyDraft,
  typeLetter,
  type Draft,
  type Pattern,
} from '../src';

// LEVEL with its second letter (E) locked.
const level: Pattern = [undefined, 'E', undefined, undefined, undefined];
// LLAMA with its first letter (L) locked.
const llama: Pattern = ['L', undefined, undefined, undefined, undefined];

function type(pattern: Pattern, letters: string, draft: Draft = emptyDraft()): Draft {
  return [...letters].reduce((d, letter) => typeLetter(d, pattern, letter), draft);
}

describe('draft typing', () => {
  it('starts with the locked letters in place', () => {
    expect(draftCells(emptyDraft(), level)).toEqual({ letters: level, cursor: 0 });
  });

  it('accepts the whole word, stepping over a retyped locked letter', () => {
    expect(draftWord(type(level, 'LEVEL'), level)).toBe('LEVEL');
    expect(draftWord(type(llama, 'LLAMA'), llama)).toBe('LLAMA');
  });

  it('accepts only the open letters, jumping over the locked cell', () => {
    expect(draftWord(type(level, 'LVEL'), level)).toBe('LEVEL');
  });

  it('fills the gaps when a gap letter matches the lock in front of it', () => {
    const draft = type(llama, 'LAMA');
    // While typing, the first L looks like a retyped lock...
    expect(draftCells(draft, llama).letters).toEqual(['L', 'A', 'M', 'A', undefined]);
    // ...but four letters for four gaps can only mean the gaps.
    expect(draftWord(draft, llama)).toBe('LLAMA');
  });

  it('ignores letters once every cell is filled', () => {
    const draft = type(level, 'LEVELS');
    expect(draft.keys).toHaveLength(5);
    expect(draftWord(draft, level)).toBe('LEVEL');
  });

  it('is unfinished until every cell has a letter', () => {
    expect(draftWord(type(level, 'LEV'), level)).toBeUndefined();
  });
});

describe('draft deleting', () => {
  it('removes the last letter typed, never a locked one', () => {
    let draft = type(level, 'LEV');
    draft = deleteLetter(draft);
    expect(draftCells(draft, level)).toEqual({
      letters: ['L', 'E', undefined, undefined, undefined],
      cursor: 2,
    });
    draft = deleteLetter(deleteLetter(draft));
    expect(draftCells(draft, level)).toEqual({ letters: level, cursor: 0 });
    expect(deleteLetter(draft)).toEqual(emptyDraft());
  });

  it('lets the player retype after deleting', () => {
    const draft = deleteLetter(type(level, 'LEVEX'));
    expect(draftWord(typeLetter(draft, level, 'L'), level)).toBe('LEVEL');
  });
});
