import {
  loadClientPuzzle,
  loadPuzzle,
  parsePuzzleFile,
  toPublicFile,
  type ClientPuzzle,
  type Entry,
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

/** Every puzzle id the server can score, daily and Naughty. */
export function puzzleIds(): string[] {
  return Object.keys(files);
}

/** A request about one entry of a puzzle, once its puzzle and entry are found. */
export interface EntryRequest {
  readonly body: Readonly<Record<string, unknown>>;
  readonly puzzle: Puzzle;
  readonly entry: Entry;
}

/**
 * Reads a `{ puzzleId, entryId, ... }` request body and finds the puzzle and entry, or returns the
 * error response: 400 `bad-request`, 404 `unknown-puzzle` or `unknown-entry`. Shared by the
 * guess, hint and clue endpoints, so they check requests the same way.
 */
export async function readEntryRequest(request: Request): Promise<EntryRequest | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json({ error: 'bad-request' }, 400);
  }
  const fields = body as Record<string, unknown>;
  if (typeof fields.puzzleId !== 'string' || typeof fields.entryId !== 'string') {
    return json({ error: 'bad-request' }, 400);
  }
  const puzzle = puzzleFor(fields.puzzleId);
  if (puzzle === undefined) return json({ error: 'unknown-puzzle' }, 404);
  const entry = puzzle.entries.find((e) => e.id === fields.entryId);
  if (entry === undefined) return json({ error: 'unknown-entry' }, 404);
  return { body: fields, puzzle, entry };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
