import { computeStats, type PuzzleResult, type Stats } from '@crosswordle/engine';
import type { Collection } from './collections';
import { collectionOf } from './collections';

/** A finished puzzle, for the list of past days. */
export interface PastResult extends PuzzleResult {
  readonly puzzleId: string;
  /** The day it was for (`YYYY-MM-DD`), or `undefined` for an undated puzzle such as the sample. */
  readonly date: string | undefined;
}

/**
 * The stats for one collection's puzzles (daily or Naughty), so neither's streak is broken by
 * playing the other. Keyed by date for computeStats, whose streaks count dated ids.
 */
export function statsFor(
  results: Readonly<Record<string, PuzzleResult>>,
  collection: Collection,
  today: string,
): Stats {
  return computeStats(
    Object.fromEntries(
      Object.entries(results)
        .filter(([id]) => collectionOf(id) === collection)
        .map(([id, result]) => [collection.dateOf(id) ?? id, result]),
    ),
    today,
  );
}

/** One collection's finished puzzles, newest first; undated ones last. */
export function historyFor(
  results: Readonly<Record<string, PuzzleResult>>,
  collection: Collection,
): PastResult[] {
  return Object.entries(results)
    .filter(([id]) => collectionOf(id) === collection)
    .map(([puzzleId, result]) => ({ ...result, puzzleId, date: collection.dateOf(puzzleId) }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}
