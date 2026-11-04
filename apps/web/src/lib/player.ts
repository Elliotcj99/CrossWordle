import { rememberNickname } from './nickname';
import { clearResults } from './results';
import { clearSavedGames } from './storage';

const KEY = 'crosswordle:player';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let current: string | undefined;

/**
 * This browser's player id: a random UUID made on first use and kept in localStorage, so the
 * server can tell players apart (two people may share a nickname). It's anonymous, and a new one
 * is made if storage is cleared. Where storage is blocked it lasts until the page closes.
 */
export function playerId(): string {
  // Read each time: another tab may have switched player (a restore) or forgotten this one.
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null && UUID.test(saved)) return (current = saved);
  } catch {
    // Blocked storage: fall through to an id for this page only.
  }
  if (current !== undefined) return current;
  current = crypto.randomUUID();
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // Blocked storage: the id isn't remembered.
  }
  return current;
}

/**
 * Everything this browser keeps about the player (saved games, results, nickname), cleared when
 * the player changes, so one player's games never carry on under another's id. Each module clears
 * its own. Settings (high contrast) aren't about the player and stay.
 */
function clearPlayerState(): void {
  clearSavedGames();
  clearResults();
  rememberNickname(undefined);
}

/**
 * Switches this browser to another player id (the one a recovery code belongs to), starting from
 * that player's own record: their games and results come from the server. Returns false if
 * storage is blocked, as the switch wouldn't outlast the page.
 */
export function switchPlayer(id: string, nickname: string | undefined): boolean {
  if (!UUID.test(id)) return false;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    return false;
  }
  clearPlayerState();
  rememberNickname(nickname);
  current = id;
  return true;
}

/**
 * The server says `id` was deleted: forget it here, unless this browser has moved on to another
 * player since (a stale tab's request must not wipe the current player).
 */
export function forgetPlayerIfStill(id: string): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    // Blocked storage: compare with this page's id instead.
  }
  if ((stored ?? current) === id) forgetPlayer();
}

/** Forgets the player in this browser (their record was deleted). The next request makes a new id. */
export function forgetPlayer(): void {
  clearPlayerState();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Blocked storage: the id wasn't kept.
  }
  current = undefined;
}
