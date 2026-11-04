const KEY = 'crosswordle:player';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let current: string | undefined;

/**
 * This browser's player id: a random UUID made on first use and kept in localStorage, so the
 * server can tell players apart (two people may share a nickname). It's anonymous, and a new one
 * is made if storage is cleared. Where storage is blocked it lasts until the page closes.
 */
export function playerId(): string {
  if (current !== undefined) return current;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null && UUID.test(saved)) return (current = saved);
  } catch {
    // Blocked storage: fall through to an id for this page only.
  }
  current = crypto.randomUUID();
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // Blocked storage: the id isn't remembered.
  }
  return current;
}

/**
 * Switches this browser to another player id: the one a recovery code belongs to. Returns false
 * if storage is blocked, as the switch wouldn't outlast the page.
 */
export function switchPlayer(id: string): boolean {
  if (!UUID.test(id)) return false;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    return false;
  }
  current = id;
  return true;
}

/**
 * Forgets the player in this browser: their id, nickname, saved games and results. Settings (high
 * contrast) stay, as they aren't about the player. The next request makes a new id.
 */
export function forgetPlayer(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) {
      if (key?.startsWith('crosswordle:') && key !== 'crosswordle:settings') {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Blocked storage: nothing was kept here to forget.
  }
  current = undefined;
}
