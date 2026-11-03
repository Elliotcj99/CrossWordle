import {
  loadClientPuzzle,
  loadPuzzle,
  parsePuzzleFile,
  toPublicFile,
  type ClientPuzzle,
  type Puzzle,
} from '@crosswordle/engine';
import puzzleData from '../_puzzles.json';
import naughtyData from '../_puzzles.naughty.json';

/**
 * The full puzzles (with answers), loaded from the bundles compiled into the Function and never
 * served. Shared by the scoring and hint endpoints. Both collections (the daily puzzles and
 * Naughty mode) live in one id space: ids are globally unique, so a merged lookup is enough.
 */
const puzzles = new Map<string, Puzzle>();
const files = {
  ...(puzzleData as Record<string, unknown>),
  ...(naughtyData as Record<string, unknown>),
};

export function puzzleFor(id: string): Puzzle | undefined {
  const cached = puzzles.get(id);
  if (cached !== undefined) return cached;
  // Own keys only: ids come from the request, and `__proto__` or `constructor` must not reach
  // Object.prototype.
  if (!Object.hasOwn(files, id)) return undefined;
  const file = files[id];
  const puzzle = loadPuzzle(parsePuzzleFile(file));
  puzzles.set(id, puzzle);
  return puzzle;
}

const clientPuzzles = new Map<string, ClientPuzzle>();

/**
 * The answer-free form of a puzzle: the model the browser plays. The Node server rebuilds each
 * player's game on it, so the engine works out the same result the player sees.
 */
export function clientPuzzleFor(id: string): ClientPuzzle | undefined {
  const cached = clientPuzzles.get(id);
  if (cached !== undefined) return cached;
  if (!Object.hasOwn(files, id)) return undefined;
  const puzzle = loadClientPuzzle(toPublicFile(parsePuzzleFile(files[id])));
  clientPuzzles.set(id, puzzle);
  return puzzle;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
