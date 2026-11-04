import type { HintLetter, ScoredLetter } from '@crosswordle/engine';
import { onRequestPost as clue } from '../../functions/api/clue';
import { onRequestPost as guess } from '../../functions/api/guess';
import { onRequestPost as hint } from '../../functions/api/hint';
import { clientPuzzleFor, json } from '../../functions/api/_shared';
import type { ErrorSink, Handler } from '../node-adapter';
import { playerIdFrom, type Records } from '../records';

/**
 * The guess and hint endpoints, plus a record of each player's game (see `../records.ts`). Scoring
 * and hints are the shared handlers', unchanged; afterwards, if the request carried a player id, what it
 * returned is recorded. A request without one (an older page) is scored but not recorded, and a
 * recording failure goes to the error log without failing the guess: the player's game comes
 * first.
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

/** Wraps a scoring handler: score as usual, then record a successful result. */
function recorded(
  handler: Handler,
  what: string,
  log: ErrorSink,
  record: (playerId: string, body: PlayBody, response: unknown) => void,
): Handler {
  return async ({ request }) => {
    const playerId = playerIdFrom(request);
    const body = playerId === undefined ? undefined : await bodyOf(request);
    const response = await handler({ request });
    if (playerId !== undefined && body !== undefined && response.status === 200) {
      const result = (await response.clone().json()) as unknown;
      try {
        record(playerId, body, result);
      } catch (error) {
        log.error(`recording ${what}`, error, { request, playerId });
      }
    }
    return response;
  };
}

export function recordedGuess(records: Records, log: ErrorSink): Handler {
  return recorded(guess, 'a guess', log, (playerId, body, result) => {
    const puzzle = clientPuzzleFor(body.puzzleId as string);
    const { letters } = result as { letters: ScoredLetter[] };
    if (puzzle !== undefined)
      records.recordGuess(playerId, puzzle, body.entryId as string, letters);
  });
}

export function recordedHint(records: Records, log: ErrorSink): Handler {
  return recorded(hint, 'a hint', log, (playerId, body, result) => {
    const puzzle = clientPuzzleFor(body.puzzleId as string);
    if (puzzle !== undefined) {
      records.recordHint(playerId, puzzle, body.entryId as string, {
        kind: 'wordle',
        letter: result as HintLetter,
      });
    }
  });
}

export function recordedClue(records: Records, log: ErrorSink): Handler {
  return recorded(clue, 'a Crossword clue', log, (playerId, body, result) => {
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
