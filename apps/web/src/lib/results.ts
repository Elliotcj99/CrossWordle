import type { PuzzleResult } from '@crosswordle/engine';

const KEY = 'crosswordle:results';

/** Finished puzzles in this browser, keyed by puzzle id. Empty if storage is unavailable. */
export function loadResults(): Record<string, PuzzleResult> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (typeof saved !== 'object' || saved === null) return {};
    return Object.fromEntries(
      Object.entries(saved).filter(
        (pair): pair is [string, PuzzleResult] =>
          typeof pair[1] === 'object' &&
          pair[1] !== null &&
          typeof pair[1].won === 'boolean' &&
          typeof pair[1].guesses === 'number',
      ),
    );
  } catch {
    return {};
  }
}

/** Records how a puzzle ended. The first result for a puzzle stands; replays don't change it. */
export function recordResult(puzzleId: string, result: PuzzleResult): Record<string, PuzzleResult> {
  const results = loadResults();
  if (results[puzzleId] !== undefined) return results;
  const updated = { ...results, [puzzleId]: result };
  try {
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // Blocked storage: stats just aren't kept.
  }
  return updated;
}

/**
 * Adds the server's record of this player's finished puzzles to this browser's, and saves the
 * result. The server's wins where both have a puzzle: it's the player's first finish anywhere,
 * on any device that shares their player id.
 */
export function mergeResults(
  server: Readonly<Record<string, PuzzleResult>>,
): Record<string, PuzzleResult> {
  const merged = { ...loadResults(), ...server };
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Blocked storage: the merged stats last for this page.
  }
  return merged;
}
