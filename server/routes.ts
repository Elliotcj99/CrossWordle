import { features } from './api/features';
import { nickname } from './api/nickname';
import { crosswordClue, recordedGuess, recordedHint, restart } from './api/records';
import type { Config } from './config';
import type { Nicknames } from './nicknames';
import type { Routes } from './node-adapter';
import type { Records } from './records';

/** What the routes need from the server. */
export interface Services {
  readonly records: Records;
  readonly nicknames: Nicknames;
  readonly config: Config;
  /** Whole words a nickname may not contain, on top of the profanity library's list. */
  readonly rudeWords: ReadonlySet<string>;
}

/**
 * Every API route, for both the IIS server (`main.ts`) and the local preview (`preview.ts`), so
 * they can't drift apart. Guess and hint score with the Pages Function handlers and then record
 * the result; the rest are Node-only.
 */
export function apiRoutes(services: Services): Routes {
  const { records, config } = services;
  return {
    '/api/guess': { POST: recordedGuess(records) },
    '/api/hint': { POST: recordedHint(records) },
    '/api/restart': { POST: restart(records) },
    '/api/clue': { POST: crosswordClue(records) },
    '/api/nickname': { POST: nickname(services) },
    '/api/features': { GET: features(config) },
  };
}
