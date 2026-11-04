import type { HintLetter, ScoredLetter } from '@crosswordle/engine';
import { features } from './features';
import { forgetPlayerIfStill, playerId } from './player';

/** Every API request carries the player id, so the server can keep its record of their game. */
function headers(): Record<string, string> {
  return { 'content-type': 'application/json', 'x-player-id': playerId() };
}

/**
 * `fetch` for the API. A 410 `forgotten` means the player id sent was deleted (in another tab,
 * say). If it's still this browser's, the browser forgets it too; either way the page reloads, to
 * carry on with whichever player this browser has now.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const sent = new Headers(init?.headers).get('x-player-id');
  const response = await fetch(path, init);
  if (response.status === 410 && sent !== null) {
    const { error } = await readJson<{ error?: string }>(response.clone());
    if (error === 'forgotten') {
      forgetPlayerIfStill(sent);
      location.reload();
    }
  }
  return response;
}

/** A reply's JSON body, or `{}` when it has none (an HTML error page from a proxy, say). */
async function readJson<T extends object>(response: Response): Promise<Partial<T>> {
  try {
    const body = (await response.json()) as unknown;
    return typeof body === 'object' && body !== null ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

/** What the scoring Function returns for a guess it accepted. */
export interface ScoredGuess {
  readonly letters: ScoredLetter[];
  readonly solved: boolean;
}

export class ScoringError extends Error {}

/**
 * Sends a guess to the scoring Function and returns how it scored. The answer never reaches the
 * browser; the server only reports the marks for this one guess. Throws `ScoringError` if the
 * request can't be completed (offline, server error), so the caller can tell the player to retry.
 */
export async function scoreGuess(
  puzzleId: string,
  entryId: string,
  guess: string,
): Promise<ScoredGuess> {
  let response: Response;
  try {
    response = await apiFetch('api/guess', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ puzzleId, entryId, guess }),
    });
  } catch {
    throw new ScoringError('Could not reach the scorer.');
  }
  if (!response.ok) throw new ScoringError(`The scorer returned ${response.status}.`);

  const data = (await response.json()) as Partial<ScoredGuess>;
  if (!Array.isArray(data.letters) || typeof data.solved !== 'boolean') {
    throw new ScoringError('The scorer sent an unexpected reply.');
  }
  return { letters: data.letters, solved: data.solved };
}

/** A Wordle-clue request either reveals a letter, finds nothing new, or fails. */
export type HintResult =
  | { readonly ok: true; readonly hint: HintLetter }
  | { readonly ok: false; readonly reason: 'none' | 'error' };

/**
 * Asks the server for a letter to reveal for an entry, given the guesses made so far and the
 * letters the grid already shows in it (`known`). The answer never reaches the browser; only the one
 * chosen letter comes back. `reason: 'none'` means every position is already known, so there's
 * nothing new to show.
 */
export async function requestHint(
  puzzleId: string,
  entryId: string,
  guesses: readonly string[],
  known: readonly HintLetter[],
): Promise<HintResult> {
  try {
    const response = await apiFetch('api/hint', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ puzzleId, entryId, guesses, known }),
    });
    if (response.status === 409) return { ok: false, reason: 'none' };
    if (!response.ok) return { ok: false, reason: 'error' };
    const data = (await response.json()) as Partial<HintLetter>;
    if (typeof data.index !== 'number' || typeof data.letter !== 'string') {
      return { ok: false, reason: 'error' };
    }
    return { ok: true, hint: { index: data.index, letter: data.letter } };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Asks the server for an entry's second clue (the Crossword-clue hint). The page only knows that
 * an entry has one, so revealing it always goes through the server, which records it. Returns
 * `undefined` if the request fails, so the caller can tell the player to retry.
 */
