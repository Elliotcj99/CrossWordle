import { evaluateGuess, loadPuzzle, parsePuzzleFile, type Puzzle } from '@crosswordle/engine';
import puzzleData from '../_puzzles.json';

/**
 * Scores one guess against a hidden answer. The answers live only in `_puzzles.json`, which is
 * bundled into this Function and never served, so the page can't read them. The endpoint only ever
 * tells the player how their own guess scored; it is deliberately stateless, so the browser still
 * owns the budget, the win/lose state and the "real word" check.
 */

interface GuessBody {
  readonly puzzleId?: unknown;
  readonly entryId?: unknown;
  readonly guess?: unknown;
}

const puzzles = new Map<string, Puzzle>();

function puzzleFor(id: string): Puzzle | undefined {
  const cached = puzzles.get(id);
  if (cached !== undefined) return cached;
  const file = (puzzleData as Record<string, unknown>)[id];
  if (file === undefined) return undefined;
  const puzzle = loadPuzzle(parsePuzzleFile(file));
  puzzles.set(id, puzzle);
  return puzzle;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const onRequestPost = async (context: { request: Request }): Promise<Response> => {
  let body: GuessBody;
  try {
    body = (await context.request.json()) as GuessBody;
  } catch {
    return json({ error: 'bad-request' }, 400);
  }

  if (typeof body.puzzleId !== 'string' || typeof body.entryId !== 'string') {
    return json({ error: 'bad-request' }, 400);
  }

  const puzzle = puzzleFor(body.puzzleId);
  if (puzzle === undefined) return json({ error: 'unknown-puzzle' }, 404);

  const entry = puzzle.entries.find((e) => e.id === body.entryId);
  if (entry === undefined) return json({ error: 'unknown-entry' }, 404);

  const guess = typeof body.guess === 'string' ? body.guess.toUpperCase() : '';
  if (guess.length !== entry.answer.length || !/^[A-Z]+$/.test(guess)) {
    return json({ error: 'wrong-length' }, 400);
  }

  const letters = evaluateGuess(guess, entry.answer, {
    duplicateCounts: puzzle.rules.duplicateCounts,
  });
  return json({ letters, solved: guess === entry.answer });
};
