/**
 * A playable collection of puzzles. The ordinary daily puzzles and the optional "Naughty mode"
 * are each a collection with their own published index, puzzle files and guess dictionary. Their
 * ids share one space (naughty ids are prefixed), so the scoring Function tells them apart by id.
 */
export interface Collection {
  readonly mode: 'normal' | 'naughty';
  /** The published index of this collection's puzzles. */
  readonly indexPath: string;
  /** The published answer-free file for a puzzle id. */
  readonly puzzlePath: (id: string) => string;
  /** The folder of guess-dictionary files (`<length>.txt`) for this collection. */
  readonly wordsPath: string;
  /** The `YYYY-MM-DD` an id plays on, so future puzzles stay hidden; `undefined` if undated. */
  readonly dateOf: (id: string) => string | undefined;
}

const trailingDate = (id: string): string | undefined =>
  /(\d{4}-\d{2}-\d{2})$/.exec(id)?.[1] ?? undefined;

export const NORMAL: Collection = {
  mode: 'normal',
  indexPath: 'puzzles/index.json',
  puzzlePath: (id) => `puzzles/${id}.json`,
  wordsPath: 'words',
  dateOf: trailingDate,
};

export const NAUGHTY: Collection = {
  mode: 'naughty',
  indexPath: 'naughty/index.json',
  puzzlePath: (id) => `naughty/${id}.json`,
  wordsPath: 'words-naughty',
  dateOf: trailingDate,
};
