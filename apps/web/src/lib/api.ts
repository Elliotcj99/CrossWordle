import type { HintLetter, ScoredLetter } from '@crosswordle/engine';

/** What the scoring Function returns for a guess it accepted. */
export interface ScoredGuess {
  readonly letters: ScoredLetter[];
  readonly solved: boolean;
}

export class ScoringError extends Error {}

/**
 * Sends a guess to the scoring Function and returns how it scored. The answer never reaches the
 * browser; the server only reports the marks for this one guess. Throws `ScoringError` if the
 * request can't be completed (offline, server error), so the caller can tell the player to retry.
 */
export async function scoreGuess(
  puzzleId: string,
  entryId: string,
  guess: string,
): Promise<ScoredGuess> {
  let response: Response;
  try {
    response = await fetch('api/guess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ puzzleId, entryId, guess }),
    });
  } catch {
    throw new ScoringError('Could not reach the scorer.');
  }
  if (!response.ok) throw new ScoringError(`The scorer returned ${response.status}.`);

  const data = (await response.json()) as Partial<ScoredGuess>;
  if (!Array.isArray(data.letters) || typeof data.solved !== 'boolean') {
    throw new ScoringError('The scorer sent an unexpected reply.');
  }
  return { letters: data.letters, solved: data.solved };
}

/** A Wordle-clue request either reveals a letter, finds nothing new, or fails. */
export type HintResult =
  | { readonly ok: true; readonly hint: HintLetter }
  | { readonly ok: false; readonly reason: 'none' | 'error' };

/**
 * Asks the server for a letter to reveal for an entry, given the guesses made so far. The answer
 * never reaches the browser; only the one chosen letter comes back. `reason: 'none'` means every
 * position is already green, so there's nothing new to show.
 */
export async function requestHint(
  puzzleId: string,
  entryId: string,
  guesses: readonly string[],
): Promise<HintResult> {
  try {
    const response = await fetch('api/hint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ puzzleId, entryId, guesses }),
    });
    if (response.status === 409) return { ok: false, reason: 'none' };
    if (!response.ok) return { ok: false, reason: 'error' };
    const data = (await response.json()) as Partial<HintLetter>;
    if (typeof data.index !== 'number' || typeof data.letter !== 'string') {
      return { ok: false, reason: 'error' };
    }
    return { ok: true, hint: { index: data.index, letter: data.letter } };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
