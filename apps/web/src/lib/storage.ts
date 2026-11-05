import { fitsPuzzle, type ClientPuzzle, type GameState } from '@crosswordle/engine';

const PREFIX = 'crosswordle:game:';
const key = (puzzleId: string) => `${PREFIX}${puzzleId}`;
/** Crossword clues an older save showed, still to fetch again (kept until each one is). */
const cluesKey = (puzzleId: string) => `${PREFIX}${puzzleId}:clues-to-fetch`;
/** A restart the server hasn't heard about yet. */
const restartKey = (puzzleId: string) => `${PREFIX}${puzzleId}:restart-pending`;

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
    const saved = readSavedGame(JSON.parse(localStorage.getItem(key(puzzle.id)) ?? 'null'), puzzle);
    if (saved === undefined) return undefined;
    // An older save's clues are remembered until they're fetched, so a failed fetch (offline)
    // doesn't lose them once the game is saved in the new form.
    const waiting = readIds(localStorage.getItem(cluesKey(puzzle.id)));
    const cluesToFetch = [...new Set([...waiting, ...saved.cluesToFetch])].filter(
      (id) => !Object.hasOwn(saved.game.crosswordClues ?? {}, id),
    );
    if (cluesToFetch.length > 0)
      localStorage.setItem(cluesKey(puzzle.id), JSON.stringify(cluesToFetch));
    else localStorage.removeItem(cluesKey(puzzle.id));
    return { ...saved, cluesToFetch };
  } catch {
    return undefined;
  }
}

/** An older save's clue has been fetched again. */
export function clueFetched(puzzleId: string, entryId: string): void {
  try {
    const left = readIds(localStorage.getItem(cluesKey(puzzleId))).filter((id) => id !== entryId);
    if (left.length > 0) localStorage.setItem(cluesKey(puzzleId), JSON.stringify(left));
    else localStorage.removeItem(cluesKey(puzzleId));
  } catch {
    // Blocked storage: nothing was waiting.
  }
}

/**
 * Marks a restart the server hasn't confirmed yet. Each restart has its own `token`, so confirming
 * an earlier one can't clear the mark of a later one.
 */
export function markRestartPending(puzzleId: string, token: string): void {
  try {
    localStorage.setItem(restartKey(puzzleId), token);
  } catch {
    // Blocked storage: the restart is only in this page.
  }
}

/** Clears the mark, if it's still this restart's. */
export function clearRestartPending(puzzleId: string, token: string): void {
  try {
    if (localStorage.getItem(restartKey(puzzleId)) === token) {
      localStorage.removeItem(restartKey(puzzleId));
    }
  } catch {
    // Blocked storage: nothing was marked.
  }
}

/** The token of a restart the server hasn't confirmed, if there is one. */
export function pendingRestart(puzzleId: string): string | undefined {
  try {
    return localStorage.getItem(restartKey(puzzleId)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Drops an older save's clues still to fetch (they were the game before a restart). */
export function clearCluesToFetch(puzzleId: string): void {
  try {
    localStorage.removeItem(cluesKey(puzzleId));
  } catch {
    // Blocked storage: nothing was waiting.
  }
}

/** Forgets every saved game in this browser (the player's, when they switch or delete). */
export function clearSavedGames(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const k of keys) if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // Blocked storage: nothing was saved.
  }
}

function readIds(text: string | null): string[] {
  try {
    const value: unknown = JSON.parse(text ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
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

// The puzzle whose result the player hid, so it stays hidden when they come back to it. Only the
// latest: a new puzzle's result shows when it ends.
const RESULT_HIDDEN_KEY = 'crosswordle:result-hidden';

/** Whether the player hid this puzzle's result (the end-of-game panel). */
export function resultHidden(puzzleId: string): boolean {
  try {
    return localStorage.getItem(RESULT_HIDDEN_KEY) === puzzleId;
  } catch {
    return false;
  }
}

export function setResultHidden(puzzleId: string, hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(RESULT_HIDDEN_KEY, puzzleId);
    else localStorage.removeItem(RESULT_HIDDEN_KEY);
  } catch {
    // Blocked storage: it's hidden until the page closes.
  }
}
