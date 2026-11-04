import { evaluateGuess } from '@crosswordle/engine';
import { json, readEntryRequest } from './_shared';

/**
 * Scores one guess against a hidden answer. The answers live only in `_puzzles.json`, which is
 * bundled into this Function and never served, so the page can't read them. The endpoint only ever
 * tells the player how their own guess scored; it is deliberately stateless, so the browser still
 * owns the budget, the win/lose state and the "real word" check.
 */

export const onRequestPost = async (context: { request: Request }): Promise<Response> => {
  const found = await readEntryRequest(context.request);
  if (found instanceof Response) return found;
  const { body, puzzle, entry } = found;

  const guess = typeof body.guess === 'string' ? body.guess.toUpperCase() : '';
  if (guess.length !== entry.answer.length || !/^[A-Z]+$/.test(guess)) {
    return json({ error: 'wrong-length' }, 400);
  }

  const letters = evaluateGuess(guess, entry.answer, {
    duplicateCounts: puzzle.rules.duplicateCounts,
  });
  return json({ letters, solved: guess === entry.answer });
};
