import type { DatabaseSync } from 'node:sqlite';

/**
 * Players' nicknames. A nickname belongs to the player id, not to a
 * game: changing it renames every result of theirs on the leaderboard. Different players may share
 * a nickname; the id keeps them apart.
 */

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
}
