import { fitsPuzzle, type ClientPuzzle, type GameState } from '@crosswordle/engine';

const key = (puzzleId: string) => `crosswordle:game:${puzzleId}`;

/**
 * The saved game for this puzzle, or `undefined` if there is none, storage is unavailable, or the
 * saved guesses no longer fit the puzzle (it was changed, or saved by an older version).
 */
export function loadGame(puzzle: ClientPuzzle): GameState | undefined {
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
    Object.values(guesses).every((list) => Array.isArray(list) && list.every(isScoredGuess))
  );
}

/** A saved guess is a row of tiles, each with a letter and a mark. */
function isScoredGuess(guess: unknown): boolean {
  return (
    Array.isArray(guess) &&
    guess.every((tile) => {
      if (typeof tile !== 'object' || tile === null) return false;
      const { letter, mark } = tile as Record<string, unknown>;
      return typeof letter === 'string' && typeof mark === 'string';
    })
  );
}
