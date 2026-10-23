import { fitsPuzzle, type GameState, type Puzzle } from '@crosswordle/engine';

const key = (puzzleId: string) => `crosswordle:game:${puzzleId}`;

/**
 * The saved game for this puzzle, or `undefined` if there is none, storage is unavailable, or the
 * saved guesses no longer fit the puzzle (it was changed after they were made).
 */
export function loadGame(puzzle: Puzzle): GameState | undefined {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key(puzzle.id)) ?? 'null');
    return isGameState(saved) && fitsPuzzle(puzzle, saved) ? saved : undefined;
  } catch {
    return undefined;
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(key(state.puzzleId), JSON.stringify(state));
  } catch {
    // Private windows and blocked storage: the game still works, it just isn't remembered.
  }
}

function isGameState(value: unknown): value is GameState {
  if (typeof value !== 'object' || value === null) return false;
  const { puzzleId, guesses } = value as Record<string, unknown>;
  return (
    typeof puzzleId === 'string' &&
    typeof guesses === 'object' &&
    guesses !== null &&
    Object.values(guesses).every(
      (list) => Array.isArray(list) && list.every((guess) => typeof guess === 'string'),
    )
  );
}
