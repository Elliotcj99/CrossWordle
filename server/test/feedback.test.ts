import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { feedback as feedbackHandler } from '../api/feedback';
import { openDatabase } from '../db';
import { Feedback, FeedbackError, tidyFeedback } from '../feedback';
import { RateLimits } from '../rate-limits';
import { Records } from '../records';

const ALICE = '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f';
const BOB = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

let db: DatabaseSync;
let requests: Feedback;
let clock: number;

beforeEach(() => {
  db = openDatabase(':memory:');
  clock = Date.parse('2026-11-04T09:00:00Z');
  requests = new Feedback(db, () => new Date(clock));
});

describe('tidyFeedback', () => {
  it('keeps the title to one tidy line, and the description’s own lines', () => {
    expect(
      tidyFeedback('  Dark\tmode   please ', 'Line one  \r\nLine two\n\n\n\nLine three'),
    ).toEqual({
      title: 'Dark mode please',
      description: 'Line one\nLine two\n\nLine three',
    });
  });

  it('removes control characters, so nothing reaches the admin’s terminal as a command', () => {
    const tidy = tidyFeedback(
      'Red\u001b[31mtext\u0007',
      'Text\u001b]0;owned\u0007 with ‮override\u0000.',
    );
    expect(tidy).toEqual({
      title: 'Red [31mtext',
      description: 'Text ]0;owned with override .',
    });
  });

  it('counts characters, not bytes, and says which part is wrong', () => {
    expect(tidyFeedback('🎉'.repeat(100), 'Ten chars!')).toMatchObject({ title: '🎉'.repeat(100) });
    expect(tidyFeedback('🎉'.repeat(101), 'Ten chars!')).toEqual({ problem: 'title' });
    expect(tidyFeedback('Hi', 'Long enough text')).toEqual({ problem: 'title' });
    expect(tidyFeedback('A title', 'Too short')).toEqual({ problem: 'description' });
    expect(tidyFeedback('A title', 'x'.repeat(2001))).toEqual({ problem: 'description' });
    expect(tidyFeedback(5, 'Long enough text')).toEqual({ problem: 'title' });
  });
});

describe('Feedback', () => {
  it('lists open requests, shows one, and closes and reopens it', () => {
    const first = requests.add(ALICE, 'Dark mode', 'Please add a dark mode.');
    clock += 1000;
    const second = requests.add(BOB, 'Hints', 'More hints, please.');
    expect(requests.list().map((r) => r.id)).toEqual([first, second]);

    expect(requests.setStatus(first, 'closed')).toMatchObject({
      status: 'closed',
      closedAt: '2026-11-04T09:00:01.000Z',
    });
    expect(requests.list().map((r) => r.id)).toEqual([second]);
    expect(requests.list(true).map((r) => r.id)).toEqual([first, second]);
    expect(requests.setStatus(first, 'open')).toMatchObject({ status: 'open', closedAt: null });
    expect(() => requests.get(99)).toThrow(FeedbackError);
  });

  it('goes when the player deletes their record', () => {
    requests.add(ALICE, 'Dark mode', 'Please add a dark mode.');
    requests.add(BOB, 'Hints', 'More hints, please.');
    new Records(db).forget(ALICE);
    expect(requests.list().map((r) => r.playerId)).toEqual([BOB]);
  });
});

describe('POST /api/feedback', () => {
  const send = (body: unknown, player = ALICE) =>
    feedbackHandler({ feedback: requests, limits: new RateLimits(db), config: {} })({
      request: new Request('http://localhost/api/feedback', {
        method: 'POST',
        headers: { 'x-player-id': player, 'cf-connecting-ip': '192.0.2.1' },
        body: JSON.stringify(body),
      }),
    });

  it('stores a request and gives back its id', async () => {
    const response = await send({ title: 'Dark mode', description: 'Please add a dark mode.' });
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: number };
    expect(requests.get(id)).toMatchObject({ playerId: ALICE, title: 'Dark mode' });
    // Nothing about the visitor's address is kept with it.
    expect(JSON.stringify(db.prepare('SELECT * FROM feedback').all())).not.toContain('192.0.2.1');
  });

  it('says what is wrong, without using up a try', async () => {
    for (let i = 0; i < 5; i++) {
      const bad = await send({ title: 'Hi', description: 'Please add a dark mode.' });
      expect(await bad.json()).toEqual({ error: 'title-invalid' });
    }
    expect((await send({ title: 'Dark mode', description: 'Short' })).status).toBe(400);
    expect(
      (await send({ title: 'Dark mode', description: 'Please add a dark mode.' })).status,
    ).toBe(201);
  });

  it('allows three an hour per player', async () => {
    const ok = { title: 'Dark mode', description: 'Please add a dark mode.' };
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await send(ok)).status);
    expect(statuses).toEqual([201, 201, 201, 429]);
  });
});
