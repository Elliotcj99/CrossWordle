import type { DatabaseSync } from 'node:sqlite';

/**
 * Results worth a second look before trusting them on the leaderboard, and an admin's decision on
 * each. A flag never takes a result off the board on its own: only an admin's `hide` does, and
 * `keep` records that it was looked at and is fine. A hidden result stays in the player's own
 * record.
 *
 * The flags look for play that suggests the player already knew the answers, such as from an
 * earlier game under another player id:
 *
 * - `first-game`: a strong result from a player id the server has never seen finish a game.
 * - `flawless`: every entry solved with its first guess.
 * - `fast`: finished faster than seems possible while working the clues out.
 * - `faster-than-usual`: much faster than the player's own usual time.
 */
export type ReviewFlag = 'first-game' | 'flawless' | 'fast' | 'faster-than-usual';

/** The thresholds, in one place to tune once there's real play to look at. */
export const REVIEW = {
  /** A first game is "strong" at no more than this many guesses per entry. */
  strongGuessesPerEntry: 1.5,
  /** Under this many seconds per entry, from first guess or hint to finish, is `fast`. */
  fastSecondsPerEntry: 10,
  /** `faster-than-usual` needs at least this many earlier wins with a time... */
  usualGames: 3,
  /** ...and a time under this fraction of their median. */
  usualFraction: 1 / 3,
} as const;

/** What the server knows about a ranked win when it finishes. */
export interface ReviewFacts {
  readonly entries: number;
  readonly guesses: number;
  /** From the attempt's first guess or hint to its finish. */
  readonly seconds: number;
  /** Whether the player has finished any game before this one. */
  readonly firstGame: boolean;
  /** The player's times for earlier wins, in seconds. */
  readonly earlierSeconds: readonly number[];
}

export function reviewFlags(facts: ReviewFacts): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (facts.firstGame && facts.guesses <= facts.entries * REVIEW.strongGuessesPerEntry) {
    flags.push('first-game');
  }
  if (facts.guesses <= facts.entries) flags.push('flawless');
  if (facts.seconds < facts.entries * REVIEW.fastSecondsPerEntry) flags.push('fast');
  if (facts.earlierSeconds.length >= REVIEW.usualGames) {
    if (facts.seconds < median(facts.earlierSeconds) * REVIEW.usualFraction) {
      flags.push('faster-than-usual');
    }
  }
  return flags;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type ReviewDecision = 'keep' | 'hide';

/** A flagged result, as the admin command lists it. */
export interface FlaggedResult {
  readonly puzzleId: string;
  readonly playerId: string;
  readonly nickname: string | null;
  readonly guesses: number;
  readonly crosswordHints: number;
  readonly wordleHints: number;
  readonly seconds: number | null;
  readonly flags: readonly ReviewFlag[];
  readonly finishedAt: string;
  /** `null` while awaiting a decision. */
  readonly decision: ReviewDecision | null;
  readonly reviewedAt: string | null;
}

export class ReviewError extends Error {}

/** The admin's side of review: the flagged results, and a decision on each. */
export class Review {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Flagged ranked results, oldest first: those awaiting a decision, or every one with `all`. */
  flagged(all = false): FlaggedResult[] {
    const rows = this.db
      .prepare(
        `SELECT r.puzzle_id, r.player_id, p.nickname, r.guesses, r.crossword_hints, r.wordle_hints,
                r.started_at, r.finished_at, r.review_flags, r.hidden, r.reviewed_at
           FROM results r JOIN players p ON p.id = r.player_id
          WHERE r.ranked = 1 AND r.review_flags IS NOT NULL
            ${all ? '' : 'AND r.reviewed_at IS NULL'}
          ORDER BY r.finished_at, r.puzzle_id, r.player_id`,
      )
      .all() as {
      puzzle_id: string;
      player_id: string;
      nickname: string | null;
      guesses: number;
      crossword_hints: number;
      wordle_hints: number;
      started_at: string | null;
      finished_at: string;
      review_flags: string;
      hidden: number;
      reviewed_at: string | null;
    }[];
    return rows.map((row) => ({
      puzzleId: row.puzzle_id,
      playerId: row.player_id,
      nickname: row.nickname,
      guesses: row.guesses,
      crosswordHints: row.crossword_hints,
      wordleHints: row.wordle_hints,
      seconds:
        row.started_at === null
          ? null
          : Math.round((Date.parse(row.finished_at) - Date.parse(row.started_at)) / 1000),
      flags: JSON.parse(row.review_flags) as ReviewFlag[],
      finishedAt: row.finished_at,
      decision: row.reviewed_at === null ? null : row.hidden === 1 ? 'hide' : 'keep',
      reviewedAt: row.reviewed_at,
    }));
  }

  /**
   * Records an admin's decision on a player's result for a puzzle: `hide` takes it off the
   * leaderboard, `keep` leaves it on (and undoes an earlier `hide`). `player` is the player id
   * or a unique prefix of at least 8 characters, as the list shows it. Any result can be decided,
   * flagged or not. Returns the full player id.
   */
  decide(puzzleId: string, player: string, decision: ReviewDecision): string {
    const prefix = player.trim().toLowerCase();
    if (!/^[0-9a-f-]{8,36}$/.test(prefix)) {
      throw new ReviewError('Give the player id, or at least its first 8 characters.');
    }
    const matches = this.db
      .prepare(`SELECT player_id FROM results WHERE puzzle_id = ? AND substr(player_id, 1, ?) = ?`)
      .all(puzzleId, prefix.length, prefix) as { player_id: string }[];
    if (matches.length === 0) {
      throw new ReviewError(`No result for player ${prefix} on ${puzzleId}.`);
    }
    if (matches.length > 1) {
      throw new ReviewError(`More than one player starts ${prefix} on ${puzzleId}: give more.`);
    }
    const playerId = matches[0]!.player_id;
    this.db
      .prepare(
        'UPDATE results SET hidden = ?, reviewed_at = ? WHERE puzzle_id = ? AND player_id = ?',
      )
      .run(decision === 'hide' ? 1 : 0, this.now().toISOString(), puzzleId, playerId);
    return playerId;
  }
}
