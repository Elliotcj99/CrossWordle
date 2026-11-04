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

export const MIGRATIONS: readonly Migration[] = [
  // 1. Players and what they do: each guess and hint, attempt by attempt, and each finished game.
  (db) =>
    db.exec(`
      CREATE TABLE players (
        id          TEXT PRIMARY KEY,
        created_at  TEXT NOT NULL
      ) STRICT;

      -- The attempt a player is on for a puzzle. A restart starts the next one.
      CREATE TABLE plays (
        player_id   TEXT NOT NULL REFERENCES players (id),
        puzzle_id   TEXT NOT NULL,
        attempt     INTEGER NOT NULL,
        PRIMARY KEY (player_id, puzzle_id)
      ) STRICT;

      CREATE TABLE restarts (
        player_id   TEXT NOT NULL REFERENCES players (id),
        puzzle_id   TEXT NOT NULL,
        attempt     INTEGER NOT NULL,           -- the attempt this restart started
        reason      TEXT NOT NULL CHECK (reason IN ('reported', 'detected')),
        at          TEXT NOT NULL
      ) STRICT;

      CREATE TABLE guesses (
        id          INTEGER PRIMARY KEY,
        player_id   TEXT NOT NULL REFERENCES players (id),
        puzzle_id   TEXT NOT NULL,
        attempt     INTEGER NOT NULL,
        entry_id    TEXT NOT NULL,
        letters     TEXT NOT NULL,              -- the scored guess, as JSON
        at          TEXT NOT NULL
      ) STRICT;
      CREATE INDEX guesses_by_play ON guesses (player_id, puzzle_id, attempt);

      CREATE TABLE hints (
        player_id   TEXT NOT NULL REFERENCES players (id),
        puzzle_id   TEXT NOT NULL,
        attempt     INTEGER NOT NULL,
        entry_id    TEXT NOT NULL,
        kind        TEXT NOT NULL CHECK (kind IN ('crossword', 'wordle')),
        letter      TEXT,                       -- the Wordle-clue letter, as JSON
        at          TEXT NOT NULL,
        PRIMARY KEY (player_id, puzzle_id, attempt, entry_id, kind)
      ) STRICT;

      -- Every finished game, first finish only: lost or won, ranked or not.
      CREATE TABLE results (
        player_id       TEXT NOT NULL REFERENCES players (id),
        puzzle_id       TEXT NOT NULL,
        attempt         INTEGER NOT NULL,
        won             INTEGER NOT NULL,
        guesses         INTEGER NOT NULL,
        crossword_hints INTEGER NOT NULL,
        wordle_hints    INTEGER NOT NULL,
        ranked          INTEGER NOT NULL,
        unranked_reason TEXT CHECK (unranked_reason IN ('lost', 'restarted')),
        hidden          INTEGER NOT NULL DEFAULT 0,
        finished_at     TEXT NOT NULL,
        PRIMARY KEY (player_id, puzzle_id)
      ) STRICT;
      CREATE INDEX results_by_rank ON results (puzzle_id, ranked, hidden, guesses);
    `),
];

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
