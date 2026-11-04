import { clientPuzzleFor, json } from '../../functions/api/_shared';
import type { Config } from '../config';
import { nicknameAllowed, tidyNickname } from '../moderation';
import { NICKNAME_LIMIT, type Nicknames } from '../nicknames';
import type { Handler } from '../node-adapter';
import { playerIdFrom, type Records } from '../records';
import { verifyTurnstile } from '../turnstile';

/**
 * POST /api/nickname `{ puzzleId, nickname, turnstileToken? }`: names the player on the
 * leaderboard after they finish a puzzle. The score isn't sent: it's the server's own record of
 * their game. Replies with the nickname and that result, so the page can say whether it's ranked.
 */

export interface NicknameServices {
  readonly records: Records;
  readonly nicknames: Nicknames;
  readonly config: Config;
  readonly rudeWords: ReadonlySet<string>;
}

interface NicknameBody {
  readonly puzzleId?: unknown;
  readonly nickname?: unknown;
  readonly turnstileToken?: unknown;
}

export function nickname({ records, nicknames, config, rudeWords }: NicknameServices): Handler {
  return async ({ request }) => {
    const playerId = playerIdFrom(request);
    let body: NicknameBody;
    try {
      body = (await request.json()) as NicknameBody;
    } catch {
      return json({ error: 'bad-request' }, 400);
    }
    if (playerId === undefined || typeof body !== 'object' || body === null) {
      return json({ error: 'bad-request' }, 400);
    }
    if (typeof body.puzzleId !== 'string' || clientPuzzleFor(body.puzzleId) === undefined) {
      return json({ error: 'unknown-puzzle' }, 404);
    }

    const result = records.result(playerId, body.puzzleId);
    if (result === undefined) return json({ error: 'not-finished' }, 409);

    const ip = request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
    if (!nicknames.allow('nickname', playerId, ip, NICKNAME_LIMIT)) {
      return json({ error: 'too-many' }, 429);
    }

    const name = typeof body.nickname === 'string' ? tidyNickname(body.nickname) : undefined;
    if (name === undefined) return json({ error: 'nickname-invalid' }, 400);
    if (!nicknameAllowed(name, rudeWords)) return json({ error: 'nickname-not-allowed' }, 422);

    if (config.turnstile !== undefined) {
      const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
      const passed = await verifyTurnstile({
        secretKey: config.turnstile.secretKey,
        token,
        ...(ip === 'unknown' ? {} : { ip }),
      });
      if (!passed) return json({ error: 'check-failed' }, 403);
    }

    nicknames.setNickname(playerId, name);
    return json({ nickname: name, result });
  };
}
