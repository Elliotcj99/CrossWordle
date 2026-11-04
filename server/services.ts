import rudeWordList from './_rude-words.json';
import { databaseFile, pathsFromEnv, readConfig } from './config';
import { Leaderboard } from './leaderboard';
import { puzzleIds } from '../functions/api/_shared';
import { Feedback } from './feedback';
import { Health } from './health';
import { ErrorLog } from './log';
import { Visits } from './stats';
import { openDatabase } from './db';
import { Nicknames } from './nicknames';
import { RateLimits } from './rate-limits';
import { Records } from './records';
import { Recovery } from './recovery';
import type { Services } from './routes';

/**
 * Starts what both servers (IIS and the local preview) need: the site's settings and its database,
 * opened and migrated. Called before taking requests, so a broken settings file or an unwritable
 * data folder stops the server at start-up rather than failing a player's guess.
 */
export function startServices(log: ErrorLog): Services & { close(): void } {
  const paths = pathsFromEnv();
  const config = readConfig(paths.config);
  const db = openDatabase(databaseFile(paths));
  return {
    log,
    health: new Health(db, paths.data, puzzleIds),
    visits: new Visits(db),
    records: new Records(db),
    feedback: new Feedback(db),
    leaderboard: new Leaderboard(db),
    nicknames: new Nicknames(db),
    recovery: new Recovery(db),
    limits: new RateLimits(db),
    config,
    rudeWords: new Set(rudeWordList),
    close: () => db.close(),
  };
}
