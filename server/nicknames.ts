import type { DatabaseSync } from 'node:sqlite';

/**
 * Players' nicknames, and the rate limits on forms. A nickname belongs to the player id, not to a
 * game: changing it renames every result of theirs on the leaderboard. Different players may share
 * a nickname; the id keeps them apart.
 */

/** How many submissions of a kind a player, or a visitor address, may make in the window. */
export interface Limit {
  readonly perPlayer: number;
  readonly perAddress: number;
  readonly windowMs: number;
}

export const NICKNAME_LIMIT: Limit = { perPlayer: 5, perAddress: 20, windowMs: 60 * 60 * 1000 };

/** Submission records older than this are deleted: addresses are kept only for rate limits. */
const KEEP_SUBMISSIONS_MS = 30 * 24 * 60 * 60 * 1000;

export class Nicknames {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  nicknameOf(playerId: string): string | undefined {
    const row = this.db.prepare('SELECT nickname FROM players WHERE id = ?').get(playerId) as
      { nickname: string | null } | undefined;
    return row?.nickname ?? undefined;
  }

  /** Sets a player's nickname (the player must already exist: they've played). */
  setNickname(playerId: string, nickname: string): void {
    this.db
      .prepare('UPDATE players SET nickname = ?, nickname_at = ? WHERE id = ?')
      .run(nickname, this.now().toISOString(), playerId);
  }

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
    this.db
      .prepare('INSERT INTO submissions (kind, player_id, ip, at) VALUES (?, ?, ?, ?)')
      .run(kind, playerId, ip, new Date(now).toISOString());
    return true;
  }
}
