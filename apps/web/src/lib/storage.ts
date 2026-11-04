import { fitsPuzzle, type ClientPuzzle, type GameState } from '@crosswordle/engine';

const key = (puzzleId: string) => `crosswordle:game:${puzzleId}`;

/** A saved game, and the entries whose Crossword clue it needs to fetch again (see below). */
export interface SavedGame {
  readonly game: GameState;
  readonly cluesToFetch: readonly string[];
}

/**
 * The saved game for this puzzle, or `undefined` if there is none, storage is unavailable, or the
 * saved guesses no longer fit the puzzle (it was changed, or saved by an older version).
 */
export function loadGame(puzzle: ClientPuzzle): SavedGame | undefined {
  try {
    return readSavedGame(JSON.parse(localStorage.getItem(key(puzzle.id)) ?? 'null'), puzzle);
  } catch {
    return undefined;
  }
}

/**
 * Checks a saved game read from storage. Games saved before the server sent the Crossword clue
 * list the entries whose clue was shown, without the clue (the page had them all then); those
 * entries come back in `cluesToFetch`, for the page to ask the server for their clues again.
 */
export function readSavedGame(saved: unknown, puzzle: ClientPuzzle): SavedGame | undefined {
  if (!isGameState(saved)) return undefined;
  const { crosswordClues } = saved as { crosswordClues?: unknown };
  let game: GameState = saved;
  let cluesToFetch: string[] = [];
  if (Array.isArray(crosswordClues)) {
    game = { ...saved, crosswordClues: {} };
    cluesToFetch = crosswordClues.filter(
      (id): id is string => typeof id === 'string' && puzzle.entries.some((e) => e.id === id),
    );
  } else if (crosswordClues !== undefined && !isTextRecord(crosswordClues)) {
    return undefined;
  }
  return fitsPuzzle(puzzle, game) ? { game, cluesToFetch } : undefined;
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

function isTextRecord(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
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
