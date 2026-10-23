/**
 * The guess being typed into an entry, kept as the letters typed in order. Locked cells are
 * filled in from the start, and players can type the whole word (retyping a locked letter steps
 * over it) or only the gaps (a letter that doesn't match a lock goes in the next open cell).
 */
export interface Draft {
  readonly keys: readonly string[];
}

/** What the draft shows: a letter (or `undefined`) per cell, and where the next letter goes. */
export interface DraftCells {
  readonly letters: readonly (string | undefined)[];
  /** Equal to the length when every cell is filled. */
  readonly cursor: number;
}

/** `pattern` is the entry's locked letters, `undefined` where a cell is open. */
export type Pattern = readonly (string | undefined)[];

export function emptyDraft(): Draft {
  return { keys: [] };
}

/** Lays the typed letters into the cells, around the locked ones. */
export function draftCells(draft: Draft, pattern: Pattern): DraftCells {
  const letters = [...pattern];
  let cursor = 0;
  for (const key of draft.keys) {
    if (cursor >= pattern.length) break;
    if (pattern[cursor] !== undefined) {
      if (pattern[cursor] === key) {
        cursor++;
        continue;
      }
      while (cursor < pattern.length && pattern[cursor] !== undefined) cursor++;
      if (cursor >= pattern.length) break;
    }
    letters[cursor] = key;
    cursor++;
  }
  return { letters, cursor };
}

/** Adds a letter, unless every cell is already filled. */
export function typeLetter(draft: Draft, pattern: Pattern, letter: string): Draft {
  return draftCells(draft, pattern).cursor >= pattern.length
    ? draft
    : { keys: [...draft.keys, letter] };
}

export function deleteLetter(draft: Draft): Draft {
  return { keys: draft.keys.slice(0, -1) };
}

/**
 * The word to submit, or `undefined` while it's unfinished. If the cells aren't all filled but
 * exactly one letter per gap was typed, the letters fill the gaps: typing LAMA for L???? means
 * LLAMA, though the first L looked like a retyped lock.
 */
export function draftWord(draft: Draft, pattern: Pattern): string | undefined {
  const { letters } = draftCells(draft, pattern);
  if (letters.every((letter) => letter !== undefined)) return letters.join('');

  const gaps = pattern.filter((letter) => letter === undefined).length;
  if (draft.keys.length !== gaps) return undefined;
  let next = 0;
  return pattern.map((letter) => letter ?? draft.keys[next++]).join('');
}
