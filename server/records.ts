import {
  gameSummary,
  isSolved,
  newGame,
  type ClientPuzzle,
  type GameState,
  type HintLetter,
  type ScoredLetter,
} from '@crosswordle/engine';
import type { DatabaseSync } from 'node:sqlite';
import { reviewFlags, type ReviewFlag } from './review';

/**
 * The server's own record of each player's game, so a leaderboard score is worked out from what
 * the server saw, not taken on the browser's word. Guesses and hints are kept attempt by attempt;
 * a restart starts the next attempt. When an attempt finishes, the engine sums it up and the first
 * finish for the puzzle is stored: ranked only if it was an unbroken first attempt that was won.
 * A ranked win that looks too good is flagged for an admin to review (see `./review.ts`); the flag
 * alone never changes the leaderboard.
 */

/** Player ids are random UUIDs made by the browser (`crypto.randomUUID()`). */
const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The request's player id (header `X-Player-Id`), lowercased, or `undefined` if absent or malformed. */
export function playerIdFrom(request: Request): string | undefined {
  const id = request.headers.get('x-player-id')?.trim().toLowerCase();
  return id !== undefined && PLAYER_ID.test(id) ? id : undefined;
}

export type HintKind = 'crossword' | 'wordle';

/** A revealed hint, as the server sent it: the Crossword clue's text or the Wordle-clue letter. */
export type RevealedHint =
  | { readonly kind: 'crossword'; readonly clue: string }
  | { readonly kind: 'wordle'; readonly letter: HintLetter };

export interface StoredResult {
  readonly attempt: number;
  readonly won: boolean;
  readonly guesses: number;
  readonly crosswordHints: number;
  readonly wordleHints: number;
  readonly ranked: boolean;
  readonly unrankedReason: 'lost' | 'restarted' | null;
}

