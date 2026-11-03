import { features } from './api/features';
import { crosswordClue, recordedGuess, recordedHint, restart } from './api/records';
import type { Routes } from './node-adapter';
import type { Records } from './records';

/** What the routes need from the server: the record of each player's game. */
export interface Services {
  readonly records: Records;
}

/**
 * Every API route, for both the IIS server (`main.ts`) and the local preview (`preview.ts`), so
 * they can't drift apart. Guess and hint score with the Pages Function handlers and then record
 * the result; the rest are Node-only.
 */
export function apiRoutes({ records }: Services): Routes {
  return {
    '/api/guess': { POST: recordedGuess(records) },
    '/api/hint': { POST: recordedHint(records) },
    '/api/restart': { POST: restart(records) },
    '/api/clue': { POST: crosswordClue(records) },
    '/api/features': { GET: features },
  };
}
