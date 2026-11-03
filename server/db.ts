import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * The site's database: one SQLite file per site (`<data>/crosswordle.db`), through Node's built-in
 * `node:sqlite`, so nothing native needs installing on the server. Each site (live, staging) has
 * its own file, outside the releases, so deploys never touch it.
 */

/**
 * Schema changes, in order. Each runs once, in a transaction; `PRAGMA user_version` records how
 * many have run. Only ever append: never edit or reorder one that has shipped.
 */
export type Migration = (db: DatabaseSync) => void;

export const MIGRATIONS: readonly Migration[] = [];

/** Opens (creating if needed) the database at `path`, or an in-memory one, and brings it up to date. */
export function openDatabase(
  path: string,
  migrations: readonly Migration[] = MIGRATIONS,
): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // WAL lets readers carry on while a write is in progress. The busy timeout covers the rare
  // overlap with a backup.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db, migrations);
  return db;
}

/** Runs the migrations the database hasn't had yet. Refuses a database newer than the code. */
export function migrate(db: DatabaseSync, migrations: readonly Migration[]): void {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  if (version > migrations.length) {
    throw new Error(
      `The database is at schema ${version}, but this release only knows ${migrations.length}. ` +
        'Deploy a newer release or restore a matching backup.',
    );
  }
  for (let i = version; i < migrations.length; i++) {
    db.exec('BEGIN');
    try {
      migrations[i]!(db);
      // PRAGMA can't take a bound parameter; `i + 1` is a number from this loop.
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** The schema version, for checks and the admin tools. */
export function schemaVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}
