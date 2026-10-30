import type { ScoredLetter } from '@crosswordle/engine';

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