export class Records {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Records a scored guess. A guess on an entry this attempt has already solved, or after it
   *  finished, means the browser restarted without saying so: it starts the next attempt. */
  recordGuess(
    playerId: string,
    puzzle: ClientPuzzle,
    entryId: string,
    letters: readonly ScoredLetter[],
  ): void {
    this.transaction(() => {
      let attempt = this.currentAttempt(playerId, puzzle.id);
      const before = this.state(playerId, puzzle, attempt);
      const entry = puzzle.entries.find((e) => e.id === entryId);
      const finished = gameSummary(puzzle, before).status !== 'playing';
      if (entry !== undefined && (finished || isSolved(before, entry))) {
        attempt = this.startNextAttempt(playerId, puzzle.id, 'detected');
      }
      this.db
        .prepare(
          'INSERT INTO guesses (player_id, puzzle_id, attempt, entry_id, letters, at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(playerId, puzzle.id, attempt, entryId, JSON.stringify(letters), this.stamp());
      this.finishIfOver(playerId, puzzle, attempt);
    });
  }

  /** Records a hint, once per entry and kind in an attempt. */
  recordHint(playerId: string, puzzle: ClientPuzzle, entryId: string, hint: RevealedHint): void {
    this.transaction(() => {
      const attempt = this.currentAttempt(playerId, puzzle.id);
      this.db
        .prepare(
          'INSERT OR IGNORE INTO hints (player_id, puzzle_id, attempt, entry_id, kind, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          playerId,
          puzzle.id,
          attempt,
          entryId,
          hint.kind,
          JSON.stringify(hint.kind === 'crossword' ? hint.clue : hint.letter),
          this.stamp(),
        );
    });
  }

  /** The browser's Restart. Starts the next attempt, unless this one hasn't begun (no advantage). */
  recordRestart(playerId: string, puzzle: ClientPuzzle): void {
    this.transaction(() => {
      const attempt = this.currentAttempt(playerId, puzzle.id);
      const started = this.db
        .prepare(
          `SELECT EXISTS (SELECT 1 FROM guesses WHERE player_id = ? AND puzzle_id = ? AND attempt = ?)
               OR EXISTS (SELECT 1 FROM hints WHERE player_id = ? AND puzzle_id = ? AND attempt = ?) AS started`,
        )
        .get(playerId, puzzle.id, attempt, playerId, puzzle.id, attempt) as { started: number };
      if (started.started) this.startNextAttempt(playerId, puzzle.id, 'reported');
    });
  }

  /** The stored result of a player's first finish of a puzzle, if any. */
  result(playerId: string, puzzleId: string): StoredResult | undefined {
    const row = this.db
      .prepare(
        `SELECT attempt, won, guesses, crossword_hints, wordle_hints, ranked, unranked_reason
           FROM results WHERE player_id = ? AND puzzle_id = ?`,
      )
      .get(playerId, puzzleId) as
      | {
          attempt: number;
          won: number;
          guesses: number;
          crossword_hints: number;
          wordle_hints: number;
          ranked: number;
          unranked_reason: 'lost' | 'restarted' | null;
        }
      | undefined;
    return row === undefined
      ? undefined
      : {
          attempt: row.attempt,
          won: row.won === 1,
          guesses: row.guesses,
          crosswordHints: row.crossword_hints,
          wordleHints: row.wordle_hints,
          ranked: row.ranked === 1,
          unrankedReason: row.unranked_reason,
        };
  }

  /** Every puzzle the player has finished, with its first finish, oldest first. */
  results(playerId: string): (StoredResult & { puzzleId: string; finishedAt: string })[] {
    const rows = this.db
      .prepare(
        `SELECT puzzle_id, attempt, won, guesses, crossword_hints, wordle_hints, ranked,
                unranked_reason, finished_at
           FROM results WHERE player_id = ? ORDER BY finished_at`,
      )
      .all(playerId) as {
      puzzle_id: string;
      attempt: number;
      won: number;
      guesses: number;
      crossword_hints: number;
      wordle_hints: number;
      ranked: number;
      unranked_reason: 'lost' | 'restarted' | null;
      finished_at: string;
    }[];
    return rows.map((row) => ({
      puzzleId: row.puzzle_id,
      attempt: row.attempt,
      won: row.won === 1,
      guesses: row.guesses,
      crosswordHints: row.crossword_hints,
      wordleHints: row.wordle_hints,
      ranked: row.ranked === 1,
      unrankedReason: row.unranked_reason,
      finishedAt: row.finished_at,
    }));
  }

  /**
   * The player's current attempt at a puzzle, as the server has it, or `undefined` if they
   * haven't played it. Read-only: unlike recording, it never registers the player or the play.
   */
  currentGame(playerId: string, puzzle: ClientPuzzle): GameState | undefined {
    const row = this.db
      .prepare('SELECT attempt FROM plays WHERE player_id = ? AND puzzle_id = ?')
      .get(playerId, puzzle.id) as { attempt: number } | undefined;
    return row === undefined ? undefined : this.state(playerId, puzzle, row.attempt);
  }

  /** The game as the server saw it in one attempt, for the engine to sum up. */
  state(playerId: string, puzzle: ClientPuzzle, attempt: number): GameState {
    const guesses: Record<string, ScoredLetter[][]> = {};
    const rows = this.db
      .prepare(
        'SELECT entry_id, letters FROM guesses WHERE player_id = ? AND puzzle_id = ? AND attempt = ? ORDER BY id',
      )
      .all(playerId, puzzle.id, attempt) as { entry_id: string; letters: string }[];
    for (const row of rows) {
      (guesses[row.entry_id] ??= []).push(JSON.parse(row.letters) as ScoredLetter[]);
    }
    const hints = this.db
      .prepare(
        'SELECT entry_id, kind, detail FROM hints WHERE player_id = ? AND puzzle_id = ? AND attempt = ?',
      )
      .all(playerId, puzzle.id, attempt) as {
      entry_id: string;
      kind: HintKind;
      detail: string | null;
    }[];
    // Crossword clues recorded before the server sent them (schema 2) have no detail.
    const revealed = <T>(kind: HintKind): Record<string, T> =>
      Object.fromEntries(
        hints
          .filter((h) => h.kind === kind && h.detail !== null)
          .map((h) => [h.entry_id, JSON.parse(h.detail!) as T]),
      );
    return {
      ...newGame(puzzle),
      guesses,
      crosswordClues: revealed<string>('crossword'),
      wordleClues: revealed<HintLetter>('wordle'),
    };
  }

  private finishIfOver(playerId: string, puzzle: ClientPuzzle, attempt: number): void {
    const summary = gameSummary(puzzle, this.state(playerId, puzzle, attempt));
    if (summary.status === 'playing') return;
    if (this.result(playerId, puzzle.id) !== undefined) return; // The first finish stands.
    const won = summary.status === 'won';
    const reason = !won ? 'lost' : attempt > 1 ? 'restarted' : null;
    const finishedAt = this.stamp();
    const startedAt = this.startedAt(playerId, puzzle.id, attempt) ?? finishedAt;
    const flags =
      reason === null
        ? this.flagsFor(playerId, puzzle, summary.guesses, startedAt, finishedAt)
        : [];
    this.db
      .prepare(
        `INSERT INTO results (player_id, puzzle_id, attempt, won, guesses, crossword_hints,
           wordle_hints, ranked, unranked_reason, started_at, finished_at, review_flags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        playerId,
        puzzle.id,
        attempt,
        won ? 1 : 0,
        summary.guesses,
        summary.crosswordHints,
        summary.wordleHints,
        reason === null ? 1 : 0,
        reason,
        startedAt,
        finishedAt,
        flags.length === 0 ? null : JSON.stringify(flags),
      );
  }

  /** When an attempt began: its first guess or hint. */
  private startedAt(playerId: string, puzzleId: string, attempt: number): string | undefined {
    const row = this.db
      .prepare(
        `SELECT min(at) AS at FROM (
           SELECT at FROM guesses WHERE player_id = ? AND puzzle_id = ? AND attempt = ?
           UNION ALL
           SELECT at FROM hints WHERE player_id = ? AND puzzle_id = ? AND attempt = ?)`,
      )
      .get(playerId, puzzleId, attempt, playerId, puzzleId, attempt) as { at: string | null };
    return row.at ?? undefined;
  }

  /** Why a ranked win needs a look, given the player's earlier games (none means no flags). */
  private flagsFor(
    playerId: string,
    puzzle: ClientPuzzle,
    guesses: number,
    startedAt: string,
    finishedAt: string,
  ): ReviewFlag[] {
    const earlier = this.db
      .prepare('SELECT won, started_at, finished_at FROM results WHERE player_id = ?')
      .all(playerId) as { won: number; started_at: string | null; finished_at: string }[];
    return reviewFlags({
      entries: puzzle.entries.length,
      guesses,
      seconds: secondsBetween(startedAt, finishedAt),
      firstGame: earlier.length === 0,
      earlierSeconds: earlier
        .filter((r) => r.won === 1 && r.started_at !== null)
        .map((r) => secondsBetween(r.started_at!, r.finished_at)),
    });
  }

  /**
   * Deletes everything kept about a player: their games, results, nickname, recovery code, form
   * submissions and feature requests. Their place on any leaderboard goes with it.
   */
  forget(playerId: string): void {
    this.transaction(() => {
      const tables = [
        'hints',
        'guesses',
        'restarts',
        'plays',
        'results',
        'submissions',
        'feedback',
      ];
      for (const table of tables) {
        this.db.prepare(`DELETE FROM ${table} WHERE player_id = ?`).run(playerId);
      }
      this.db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
    });
  }

  /** The attempt a player is on, registering the player and the play on first sight. */
  private currentAttempt(playerId: string, puzzleId: string): number {
    this.db
      .prepare('INSERT OR IGNORE INTO players (id, created_at) VALUES (?, ?)')
      .run(playerId, this.stamp());
    this.db
      .prepare('INSERT OR IGNORE INTO plays (player_id, puzzle_id, attempt) VALUES (?, ?, 1)')
      .run(playerId, puzzleId);
    const row = this.db
      .prepare('SELECT attempt FROM plays WHERE player_id = ? AND puzzle_id = ?')
      .get(playerId, puzzleId) as { attempt: number };
    return row.attempt;
  }

  private startNextAttempt(
    playerId: string,
    puzzleId: string,
    reason: 'reported' | 'detected',
  ): number {
    this.db
      .prepare('UPDATE plays SET attempt = attempt + 1 WHERE player_id = ? AND puzzle_id = ?')
      .run(playerId, puzzleId);
    const attempt = this.currentAttempt(playerId, puzzleId);
    this.db
      .prepare(
        'INSERT INTO restarts (player_id, puzzle_id, attempt, reason, at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(playerId, puzzleId, attempt, reason, this.stamp());
    return attempt;
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  private transaction(work: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      work();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function secondsBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 1000;
}
