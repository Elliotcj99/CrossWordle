const KEY = 'crosswordle:player';

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
    if (saved !== null && /^[0-9a-f-]{36}$/.test(saved)) return (current = saved);
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
