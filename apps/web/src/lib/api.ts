import type { HintLetter, ScoredLetter } from '@crosswordle/engine';
import { features } from './features';
import { playerId } from './player';

/** Every API request carries the player id, so the server can keep its record of their game. */
function headers(): Record<string, string> {
  return { 'content-type': 'application/json', 'x-player-id': playerId() };
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
    response = await fetch('api/guess', {
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
 * Asks the server for a letter to reveal for an entry, given the guesses made so far. The answer
 * never reaches the browser; only the one chosen letter comes back. `reason: 'none'` means every
 * position is already green, so there's nothing new to show.
 */
export async function requestHint(
  puzzleId: string,
  entryId: string,
  guesses: readonly string[],
): Promise<HintResult> {
  try {
    const response = await fetch('api/hint', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ puzzleId, entryId, guesses }),
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
    const response = await fetch('api/clue', {
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
 * The player restarted the puzzle: their next attempt can't be ranked. Best effort: the game
 * carries on whatever happens, and hosts without records (Cloudflare Pages) aren't asked.
 */
export async function reportRestart(puzzleId: string): Promise<void> {
  if (!(await features()).names.has('records')) return;
  try {
    await fetch('api/restart', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ puzzleId }),
    });
  } catch {
    // Offline: the server's record misses this one; the game itself is unaffected.
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
    const response = await fetch('api/nickname', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ puzzleId, nickname, turnstileToken }),
    });
    const data = (await response.json()) as {
      error?: string;
      nickname?: string;
      result?: RecordedResult;
    };
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
  'code-unknown':
    "That code isn't one we know. Check it, and use your newest code: making a new one replaces the old.",
};

async function recoveryRequest<T>(path: string, init: RequestInit): Promise<Outcome<T>> {
  try {
    const response = await fetch(path, { ...init, headers: headers() });
    const data = (await response.json()) as T & { error?: string };
    if (response.ok) return { ok: true, ...data };
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
    const response = await fetch(`api/leaderboard?puzzle=${encodeURIComponent(puzzleId)}`, {
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

/** Every puzzle this player has finished, as the server has it; empty if it can't be fetched. */
export async function fetchRecord(): Promise<readonly RecordedFinish[]> {
  try {
    const response = await fetch('api/record', { headers: headers() });
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: unknown };
    return Array.isArray(data.results)
      ? data.results.filter(
          (r): r is RecordedFinish =>
            typeof r === 'object' &&
            r !== null &&
            typeof (r as RecordedFinish).puzzleId === 'string' &&
            typeof (r as RecordedFinish).won === 'boolean' &&
            typeof (r as RecordedFinish).guesses === 'number',
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * This player's current game of a puzzle as the server has it (unchecked: the caller checks it
 * against the puzzle), or `undefined` if they haven't played it there or it can't be fetched.
 */
export async function fetchGame(puzzleId: string): Promise<unknown> {
  try {
    const response = await fetch(`api/game?puzzle=${encodeURIComponent(puzzleId)}`, {
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
    const response = await fetch('api/forget', { method: 'POST', headers: headers(), body: '{}' });
    return response.ok;
  } catch {
    return false;
  }
}
