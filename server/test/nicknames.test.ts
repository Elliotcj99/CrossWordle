import { beforeEach, describe, expect, it } from 'vitest';
import { parseConfig } from '../config';
import { openDatabase } from '../db';
import { Nicknames, type Limit } from '../nicknames';
import { verifyTurnstile } from '../turnstile';

const ALICE = '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f';
const BOB = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const limit: Limit = { perPlayer: 2, perAddress: 3, windowMs: 60_000 };

let nicknames: Nicknames;
let clock: number;

beforeEach(() => {
  clock = Date.parse('2026-11-04T09:00:00Z');
  const db = openDatabase(':memory:');
  for (const id of [ALICE, BOB]) {
    db.prepare('INSERT INTO players (id, created_at) VALUES (?, ?)').run(id, 'then');
  }
  nicknames = new Nicknames(db, () => new Date(clock));
});

describe('Nicknames', () => {
  it('stores and renames a player', () => {
    expect(nicknames.nicknameOf(ALICE)).toBeUndefined();
    nicknames.setNickname(ALICE, 'Word Wizard');
    nicknames.setNickname(ALICE, 'Grid Queen');
    expect(nicknames.nicknameOf(ALICE)).toBe('Grid Queen');
    expect(nicknames.nicknameOf(BOB)).toBeUndefined();
  });

  it('limits submissions per player and per address within the window', () => {
    expect(nicknames.allow('nickname', ALICE, '192.0.2.1', limit)).toBe(true);
    expect(nicknames.allow('nickname', ALICE, '192.0.2.1', limit)).toBe(true);
    expect(nicknames.allow('nickname', ALICE, '192.0.2.1', limit)).toBe(false); // player limit

    expect(nicknames.allow('nickname', BOB, '192.0.2.1', limit)).toBe(true);
    expect(nicknames.allow('nickname', BOB, '192.0.2.1', limit)).toBe(false); // address limit
    expect(nicknames.allow('nickname', BOB, '192.0.2.2', limit)).toBe(true);

    // Other kinds have their own counts, and the window moves on.
    expect(nicknames.allow('feedback', ALICE, '192.0.2.1', limit)).toBe(true);
    clock += 61_000;
    expect(nicknames.allow('nickname', ALICE, '192.0.2.1', limit)).toBe(true);
  });
});

describe('verifyTurnstile', () => {
  const reply = (body: unknown, status = 200) =>
    (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;

  it('passes only when Cloudflare says success', async () => {
    const check = { secretKey: 'secret', token: 'token', ip: '192.0.2.1' };
    expect(await verifyTurnstile(check, reply({ success: true }))).toBe(true);
    expect(await verifyTurnstile(check, reply({ success: false }))).toBe(false);
    expect(await verifyTurnstile(check, reply({ success: true }, 500))).toBe(false);
    expect(await verifyTurnstile(check, () => Promise.reject(new Error('offline')))).toBe(false);
  });

  it('sends the secret, token and address as a form, and skips an empty token', async () => {
    let sent: URLSearchParams | undefined;
    const capture = ((_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return Promise.resolve(new Response('{"success":true}'));
    }) as unknown as typeof fetch;
    await verifyTurnstile({ secretKey: 's', token: 't', ip: '192.0.2.1' }, capture);
    expect(Object.fromEntries(sent!)).toEqual({
      secret: 's',
      response: 't',
      remoteip: '192.0.2.1',
    });
    expect(await verifyTurnstile({ secretKey: 's', token: '' }, capture)).toBe(false);
  });
});

describe('parseConfig turnstile', () => {
  it('reads both keys, and refuses half a pair', () => {
    expect(parseConfig({ turnstile: { siteKey: 'site', secretKey: 'secret' } })).toEqual({
      turnstile: { siteKey: 'site', secretKey: 'secret' },
    });
    expect(() => parseConfig({ turnstile: { siteKey: 'site' } })).toThrow(/turnstile/);
  });
});
