import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Players: registering an id the first time the server sees it, and forgetting one for good.
 *
 * A forgotten player id is remembered only as a SHA-256 hash, so a request still in flight or
 * another open tab can't bring the record back: registering it again fails, and the API answers
 * such requests with 410 `forgotten` (see `routes.ts`), which tells the page to forget it too.
 */

export class ForgottenPlayerError extends Error {
  constructor() {
    super('This player id was deleted.');
  }
}

function hashOf(playerId: string): string {
  return createHash('sha256').update(playerId).digest('hex');
}

export function isForgotten(db: DatabaseSync, playerId: string): boolean {
  return (
    db.prepare('SELECT 1 FROM forgotten_players WHERE player_hash = ?').get(hashOf(playerId)) !==
    undefined
  );
}

/**
 * Registers a player id on first sight. Throws `ForgottenPlayerError` for a deleted one. A known
 * player can't be a deleted one (deleting removes the row), so only a new id is looked up.
 */
export function registerPlayer(db: DatabaseSync, playerId: string, at: string): void {
  if (db.prepare('SELECT 1 FROM players WHERE id = ?').get(playerId) !== undefined) return;
  if (isForgotten(db, playerId)) throw new ForgottenPlayerError();
  db.prepare('INSERT INTO players (id, created_at) VALUES (?, ?)').run(playerId, at);
}

/**
 * The tables holding a player's own data: every table with a `player_id` column except
 * `submissions`, the rate-limit log, which keeps its rows for its 30 days so deleting a record
 * can't reset the limits (or erase who restored whose record). Found from the schema, so a table
 * added by a later migration is included without anyone remembering to.
 */
export function playerTables(db: DatabaseSync): string[] {
  return (
    db
      .prepare(
        `SELECT m.name FROM sqlite_master m
          WHERE m.type = 'table' AND m.name NOT IN ('players', 'submissions')
            AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'player_id')
          ORDER BY m.name`,
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
}

/** Deletes a player's data and the player, and remembers the id (hashed) as forgotten. */
export function forgetPlayer(db: DatabaseSync, playerId: string, at: string): void {
  for (const table of playerTables(db)) {
    // Table names come from the schema above, never from the request.
    db.prepare(`DELETE FROM ${table} WHERE player_id = ?`).run(playerId);
  }
  db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
  db.prepare('INSERT OR IGNORE INTO forgotten_players (player_hash, at) VALUES (?, ?)').run(
    hashOf(playerId),
    at,
  );
}
