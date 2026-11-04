import { features } from './api/features';
import { contact } from './api/contact';
import { forget } from './api/forget';
import { leaderboard } from './api/leaderboard';
import { nickname } from './api/nickname';
import { game, record } from './api/play';
import { makeRecoveryCode, recoveryStatus, restore } from './api/recovery';
import { recordedClue, recordedGuess, recordedHint, restart } from './api/records';
import type { Config } from './config';
import type { Leaderboard } from './leaderboard';
import type { ErrorLog } from './log';
import type { Nicknames } from './nicknames';
import type { Routes } from './node-adapter';
import type { RateLimits } from './rate-limits';
import type { Records } from './records';
import type { Recovery } from './recovery';

/** What the routes need from the server. */
export interface Services {
  readonly log: ErrorLog;
  readonly records: Records;
  readonly leaderboard: Leaderboard;
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
    '/api/guess': { POST: recordedGuess(records, services.log) },
    '/api/hint': { POST: recordedHint(records, services.log) },
    '/api/restart': { POST: restart(records) },
    '/api/game': { GET: game(records) },
    '/api/record': { GET: record(records) },
    '/api/leaderboard': { GET: leaderboard(services.leaderboard) },
    '/api/clue': { POST: recordedClue(records, services.log) },
    '/api/nickname': { POST: nickname(services) },
    '/api/recovery-code': { GET: recoveryStatus(services), POST: makeRecoveryCode(services) },
    '/api/restore': { POST: restore(services) },
    '/api/features': { GET: features(config) },
    '/api/contact': { GET: contact(config) },
    '/api/forget': { POST: forget(records) },
  };
}
