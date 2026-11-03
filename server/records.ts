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

/**
 * The server's own record of each player's game, so a leaderboard score is worked out from what
 * the server saw, not taken on the browser's word. Guesses and hints are kept attempt by attempt;
 * a restart starts the next attempt. When an attempt finishes, the engine sums it up and the first
 * finish for the puzzle is stored: ranked only if it was an unbroken first attempt that was won.
 */

/** Player ids are random UUIDs made by the browser (`crypto.randomUUID()`). */
const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The request's player id (header `X-Player-Id`), lowercased, or `undefined` if absent or malformed. */
export function playerIdFrom(request: Request): string | undefined {
  const id = request.headers.get('x-player-id')?.trim().toLowerCase();
  return id !== undefined && PLAYER_ID.test(id) ? id : undefined;
}

export type HintKind = 'crossword' | 'wordle';

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
  recordHint(
    playerId: string,
    puzzle: ClientPuzzle,
    entryId: string,
    kind: HintKind,
    letter?: HintLetter,
  ): void {
    this.transaction(() => {
      const attempt = this.currentAttempt(playerId, puzzle.id);
      this.db
        .prepare(
          'INSERT OR IGNORE INTO hints (player_id, puzzle_id, attempt, entry_id, kind, letter, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          playerId,
          puzzle.id,
          attempt,
          entryId,
          kind,
          letter === undefined ? null : JSON.stringify(letter),
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
        'SELECT entry_id, kind, letter FROM hints WHERE player_id = ? AND puzzle_id = ? AND attempt = ?',
      )
      .all(playerId, puzzle.id, attempt) as {
      entry_id: string;
      kind: HintKind;
      letter: string | null;
    }[];
    const crosswordClues = hints.filter((h) => h.kind === 'crossword').map((h) => h.entry_id);
    const wordleClues = Object.fromEntries(
      hints
        .filter((h) => h.kind === 'wordle' && h.letter !== null)
        .map((h) => [h.entry_id, JSON.parse(h.letter!) as HintLetter]),
    );
    return { ...newGame(puzzle), guesses, crosswordClues, wordleClues };
  }

  private finishIfOver(playerId: string, puzzle: ClientPuzzle, attempt: number): void {
    const summary = gameSummary(puzzle, this.state(playerId, puzzle, attempt));
    if (summary.status === 'playing') return;
    const won = summary.status === 'won';
    const reason = !won ? 'lost' : attempt > 1 ? 'restarted' : null;
    // The first finish stands: a later attempt never replaces it.
    this.db
      .prepare(
        `INSERT OR IGNORE INTO results (player_id, puzzle_id, attempt, won, guesses, crossword_hints,
           wordle_hints, ranked, unranked_reason, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        this.stamp(),
      );
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
