import { rememberNickname } from './nickname';
import { clearResults } from './results';
import { clearSavedGames } from './storage';

const KEY = 'crosswordle:player';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let current: string | undefined;

// Whether to offer a recovery code to a browser that has just been given a new id: 'show' until
// the player restores, dismisses it or makes their first guess, then 'done'. A browser with no id
// is either new or one whose data was cleared (Safari clears a site's storage after 7 days without
// a visit); nothing left in it can tell which, so the offer suits both.
const PROMPT_KEY = 'crosswordle:restore-prompt';
const PROMPT_ENDED = 'crosswordle:restore-prompt-ended';

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
    // A deleted record's browser has 'done' already: it chose to start afresh.
    if (localStorage.getItem(PROMPT_KEY) === null) localStorage.setItem(PROMPT_KEY, 'show');
  } catch {
    // Blocked storage: the id isn't remembered (nor would a restored one be, so no offer).
  }
  return current;
}

/** Whether to offer this browser's new player a recovery code (see PROMPT_KEY). */
export function restorePromptWanted(): boolean {
  try {
    return localStorage.getItem(PROMPT_KEY) === 'show';
  } catch {
    return false;
  }
}

/** Stops offering a recovery code, for good, and tells the page (any banner showing goes). */
export function endRestorePrompt(): void {
  try {
    if (localStorage.getItem(PROMPT_KEY) === 'done') return;
    localStorage.setItem(PROMPT_KEY, 'done');
  } catch {
    // Blocked storage: there was no offer.
  }
  window.dispatchEvent(new Event(PROMPT_ENDED));
}

const OPEN_RESTORE = 'crosswordle:open-restore';

/** Asks "Your record" to open at its recovery-code form (the banner's link). */
export function openRestoreForm(): void {
  window.dispatchEvent(new Event(OPEN_RESTORE));
}

/** Calls `open` when the restore form is asked for. Returns a function that stops listening. */
export function onOpenRestoreForm(open: () => void): () => void {
  window.addEventListener(OPEN_RESTORE, open);
  return () => window.removeEventListener(OPEN_RESTORE, open);
}

/** Calls `ended` when the offer ends (endRestorePrompt). Returns a function that stops listening. */
export function onRestorePromptEnded(ended: () => void): () => void {
  window.addEventListener(PROMPT_ENDED, ended);
  return () => window.removeEventListener(PROMPT_ENDED, ended);
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
  endRestorePrompt();
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
  // Deleted on purpose: the new id that follows shouldn't be offered the old record back.
  endRestorePrompt();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Blocked storage: the id wasn't kept.
  }
  current = undefined;
}
