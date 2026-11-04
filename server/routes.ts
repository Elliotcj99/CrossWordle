import { features } from './api/features';
import { nickname } from './api/nickname';
import { makeRecoveryCode, recoveryStatus, restore } from './api/recovery';
import { recordedClue, recordedGuess, recordedHint, restart } from './api/records';
import type { Config } from './config';
import type { Nicknames } from './nicknames';
import type { Routes } from './node-adapter';
import type { RateLimits } from './rate-limits';
import type { Records } from './records';
import type { Recovery } from './recovery';

/** What the routes need from the server. */
export interface Services {
  readonly records: Records;
  readonly nicknames: Nicknames;
  readonly recovery: Recovery;
  readonly limits: RateLimits;
  readonly config: Config;
  /** Whole words a nickname may not contain, on top of the profanity library's list. */
  readonly rudeWords: ReadonlySet<string>;
}

/**
 * Every API route, for both the IIS server (`main.ts`) and the local preview (`preview.ts`), so
 * they can't drift apart. Guess, hint and clue use the Pages Function handlers and then record
 * what they returned; the rest are Node-only.
 */
export function apiRoutes(services: Services): Routes {
  const { records, config } = services;
  return {
    '/api/guess': { POST: recordedGuess(records) },
    '/api/hint': { POST: recordedHint(records) },
    '/api/restart': { POST: restart(records) },
    '/api/clue': { POST: recordedClue(records) },
    '/api/nickname': { POST: nickname(services) },
    '/api/recovery-code': { GET: recoveryStatus(services), POST: makeRecoveryCode(services) },
    '/api/restore': { POST: restore(services) },
    '/api/features': { GET: features(config) },
  };
}
