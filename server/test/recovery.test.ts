import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeRecoveryCode, recoveryStatus, restore, type RecoveryServices } from '../api/recovery';
import { openDatabase } from '../db';
import { Nicknames } from '../nicknames';
import { RateLimits } from '../rate-limits';
import { generateCode, normaliseCode, Recovery } from '../recovery';

const ALICE = '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f';
const NEW_BROWSER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

let db: DatabaseSync;
let recovery: Recovery;

beforeEach(() => {
  db = openDatabase(':memory:');
  recovery = new Recovery(db);
});

describe('recovery codes', () => {
  it('are four groups of five, from an alphabet without look-alikes, and differ every time', () => {
    const code = generateCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
    expect(generateCode()).not.toBe(code);
  });

  it('are read forgivingly: case, spaces, dashes, and O, I or L for 0 and 1', () => {
    expect(normaliseCode('abcde fghjk-mnpqr  stvwx')).toBe('ABCDEFGHJKMNPQRSTVWX');
    expect(normaliseCode('OOOOO-IIIII-LLLLL-00000')).toBe('00000111111111100000');
    expect(normaliseCode('ABCDE-FGHJK-MNPQR-STVWU')).toBeUndefined(); // U isn't used
    expect(normaliseCode('ABCDE-FGHJK-MNPQR')).toBeUndefined();
  });
});

describe('Recovery', () => {
  it('restores the player a code belongs to, with their nickname', () => {
    const code = recovery.create(ALICE);
    expect(recovery.restore(code)).toEqual({ playerId: ALICE });
    new Nicknames(db).setNickname(ALICE, 'Grid Queen');
    expect(recovery.restore(code.toLowerCase().replace(/-/g, ' '))).toEqual({
      playerId: ALICE,
      nickname: 'Grid Queen',
    });
  });

  it('keeps only a hash of the code', () => {
    const code = recovery.create(ALICE);
    const stored = JSON.stringify(db.prepare('SELECT * FROM players').all());
    expect(stored).not.toContain(normaliseCode(code));
  });

  it('replaces the old code with a new one', () => {
    expect(recovery.hasCode(ALICE)).toBe(false);
    const old = recovery.create(ALICE);
    const current = recovery.create(ALICE);
    expect(recovery.hasCode(ALICE)).toBe(true);
    expect(recovery.restore(old)).toBeUndefined();
    expect(recovery.restore(current)).toEqual({ playerId: ALICE });
  });

  it('knows nothing of a made-up code', () => {
    recovery.create(ALICE);
    expect(recovery.restore(generateCode())).toBeUndefined();
    expect(recovery.restore('not a code')).toBeUndefined();
  });
});

describe('recovery endpoints', () => {
  let services: RecoveryServices;

  beforeEach(() => {
    services = { recovery, limits: new RateLimits(db), config: {} };
  });

  const request = (player: string, body?: unknown, ip = '192.0.2.1') =>
    new Request('http://localhost/api/x', {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-player-id': player, 'cf-connecting-ip': ip },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  it('makes a code, then restores the player in another browser', async () => {
    const made = await makeRecoveryCode(services)({ request: request(ALICE, {}) });
    const { code } = (await made.json()) as { code: string };
    expect(await (await recoveryStatus(services)({ request: request(ALICE) })).json()).toEqual({
      hasCode: true,
    });

    const restored = await restore(services)({ request: request(NEW_BROWSER, { code }) });
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ playerId: ALICE });

    // The success is logged against the restored player, with the address.
    expect(
      db.prepare("SELECT player_id, ip FROM submissions WHERE kind = 'restored'").all(),
    ).toEqual([{ player_id: ALICE, ip: '192.0.2.1' }]);
  });

  it('refuses an unknown code, and limits tries per address however the player id changes', async () => {
    const tries = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        restore(services)({
          request: request(`f47ac10b-58cc-4372-a567-0e02b2c3d4${String(i).padStart(2, '0')}`, {
            code: generateCode(),
          }),
        }),
      ),
    );
    expect(tries.slice(0, 10).map((r) => r.status)).toEqual(Array(10).fill(404));
    expect(tries[10]!.status).toBe(429);
  });

  it('needs a player id', async () => {
    const response = await makeRecoveryCode(services)({
      request: new Request('http://localhost/api/recovery-code', { method: 'POST' }),
    });
    expect(response.status).toBe(400);
  });
});
