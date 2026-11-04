import { clientPuzzleFor, json } from '../../functions/api/_shared';
import type { Config } from '../config';
import { nicknameAllowed, tidyNickname } from '../moderation';
import type { Nicknames } from '../nicknames';
import type { Handler } from '../node-adapter';
import { NICKNAME_LIMIT, type RateLimits } from '../rate-limits';
import { playerIdFrom, type Records } from '../records';
import { clientAddress, jsonBody, passesBotCheck } from './forms';

/**
 * POST /api/nickname `{ puzzleId, nickname, turnstileToken? }`: names the player on the
 * leaderboard after they finish a puzzle. The score isn't sent: it's the server's own record of
 * their game. Replies with the nickname and that result, so the page can say whether it's ranked.
 */

export interface NicknameServices {
  readonly records: Records;
  readonly nicknames: Nicknames;
  readonly limits: RateLimits;
  readonly config: Config;
  readonly rudeWords: ReadonlySet<string>;
}

export function nickname(services: NicknameServices): Handler {
  const { records, nicknames, limits, config, rudeWords } = services;
  return async ({ request }) => {
    const playerId = playerIdFrom(request);
    const body = await jsonBody<{ puzzleId: unknown; nickname: unknown; turnstileToken: unknown }>(
      request,
    );
    if (playerId === undefined || body === undefined) return json({ error: 'bad-request' }, 400);
    if (typeof body.puzzleId !== 'string' || clientPuzzleFor(body.puzzleId) === undefined) {
      return json({ error: 'unknown-puzzle' }, 404);
    }

    const result = records.result(playerId, body.puzzleId);
    if (result === undefined) return json({ error: 'not-finished' }, 409);

    const ip = clientAddress(request);
    if (!limits.allow('nickname', playerId, ip, NICKNAME_LIMIT)) {
      return json({ error: 'too-many' }, 429);
    }

    const name = typeof body.nickname === 'string' ? tidyNickname(body.nickname) : undefined;
    if (name === undefined) return json({ error: 'nickname-invalid' }, 400);
    if (!nicknameAllowed(name, rudeWords)) return json({ error: 'nickname-not-allowed' }, 422);

    if (!(await passesBotCheck(config, body.turnstileToken, ip))) {
      return json({ error: 'check-failed' }, 403);
    }

    nicknames.setNickname(playerId, name);
    return json({ nickname: name, result });
  };
}
