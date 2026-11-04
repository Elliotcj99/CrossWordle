import type { DatabaseSync } from 'node:sqlite';

/**
 * Each puzzle's leaderboard. Daily and Naughty puzzles have separate ids, so separate boards.
 *
 * On the board: won, unbroken first attempts (`ranked`), not hidden by an admin, from players who
 * gave a nickname (naming yourself is how you join). Order: fewest guesses, then fewest hints of
 * both kinds together, then the earliest finish. The two kinds of hint are shown separately.
 * Player ids never leave the server: the caller's own row is marked `isYou` instead.
 */

export const BOARD_SIZE = 100;

export interface BoardEntry {
  readonly rank: number;
  readonly nickname: string;
  readonly guesses: number;
  readonly crosswordHints: number;
  readonly wordleHints: number;
  readonly finishedAt: string;
  readonly isYou: boolean;
}

/** Where the caller stands, if they've finished this puzzle. */
export type YourPlace =
  | { readonly status: 'on-board'; readonly rank: number }
  /** Ranked, but without a nickname: where they'd be. */
  | { readonly status: 'no-nickname'; readonly rank: number }
  | { readonly status: 'not-ranked'; readonly reason: 'lost' | 'restarted' }
  /** Taken off the board by an admin after review. */
  | { readonly status: 'hidden' };

export interface Board {
  readonly puzzleId: string;
  /** The top of the board, at most `BOARD_SIZE`. */
  readonly entries: readonly BoardEntry[];
  /** How many are on the whole board. */
  readonly total: number;
  readonly you?: YourPlace;
}

// Ranked results in board order. A no-nickname result is ordered too (to say where it would be),
// but only nicknamed ones are numbered on the board.
const ORDER = 'r.guesses, r.crossword_hints + r.wordle_hints, r.finished_at, r.player_id';
const ON_BOARD = 'r.ranked = 1 AND r.hidden = 0 AND p.nickname IS NOT NULL';

export class Leaderboard {
  constructor(private readonly db: DatabaseSync) {}

  board(puzzleId: string, playerId?: string): Board {
    const rows = this.db
      .prepare(
        `SELECT r.player_id, p.nickname, r.guesses, r.crossword_hints, r.wordle_hints, r.finished_at
           FROM results r JOIN players p ON p.id = r.player_id
          WHERE r.puzzle_id = ? AND ${ON_BOARD}
          ORDER BY ${ORDER}
          LIMIT ?`,
      )
      .all(puzzleId, BOARD_SIZE) as {
      player_id: string;
      nickname: string;
      guesses: number;
      crossword_hints: number;
      wordle_hints: number;
      finished_at: string;
    }[];
    const { total } = this.db
      .prepare(
        `SELECT count(*) AS total FROM results r JOIN players p ON p.id = r.player_id
          WHERE r.puzzle_id = ? AND ${ON_BOARD}`,
      )
      .get(puzzleId) as { total: number };

    const you = playerId === undefined ? undefined : this.placeOf(puzzleId, playerId);
    return {
      puzzleId,
      entries: rows.map((row, i) => ({
        rank: i + 1,
        nickname: row.nickname,
        guesses: row.guesses,
        crosswordHints: row.crossword_hints,
        wordleHints: row.wordle_hints,
        finishedAt: row.finished_at,
        isYou: row.player_id === playerId,
      })),
      total,
      ...(you === undefined ? {} : { you }),
    };
  }

  private placeOf(puzzleId: string, playerId: string): YourPlace | undefined {
    const mine = this.db
      .prepare(
        `SELECT r.ranked, r.unranked_reason, r.hidden, p.nickname
           FROM results r JOIN players p ON p.id = r.player_id
          WHERE r.puzzle_id = ? AND r.player_id = ?`,
      )
      .get(puzzleId, playerId) as
      | {
          ranked: number;
          unranked_reason: 'lost' | 'restarted' | null;
          hidden: number;
          nickname: string | null;
        }
      | undefined;
    if (mine === undefined) return undefined;
    if (mine.ranked !== 1) return { status: 'not-ranked', reason: mine.unranked_reason ?? 'lost' };
    if (mine.hidden === 1) return { status: 'hidden' };

    // How many on the board finish ahead of this result, in board order.
    const { ahead } = this.db
      .prepare(
        `SELECT count(*) AS ahead
           FROM results r JOIN players p ON p.id = r.player_id,
                results me
          WHERE me.puzzle_id = ? AND me.player_id = ?
            AND r.puzzle_id = me.puzzle_id AND ${ON_BOARD} AND r.player_id <> me.player_id
            AND (r.guesses, r.crossword_hints + r.wordle_hints, r.finished_at, r.player_id)
              < (me.guesses, me.crossword_hints + me.wordle_hints, me.finished_at, me.player_id)`,
      )
      .get(puzzleId, playerId) as { ahead: number };
    return { status: mine.nickname === null ? 'no-nickname' : 'on-board', rank: ahead + 1 };
  }
}
