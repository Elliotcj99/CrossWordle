const KEY = 'crosswordle:nickname';

/**
 * The player's nickname as this browser remembers it, to fill in the nickname field. The server
 * has the real one; this is a convenience, and part of the player's state in this browser (see
 * `player.ts`).
 */
export function rememberedNickname(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** Remembers the nickname, or forgets it when `undefined`. */
export function rememberNickname(nickname: string | undefined): void {
  try {
    if (nickname === undefined) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, nickname);
  } catch {
    // Blocked storage: the field just won't be filled in next time.
  }
}
