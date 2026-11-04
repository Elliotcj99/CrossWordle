import { chooseHintLetter, type HintLetter } from '@crosswordle/engine';
import { json, readEntryRequest } from './_shared';

/**
 * Reveals one letter of an entry as a Wordle-clue hint. The choice depends on the answer and on
 * what the player has already found, so it has to happen on the server (the page has no answers).
 * The player sends the guesses they've made for the entry, and the letters the grid already shows
 * in it (`known`: `{ index, letter }`, from solved crossings), so the hint never repeats a letter
 * they can see. A known letter only counts if it's right (see `chooseHintLetter`).
 * The server returns `{ index, letter }` for the letter to reveal, or 409 when there's nothing new
 * to show.
 */

export const onRequestPost = async (context: { request: Request }): Promise<Response> => {
  const found = await readEntryRequest(context.request);
  if (found instanceof Response) return found;
  const { body, entry } = found;

  const guesses = Array.isArray(body.guesses)
    ? body.guesses.filter((g): g is string => typeof g === 'string').map((g) => g.toUpperCase())
    : [];

  const known = Array.isArray(body.known) ? body.known.filter(isHintLetter) : [];

  const hint = chooseHintLetter(entry.answer, guesses, known);
  if (hint === undefined) return json({ error: 'nothing-to-reveal' }, 409);
  return json(hint);
};

function isHintLetter(value: unknown): value is HintLetter {
  if (typeof value !== 'object' || value === null) return false;
  const { index, letter } = value as Record<string, unknown>;
  return Number.isInteger(index) && typeof letter === 'string' && /^[A-Z]$/.test(letter);
}
