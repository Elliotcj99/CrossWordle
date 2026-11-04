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
 * Tells a server that keeps records about something the page did on its own: a restart, or
 * revealing an entry's second clue (the page already has those clues). Best effort: the game
 * carries on whatever happens, and hosts without records (Cloudflare Pages) aren't asked.
 */
async function report(path: string, body: Record<string, string>): Promise<void> {
  if (!(await features()).names.has('records')) return;
  try {
    await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  } catch {
    // Offline: the server's record misses this one; the game itself is unaffected.
  }
}

/** The player restarted the puzzle: their next attempt can't be ranked. */
export function reportRestart(puzzleId: string): Promise<void> {
  return report('api/restart', { puzzleId });
}

/** The player revealed an entry's second (crossword) clue. */
export function reportCrosswordClue(puzzleId: string, entryId: string): Promise<void> {
  return report('api/clue', { puzzleId, entryId });
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
