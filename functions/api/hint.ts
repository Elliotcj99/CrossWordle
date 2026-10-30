import { chooseHintLetter } from '@crosswordle/engine';
import { json, puzzleFor } from './_shared';

/**
 * Reveals one letter of an entry as a Wordle-clue hint. The choice depends on the answer and on
 * what the player has already found, so it has to happen on the server (the page has no answers).
 * The player sends the guesses they've made for the entry; the server returns `{ index, letter }`
 * for the letter to reveal, or 409 when there's nothing new to show.
 */

interface HintBody {
  readonly puzzleId?: unknown;
  readonly entryId?: unknown;
  readonly guesses?: unknown;
}

export const onRequestPost = async (context: { request: Request }): Promise<Response> => {
  let body: HintBody;
  try {
    body = (await context.request.json()) as HintBody;
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

  const guesses = Array.isArray(body.guesses)
    ? body.guesses.filter((g): g is string => typeof g === 'string').map((g) => g.toUpperCase())
    : [];

  const hint = chooseHintLetter(entry.answer, guesses);
  if (hint === undefined) return json({ error: 'nothing-to-reveal' }, 409);
  return json(hint);
};
