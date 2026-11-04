import rudeWordList from './_rude-words.json';
import { databaseFile, pathsFromEnv, readConfig } from './config';
import { openDatabase } from './db';
import { Nicknames } from './nicknames';
import { Records } from './records';
import type { Services } from './routes';

/**
 * Starts what both servers (IIS and the local preview) need: the site's settings and its database,
 * opened and migrated. Called before taking requests, so a broken settings file or an unwritable
 * data folder stops the server at start-up rather than failing a player's guess.
 */
export function startServices(): Services & { close(): void } {
  const paths = pathsFromEnv();
  const config = readConfig(paths.config);
  const db = openDatabase(databaseFile(paths));
  return {
    records: new Records(db),
    nicknames: new Nicknames(db),
    config,
    rudeWords: new Set(rudeWordList),
    close: () => db.close(),
  };
}