export async function requestCrosswordClue(
  puzzleId: string,
  entryId: string,
): Promise<string | undefined> {
  try {
    const response = await apiFetch('api/clue', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ puzzleId, entryId }),
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { clue?: unknown };
    return typeof data.clue === 'string' ? data.clue : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The player restarted the puzzle: their next attempt can't be ranked. The game carries on
 * whatever happens; false means the server hasn't heard (offline), so the page can say so again
 * later. Hosts without records (Cloudflare Pages) aren't asked.
 */
export async function reportRestart(puzzleId: string): Promise<boolean> {
  if (!(await features()).names.has('records')) return true;
  try {
    const response = await apiFetch('api/restart', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ puzzleId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** The server's record of a finished game, as it will appear on the leaderboard. */
export interface RecordedResult {
  readonly won: boolean;
  readonly guesses: number;
  readonly crosswordHints: number;
  readonly wordleHints: number;
  readonly ranked: boolean;
  readonly unrankedReason: 'lost' | 'restarted' | null;
}

export type NicknameOutcome =
  | { readonly ok: true; readonly nickname: string; readonly result: RecordedResult }
  | { readonly ok: false; readonly message: string };

const NICKNAME_ERRORS: Readonly<Record<string, string>> = {
  'nickname-invalid': 'Use 2 to 20 letters, digits, spaces, dots, dashes or underscores.',
  'nickname-not-allowed': 'Please choose a different nickname.',
  'too-many': 'Too many tries. Please wait a while and try again.',
  'check-failed': "The bot check didn't go through. Please try again.",
  'not-finished': "The server hasn't seen this game finish, so it can't be named.",
};

/**
 * Names the player on the leaderboard for this puzzle. The score isn't sent: the server uses its
 * own record of the game, and replies with it.
 */
export async function submitNickname(
  puzzleId: string,
  nickname: string,
  turnstileToken: string | undefined,
): Promise<NicknameOutcome> {
  try {
    const response = await apiFetch('api/nickname', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ puzzleId, nickname, turnstileToken }),
    });
    const data = await readJson<{ error: string; nickname: string; result: RecordedResult }>(
      response,
    );
    if (response.ok && data.nickname !== undefined && data.result !== undefined) {
      return { ok: true, nickname: data.nickname, result: data.result };
    }
    return {
      ok: false,
      message: NICKNAME_ERRORS[data.error ?? ''] ?? 'Something went wrong. Please try again.',
    };
  } catch {
    return {
      ok: false,
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }
}

/** A request to the recovery endpoints either works or has a message for the player. */
export type Outcome<T> =
  ({ readonly ok: true } & T) | { readonly ok: false; readonly message: string };

const RECOVERY_ERRORS: Readonly<Record<string, string>> = {
  'too-many': 'Too many tries. Please wait a while and try again.',
  'check-failed': "The bot check didn't go through. Please try again.",
  'code-invalid':
    "That isn't a recovery code: they're 20 letters and digits, like ABCDE-FGHJK-MNPQR-STVWX.",
  'code-unknown':
    "That code isn't one we know. Check it, and use your newest code: making a new one replaces the old.",
};

async function recoveryRequest<T>(path: string, init: RequestInit): Promise<Outcome<T>> {
  try {
    const response = await apiFetch(path, { ...init, headers: headers() });
    const data = await readJson<T & { error: string }>(response);
    if (response.ok) return { ok: true, ...(data as T) };
    return {
      ok: false,
      message: RECOVERY_ERRORS[data.error ?? ''] ?? 'Something went wrong. Please try again.',
    };
  } catch {
    return {
      ok: false,
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }
}

/** Whether this player has made a recovery code. */
export function recoveryCodeStatus(): Promise<Outcome<{ hasCode: boolean }>> {
  return recoveryRequest('api/recovery-code', { method: 'GET' });
}

/** Makes a new recovery code for this player, replacing any earlier one. Shown once. */
export function makeRecoveryCode(): Promise<Outcome<{ code: string }>> {
  return recoveryRequest('api/recovery-code', { method: 'POST', body: '{}' });
}

/** The player a recovery code belongs to, for this browser to switch to. */
export function restoreRecord(
  code: string,
  turnstileToken: string | undefined,
): Promise<Outcome<{ playerId: string; nickname?: string }>> {
  return recoveryRequest('api/restore', {
    method: 'POST',
    body: JSON.stringify({ code, turnstileToken }),
  });
}

/** One row of a puzzle's leaderboard. */
export interface BoardEntry {
  readonly rank: number;
  readonly nickname: string;
  readonly guesses: number;
  readonly crosswordHints: number;
  readonly wordleHints: number;
  readonly finishedAt: string;
  readonly isYou: boolean;
}

/** Where this player stands on a puzzle's board, if they've finished it. */
export type YourPlace =
  | { readonly status: 'on-board' | 'no-nickname'; readonly rank: number }
  | { readonly status: 'not-ranked'; readonly reason: 'lost' | 'restarted' }
  | { readonly status: 'hidden' };

export interface Board {
  readonly puzzleId: string;
  readonly entries: readonly BoardEntry[];
  readonly total: number;
  readonly you?: YourPlace;
}

/** A puzzle's leaderboard, or `undefined` if it couldn't be fetched. */
export async function fetchLeaderboard(puzzleId: string): Promise<Board | undefined> {
  try {
    const response = await apiFetch(`api/leaderboard?puzzle=${encodeURIComponent(puzzleId)}`, {
      headers: headers(),
    });
    if (!response.ok) return undefined;
    const board = (await response.json()) as Board;
    return Array.isArray(board.entries) ? board : undefined;
  } catch {
    return undefined;
  }
}

/** A finished puzzle in the server's record of this player. */
export interface RecordedFinish extends RecordedResult {
  readonly puzzleId: string;
  readonly finishedAt: string;
}

/** A finished puzzle copied from a browser's history, from before the server kept records. */
export interface ImportedFinish {
  readonly puzzleId: string;
  readonly won: boolean;
  readonly guesses: number;
}

/** The server's record of this player's finished puzzles. */
export interface FinishedRecord {
  readonly results: readonly RecordedFinish[];
  /** History from before the server kept records: won and guesses only, never ranked. */
  readonly imported: readonly ImportedFinish[];
}

function finishes<T extends ImportedFinish>(list: unknown): T[] {
  return Array.isArray(list)
    ? list.filter(
        (r): r is T =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as T).puzzleId === 'string' &&
          typeof (r as T).won === 'boolean' &&
          typeof (r as T).guesses === 'number',
      )
    : [];
}

/** Every puzzle this player has finished, as the server has it; empty if it can't be fetched. */
export async function fetchRecord(): Promise<FinishedRecord> {
  try {
    const response = await apiFetch('api/record', { headers: headers() });
    if (!response.ok) return { results: [], imported: [] };
    const data = (await response.json()) as { results?: unknown; imported?: unknown };
    return {
      results: finishes<RecordedFinish>(data.results),
      imported: finishes<ImportedFinish>(data.imported),
    };
  } catch {
    return { results: [], imported: [] };
  }
}

/**
 * TEMPORARY, a one-off: remove by Friday 6 November 2026, with the server's endpoint.
 *
 * Sends the puzzles this browser finished to the server, to keep as the player's history from
 * before it kept records. True once the server has them (the page then never sends them again).
 */
export async function importHistory(
  results: Readonly<Record<string, { won: boolean; guesses: number }>>,
): Promise<boolean> {
  try {
    const response = await apiFetch('api/import-history', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ results }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * This player's current game of a puzzle as the server has it (unchecked: the caller checks it
 * against the puzzle), or `undefined` if they haven't played it there or it can't be fetched.
 */
export async function fetchGame(puzzleId: string): Promise<unknown> {
  try {
    const response = await apiFetch(`api/game?puzzle=${encodeURIComponent(puzzleId)}`, {
      headers: headers(),
    });
    if (!response.ok) return undefined;
    return ((await response.json()) as { game?: unknown }).game;
  } catch {
    return undefined;
  }
}

/** The site's contact address, or `undefined` if it has none or it can't be fetched. */
export async function fetchContact(): Promise<string | undefined> {
  try {
    const response = await fetch('api/contact');
    if (!response.ok) return undefined;
    const data = (await response.json()) as { email?: unknown };
    return typeof data.email === 'string' ? data.email : undefined;
  } catch {
    return undefined;
  }
}

/** Asks the server to delete everything it keeps about this player. True once it has. */
export async function forgetMe(): Promise<boolean> {
  try {
    const response = await apiFetch('api/forget', {
      method: 'POST',
      headers: headers(),
      body: '{}',
    });
    return response.ok;
  } catch {
    return false;
  }
}

const FEEDBACK_ERRORS: Readonly<Record<string, string>> = {
  'title-invalid': 'Give it a short title: 3 to 100 characters.',
  'description-invalid': 'Tell us a bit more: 10 to 2,000 characters.',
  'too-many': 'Thanks for all the ideas! Please wait a while before sending more.',
  'check-failed': "The bot check didn't go through. Please try again.",
};

/** Sends a feature request. */
export async function sendFeedback(
  title: string,
  description: string,
  turnstileToken: string | undefined,
): Promise<Outcome<{ id: number }>> {
  try {
    const response = await apiFetch('api/feedback', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ title, description, turnstileToken }),
    });
    const data = await readJson<{ id: number; error: string }>(response);
    if (response.ok && typeof data.id === 'number') return { ok: true, id: data.id };
    return {
      ok: false,
      message: FEEDBACK_ERRORS[data.error ?? ''] ?? 'Something went wrong. Please try again.',
    };
  } catch {
    return {
      ok: false,
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }
}
