import { loadPuzzle, parsePuzzleFile, type Puzzle } from '@crosswordle/engine';
import puzzleData from '../_puzzles.json';

/**
 * The full puzzles (with answers), loaded from the bundle that is compiled into the Function and
 * never served. Shared by the scoring and hint endpoints.
 */
const puzzles = new Map<string, Puzzle>();

export function puzzleFor(id: string): Puzzle | undefined {
  const cached = puzzles.get(id);
  if (cached !== undefined) return cached;
  const file = (puzzleData as Record<string, unknown>)[id];
  if (file === undefined) return undefined;
  const puzzle = loadPuzzle(parsePuzzleFile(file));
  puzzles.set(id, puzzle);
  return puzzle;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
