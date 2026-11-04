import { json } from '../functions/api/_shared';
import { features } from './api/features';
import { contact } from './api/contact';
import { feedback } from './api/feedback';
import { forget } from './api/forget';
import { health } from './api/health';
import { leaderboard } from './api/leaderboard';
import { nickname } from './api/nickname';
import { game, record } from './api/play';
import { makeRecoveryCode, recoveryStatus, restore } from './api/recovery';
import { recordedClue, recordedGuess, recordedHint, restart } from './api/records';
import type { Config } from './config';
import type { Feedback } from './feedback';
import type { Health } from './health';
import type { Leaderboard } from './leaderboard';
import type { Nicknames } from './nicknames';
import type { ErrorSink, Handler, Routes } from './node-adapter';
import type { RateLimits } from './rate-limits';
import { playerIdFrom, type Records } from './records';
import type { Recovery } from './recovery';
import type { Visits } from './stats';

/** What the routes need from the server. */
export interface Services {
  /** Where request errors go: the error log (log.ts), or a stand-in in tests. */
  readonly log: ErrorSink;
  readonly health: Health;
  readonly visits: Visits;
  readonly records: Records;
  readonly feedback: Feedback;
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
  return refuseForgotten(services, {
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
    '/api/features': { GET: features(config, () => countVisit(services)) },
    '/api/health': { GET: health(services.health) },
    '/api/contact': { GET: contact(config) },
    '/api/forget': { POST: forget(records) },
    '/api/feedback': { POST: feedback(services) },
  });
}

/** Counts a page load. A failure is logged, never passed on to the page. */
function countVisit({ visits, log }: Services): void {
  try {
    visits.count();
  } catch (error) {
    log.error('counting a page load', error);
  }
}

/**
 * Answers any request from a deleted player id with 410 `forgotten`, so a tab still open with it
 * forgets it too. `/api/forget` itself is exempt: deleting again just succeeds.
 */
function refuseForgotten(services: Services, routes: Routes): Routes {
  const guard =
    (handler: Handler): Handler =>
    async (input) => {
      const playerId = playerIdFrom(input.request);
      if (playerId !== undefined && services.records.isForgotten(playerId)) {
        return json({ error: 'forgotten' }, 410);
      }
      return handler(input);
    };
  return Object.fromEntries(
    Object.entries(routes).map(([path, route]) => [
      path,
      path === '/api/forget'
        ? route
        : {
            ...(route.GET === undefined ? {} : { GET: guard(route.GET) }),
            ...(route.POST === undefined ? {} : { POST: guard(route.POST) }),
          },
    ]),
  );
}
