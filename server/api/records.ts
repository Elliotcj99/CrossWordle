import type { HintLetter, ScoredLetter } from '@crosswordle/engine';
import { onRequestPost as clue } from '../../functions/api/clue';
import { onRequestPost as guess } from '../../functions/api/guess';
import { onRequestPost as hint } from '../../functions/api/hint';
import { clientPuzzleFor, json } from '../../functions/api/_shared';
import type { Handler } from '../node-adapter';
import { playerIdFrom, type Records } from '../records';

/**
 * The guess and hint endpoints, plus a record of each player's game (see `../records.ts`). Scoring
 * and hints are the shared handlers', unchanged; afterwards, if the request carried a player id, what it
 * returned is recorded. A request without one (an older page) is scored but not recorded, and a
 * recording failure is logged without failing the guess: the player's game comes first.
 */

interface PlayBody {
  readonly puzzleId?: unknown;
  readonly entryId?: unknown;
}

async function bodyOf(request: Request): Promise<PlayBody | undefined> {
  try {
    const body = (await request.clone().json()) as unknown;
    return typeof body === 'object' && body !== null ? (body as PlayBody) : undefined;
  } catch {
    return undefined;
  }
}

function attempt(what: string, work: () => void): void {
  try {
    work();
  } catch (error) {
    console.error(`Recording ${what} failed:`, error);
  }
}

/** Wraps a scoring handler: score as usual, then record a successful result. */
function recorded(
  handler: Handler,
  what: string,
  record: (playerId: string, body: PlayBody, response: unknown) => void,
): Handler {
  return async ({ request }) => {
    const playerId = playerIdFrom(request);
    const body = playerId === undefined ? undefined : await bodyOf(request);
    const response = await handler({ request });
    if (playerId !== undefined && body !== undefined && response.status === 200) {
      const result = (await response.clone().json()) as unknown;
      attempt(what, () => record(playerId, body, result));
    }
    return response;
  };
}

export function recordedGuess(records: Records): Handler {
  return recorded(guess, 'a guess', (playerId, body, result) => {
    const puzzle = clientPuzzleFor(body.puzzleId as string);
    const { letters } = result as { letters: ScoredLetter[] };
    if (puzzle !== undefined)
      records.recordGuess(playerId, puzzle, body.entryId as string, letters);
  });
}

export function recordedHint(records: Records): Handler {
  return recorded(hint, 'a hint', (playerId, body, result) => {
    const puzzle = clientPuzzleFor(body.puzzleId as string);
    if (puzzle !== undefined) {
      records.recordHint(playerId, puzzle, body.entryId as string, {
        kind: 'wordle',
        letter: result as HintLetter,
      });
    }
  });
}

export function recordedClue(records: Records): Handler {
  return recorded(clue, 'a Crossword clue', (playerId, body, result) => {
    const puzzle = clientPuzzleFor(body.puzzleId as string);
    if (puzzle !== undefined) {
      records.recordHint(playerId, puzzle, body.entryId as string, {
        kind: 'crossword',
        clue: (result as { clue: string }).clue,
      });
    }
  });
}

/** The player pressed Restart: their next guesses are a new, unranked attempt. */
export function restart(records: Records): Handler {
  return async ({ request }) => {
    const playerId = playerIdFrom(request);
    const body = await bodyOf(request);
    if (playerId === undefined || body === undefined || typeof body.puzzleId !== 'string') {
      return json({ error: 'bad-request' }, 400);
    }
    const puzzle = clientPuzzleFor(body.puzzleId);
    if (puzzle === undefined) return json({ error: 'unknown-puzzle' }, 404);
    records.recordRestart(playerId, puzzle);
    return new Response(null, { status: 204 });
  };
}
