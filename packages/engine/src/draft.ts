/**
 * The guess being typed into an entry, kept as the letters typed in order. Like Wordle, every
 * cell is the player's to fill: locked letters on the grid are not forced, so a guess can fish
 * for other letters.
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

export function emptyDraft(): Draft {
  return { keys: [] };
}

/** Lays the typed letters into an entry of `length` cells. */
export function draftCells(draft: Draft, length: number): DraftCells {
  return {
    letters: Array.from({ length }, (_, i) => draft.keys[i]),
    cursor: Math.min(draft.keys.length, length),
  };
}

/** Adds a letter, unless every cell is already filled. */
export function typeLetter(draft: Draft, length: number, letter: string): Draft {
  return draft.keys.length >= length ? draft : { keys: [...draft.keys, letter] };
}

export function deleteLetter(draft: Draft): Draft {
  return { keys: draft.keys.slice(0, -1) };
}

/** The word to submit, or `undefined` while it's unfinished. */
export function draftWord(draft: Draft, length: number): string | undefined {
  return draft.keys.length === length ? draft.keys.join('') : undefined;
}
