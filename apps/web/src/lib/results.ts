import type { PuzzleResult } from '@crosswordle/engine';

const KEY = 'crosswordle:results';
const CHANGED = 'crosswordle:results-changed';

/** Calls `changed` whenever this browser's results change. Returns a function that stops listening. */
export function onResultsChanged(changed: () => void): () => void {
  window.addEventListener(CHANGED, changed);
  return () => window.removeEventListener(CHANGED, changed);
}

function announceChange(): void {
  window.dispatchEvent(new Event(CHANGED));
}

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
  announceChange();
  return updated;
}

/**
 * Adds the server's record of this player's finished puzzles to this browser's, and saves the
 * result. It fills in puzzles this browser hasn't finished (played on another device, or before
 * a restore); where both have one, this browser's stands, as the first result always does
 * (`recordResult`). The browser's results are cleared when the player switches, so they're theirs.
 */
export function mergeResults(
  server: Readonly<Record<string, PuzzleResult>>,
): Record<string, PuzzleResult> {
  const merged = { ...server, ...loadResults() };
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Blocked storage: the merged stats last for this page.
  }
  announceChange();
  return merged;
}

// TEMPORARY, a one-off: remove by Friday 6 November 2026, with importHistory in api.ts.
const SENT_KEY = 'crosswordle:history-sent';

/** Whether this browser has sent its finished puzzles to the server as history. */
export function historySent(): boolean {
  try {
    return localStorage.getItem(SENT_KEY) !== null;
  } catch {
    return true; // Blocked storage: nothing to send, and no way to remember sending it.
  }
}

export function markHistorySent(): void {
  try {
    localStorage.setItem(SENT_KEY, new Date().toISOString());
  } catch {
    // Blocked storage: see historySent.
  }
}

/** Forgets this browser's results (the player's, when they switch or delete). */
export function clearResults(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Blocked storage: nothing was kept.
  }
  announceChange();
}
