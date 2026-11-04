import type { DatabaseSync } from 'node:sqlite';

/**
 * Rate limits on the forms (nicknames, recovery codes, feature requests), counted in the `submissions` table per
 * player id and per visitor address. Addresses are kept only for this, and only for 30 days.
 */

/** How many submissions of a kind a player, or a visitor address, may make in the window. */
export interface Limit {
  readonly perPlayer: number;
  readonly perAddress: number;
  readonly windowMs: number;
}

const HOUR = 60 * 60 * 1000;

export const NICKNAME_LIMIT: Limit = { perPlayer: 5, perAddress: 20, windowMs: HOUR };
/** Making a recovery code (each new one replaces the last). */
export const RECOVERY_CODE_LIMIT: Limit = { perPlayer: 5, perAddress: 20, windowMs: HOUR };
/**
 * Trying a recovery code. The address limit is the one that counts against guessing (a guesser
 * can make up player ids); with codes of 100 random bits, ten tries an hour gets nowhere.
 */
export const RESTORE_LIMIT: Limit = { perPlayer: 10, perAddress: 10, windowMs: HOUR };
/**
 * Bot checks on any form, passed or failed. Generous, so a real player never meets it; it's what
 * stops junk tokens making the server call Cloudflare without end.
 */
export const BOT_CHECK_LIMIT: Limit = { perPlayer: 30, perAddress: 60, windowMs: HOUR };
/** Sending a feature request. */
export const FEEDBACK_LIMIT: Limit = { perPlayer: 3, perAddress: 10, windowMs: HOUR };

/** Submission records older than this are deleted. */
const KEEP_SUBMISSIONS_MS = 30 * 24 * HOUR;

export class RateLimits {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Counts a submission against its limits. Returns false, without counting it, if the player or
   * the address has used up the window. Old records are pruned on the way.
   */
  allow(kind: string, playerId: string, ip: string, limit: Limit): boolean {
    const now = this.now().getTime();
    const since = new Date(now - limit.windowMs).toISOString();
    this.db
      .prepare('DELETE FROM submissions WHERE at < ?')
      .run(new Date(now - KEEP_SUBMISSIONS_MS).toISOString());
    const count = (column: 'player_id' | 'ip', value: string) =>
      (
        this.db
          .prepare(
            `SELECT count(*) AS n FROM submissions WHERE kind = ? AND ${column} = ? AND at >= ?`,
          )
          .get(kind, value, since) as { n: number }
      ).n;
    if (count('player_id', playerId) >= limit.perPlayer || count('ip', ip) >= limit.perAddress) {
      return false;
    }
    this.log(kind, playerId, ip);
    return true;
  }

  /** Records a submission that isn't limited itself (such as a successful restore), for 30 days. */
  log(kind: string, playerId: string, ip: string): void {
    this.db
      .prepare('INSERT INTO submissions (kind, player_id, ip, at) VALUES (?, ?, ?, ?)')
      .run(kind, playerId, ip, this.now().toISOString());
  }
}
