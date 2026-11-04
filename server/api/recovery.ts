import { json } from '../../functions/api/_shared';
import type { Config } from '../config';
import type { Handler } from '../node-adapter';
import { RECOVERY_CODE_LIMIT, RESTORE_LIMIT, type RateLimits } from '../rate-limits';
import { playerIdFrom } from '../records';
import { normaliseCode, type Recovery } from '../recovery';
import { clientAddress, jsonBody, botCheck } from './forms';

/**
 * Recovery codes (see `../recovery.ts`):
 *
 * - `GET /api/recovery-code`: `{ hasCode }`, whether this player has made one.
 * - `POST /api/recovery-code`: makes a new code for this player and returns it, once. It replaces
 *   any earlier code.
 * - `POST /api/restore` `{ code, turnstileToken? }`: the player id the code belongs to, and its
 *   nickname, for the browser to switch to. Rate-limited and bot-checked, as it's the one place a
 *   guess could be tried; each success is logged with the address.
 */

export interface RecoveryServices {
  readonly recovery: Recovery;
  readonly limits: RateLimits;
  readonly config: Config;
}

export function recoveryStatus({ recovery }: RecoveryServices): Handler {
  return ({ request }) => {
    const playerId = playerIdFrom(request);
    if (playerId === undefined) return Promise.resolve(json({ error: 'bad-request' }, 400));
    return Promise.resolve(json({ hasCode: recovery.hasCode(playerId) }));
  };
}

export function makeRecoveryCode({ recovery, limits }: RecoveryServices): Handler {
  return ({ request }) => {
    const playerId = playerIdFrom(request);
    if (playerId === undefined) return Promise.resolve(json({ error: 'bad-request' }, 400));
    if (!limits.allow('recovery-code', playerId, clientAddress(request), RECOVERY_CODE_LIMIT)) {
      return Promise.resolve(json({ error: 'too-many' }, 429));
    }
    return Promise.resolve(json({ code: recovery.create(playerId) }));
  };
}

export function restore({ recovery, limits, config }: RecoveryServices): Handler {
  return async ({ request }) => {
    const playerId = playerIdFrom(request);
    const body = await jsonBody<{ code: unknown; turnstileToken: unknown }>(request);
    if (playerId === undefined || body === undefined) return json({ error: 'bad-request' }, 400);

    // Something that can't be a code costs nothing (and reveals nothing), nor does a failed bot
    // check: the limit counts real tries at a code.
    const code = typeof body.code === 'string' ? normaliseCode(body.code) : undefined;
    if (code === undefined) return json({ error: 'code-invalid' }, 400);

    const ip = clientAddress(request);
    const check = await botCheck(config, limits, playerId, body.turnstileToken, ip);
    if (check === 'too-many') return json({ error: 'too-many' }, 429);
    if (check === 'failed') return json({ error: 'check-failed' }, 403);
    if (!limits.allow('restore', playerId, ip, RESTORE_LIMIT)) {
      return json({ error: 'too-many' }, 429);
    }

    const restored = recovery.restore(code);
    if (restored === undefined) return json({ error: 'code-unknown' }, 404);
    limits.log('restored', restored.playerId, ip);
    return json(restored);
  };
}
