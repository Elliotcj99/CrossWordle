import type { DatabaseSync } from 'node:sqlite';
import { addDays } from './dates';

/**
 * Usage stats for the admin command (`admin.mjs stats`), from the server's own records: nothing
 * extra is collected for them except the page-load count (`Visits`), which records nothing
 * about who.
 *
 * Puzzle figures are per puzzle, daily and Naughty apart. Day figures are per UTC day, as the
 * records' times are UTC.
 */

export interface PuzzleStats {
  readonly puzzleId: string;
  /** Players who did anything on it (a guess or a clue). */
  readonly started: number;
  readonly finished: number;
  readonly won: number;
  readonly lost: number;
  /** Wins on an unbroken first attempt. */
  readonly ranked: number;
  /** Players who restarted it at least once. */
  readonly restarted: number;
  readonly guesses: number;
  readonly crosswordClues: number;
  readonly wordleClues: number;
}

export interface DayStats {
  readonly day: string;
  readonly pageLoads: number;
  readonly newPlayers: number;
  /** Players who made at least one guess that day. */
  readonly activePlayers: number;
}

export interface StatsReport {
  readonly daily: readonly PuzzleStats[];
  readonly naughty: readonly PuzzleStats[];
  readonly days: readonly DayStats[];
  /** Every player id the server has ever been sent. */
  readonly players: number;
  /** Of those, ids that never made a guess (only a clue, a recovery code and so on). */
  readonly playersWithoutGuesses: number;
}

/** Counts page loads per UTC day. The page asks `/api/features` once per load. */
export class Visits {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  count(): void {
    this.db
      .prepare(
        `INSERT INTO visits (day, count) VALUES (?, 1)
           ON CONFLICT (day) DO UPDATE SET count = count + 1`,
      )
      .run(this.now().toISOString().slice(0, 10));
  }
}

const PUZZLE_DATE = /(\d{4}-\d{2}-\d{2})$/;

export class Stats {
  constructor(private readonly db: DatabaseSync) {}

  /** Puzzles dated, and days, from `from` to `to` (YYYY-MM-DD, inclusive). */
  report(from: string, to: string): StatsReport {
    const count = (sql: string, ...params: string[]): Map<string, number> =>
      new Map(
        (this.db.prepare(sql).all(...params) as { key: string; n: number }[]).map((r) => [
          r.key,
          r.n,
        ]),
      );

    // Only the puzzles in range: daily ids are their date, Naughty ones `naughty-<date>`.
    const IN_RANGE = `(puzzle_id BETWEEN ?1 AND ?2 OR puzzle_id BETWEEN 'naughty-' || ?1 AND 'naughty-' || ?2)`;
    const byPuzzle = (sql: string) => count(sql, from, to);

    const started = byPuzzle(
      `SELECT puzzle_id AS key, count(DISTINCT player_id) AS n FROM (
         SELECT puzzle_id, player_id FROM guesses WHERE ${IN_RANGE}
         UNION ALL SELECT puzzle_id, player_id FROM hints WHERE ${IN_RANGE})
       GROUP BY puzzle_id`,
    );
    const finished = byPuzzle(
      `SELECT puzzle_id AS key, count(*) AS n FROM results WHERE ${IN_RANGE} GROUP BY puzzle_id`,
    );
    const won = byPuzzle(
      `SELECT puzzle_id AS key, count(*) AS n FROM results WHERE ${IN_RANGE} AND won = 1 GROUP BY puzzle_id`,
    );
    const ranked = byPuzzle(
      `SELECT puzzle_id AS key, count(*) AS n FROM results WHERE ${IN_RANGE} AND ranked = 1 GROUP BY puzzle_id`,
    );
    const restarted = byPuzzle(
      `SELECT puzzle_id AS key, count(DISTINCT player_id) AS n FROM restarts WHERE ${IN_RANGE} GROUP BY puzzle_id`,
    );
    const guesses = byPuzzle(
      `SELECT puzzle_id AS key, count(*) AS n FROM guesses WHERE ${IN_RANGE} GROUP BY puzzle_id`,
    );
    const crossword = byPuzzle(
      `SELECT puzzle_id AS key, count(*) AS n FROM hints WHERE ${IN_RANGE} AND kind = 'crossword' GROUP BY puzzle_id`,
    );
    const wordle = byPuzzle(
      `SELECT puzzle_id AS key, count(*) AS n FROM hints WHERE ${IN_RANGE} AND kind = 'wordle' GROUP BY puzzle_id`,
    );

    // The text ranges also take ids with something after the date; keep exact dated ids only.
    const inRange = (id: string) => {
      const date = PUZZLE_DATE.exec(id)?.[1];
      return date !== undefined && date >= from && date <= to;
    };
    const puzzles = [...started.keys()].filter(inRange).sort();
    const row = (id: string): PuzzleStats => ({
      puzzleId: id,
      started: started.get(id) ?? 0,
      finished: finished.get(id) ?? 0,
      won: won.get(id) ?? 0,
      lost: (finished.get(id) ?? 0) - (won.get(id) ?? 0),
      ranked: ranked.get(id) ?? 0,
      restarted: restarted.get(id) ?? 0,
      guesses: guesses.get(id) ?? 0,
      crosswordClues: crossword.get(id) ?? 0,
      wordleClues: wordle.get(id) ?? 0,
    });

    const pageLoads = count(
      'SELECT day AS key, count AS n FROM visits WHERE day BETWEEN ? AND ?',
      from,
      to,
    );
    // ISO times sort as text, so a plain range on the column works (and can use an index).
    const until = addDays(to, 1);
    const newPlayers = count(
      `SELECT substr(created_at, 1, 10) AS key, count(*) AS n FROM players
        WHERE created_at >= ? AND created_at < ? GROUP BY key`,
      from,
      until,
    );
    const active = count(
      `SELECT substr(at, 1, 10) AS key, count(DISTINCT player_id) AS n FROM guesses
        WHERE at >= ? AND at < ? GROUP BY key`,
      from,
      until,
    );
    const days: DayStats[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      days.push({
        day,
        pageLoads: pageLoads.get(day) ?? 0,
        newPlayers: newPlayers.get(day) ?? 0,
        activePlayers: active.get(day) ?? 0,
      });
    }

    const totals = this.db
      .prepare(
        `SELECT count(*) AS players,
                sum(NOT EXISTS (SELECT 1 FROM guesses g WHERE g.player_id = p.id)) AS without
           FROM players p`,
      )
      .get() as { players: number; without: number | null };

    return {
      daily: puzzles.filter((id) => !id.startsWith('naughty-')).map(row),
      naughty: puzzles.filter((id) => id.startsWith('naughty-')).map(row),
      days,
      players: totals.players,
      playersWithoutGuesses: totals.without ?? 0,
    };
  }
}
