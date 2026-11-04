import { gameSummary, type ClientPuzzle, type GameState } from '@crosswordle/engine';

/**
 * Whether to carry on from the server's copy of a game rather than this browser's. The server
 * records every guess and hint from every device with this player id, so its copy is the
 * fuller one when the player has played elsewhere (or restored their record here). This
 * browser's copy can be ahead only when the server missed something, such as a game played
 * before it kept records; then the browser's stands.
 */
export function preferServerGame(
  puzzle: ClientPuzzle,
  local: GameState,
  server: GameState,
): boolean {
  return progress(puzzle, server) > progress(puzzle, local);
}

function progress(puzzle: ClientPuzzle, state: GameState): number {
  const { guesses, crosswordHints, wordleHints } = gameSummary(puzzle, state);
  return guesses + crosswordHints + wordleHints;
}
