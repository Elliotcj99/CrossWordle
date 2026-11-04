import { json, puzzleFor } from './_shared';

/**
 * Reveals an entry's second clue (the "Crossword clue" hint). The published puzzle only says
 * whether an entry has one, so the page asks here, and a server that keeps records knows the
 * player has seen it. Returns `{ clue }`, 404 for an unknown puzzle or entry, or 409 when the
 * entry has no second clue.
 */

interface ClueBody {
  readonly puzzleId?: unknown;
  readonly entryId?: unknown;
}

export const onRequestPost = async (context: { request: Request }): Promise<Response> => {
  let body: ClueBody;
  try {
    body = (await context.request.json()) as ClueBody;
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
  if (entry.clue2 === undefined) return json({ error: 'no-second-clue' }, 409);

  return json({ clue: entry.clue2 });
};
