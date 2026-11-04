import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import { Review, ReviewError, reviewFlags, type ReviewFacts } from '../review';

describe('reviewFlags', () => {
  // Nine entries: an ordinary game takes a while and a few guesses.
  const ordinary: ReviewFacts = {
    entries: 9,
    guesses: 20,
    seconds: 600,
    firstGame: false,
    earlierSeconds: [],
  };

  it('flags nothing in an ordinary game', () => {
    expect(reviewFlags(ordinary)).toEqual([]);
  });

  it('flags a strong first game, but not a middling one', () => {
    expect(reviewFlags({ ...ordinary, firstGame: true, guesses: 13 })).toEqual(['first-game']);
    expect(reviewFlags({ ...ordinary, firstGame: true, guesses: 14 })).toEqual([]);
  });

  it('flags every entry solved first time', () => {
    expect(reviewFlags({ ...ordinary, guesses: 9 })).toEqual(['flawless']);
  });

  it('flags a finish under ten seconds an entry', () => {
    expect(reviewFlags({ ...ordinary, seconds: 89 })).toEqual(['fast']);
    expect(reviewFlags({ ...ordinary, seconds: 90 })).toEqual([]);
  });

  it("flags a game under a third of the player's median, once there are three to go on", () => {
    expect(reviewFlags({ ...ordinary, seconds: 199, earlierSeconds: [600, 900, 300] })).toEqual([
      'faster-than-usual',
    ]);
    expect(reviewFlags({ ...ordinary, seconds: 200, earlierSeconds: [600, 900, 300] })).toEqual([]);
    expect(reviewFlags({ ...ordinary, seconds: 100, earlierSeconds: [600, 900] })).toEqual([]);
  });
});

describe('Review', () => {
  const ALICE = '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f';
  const ALICE_TWIN = '0b6f8f4e-ffff-4d3b-9e5f-1a2b3c4d5e6f';
  let db: DatabaseSync;
  let review: Review;

  function result(player: string, flags: string | null) {
    db.prepare('INSERT OR IGNORE INTO players (id, created_at) VALUES (?, ?)').run(
      player,
      '2026-11-04T09:00:00Z',
    );
    db.prepare(
      `INSERT INTO results (player_id, puzzle_id, attempt, won, guesses, crossword_hints,
         wordle_hints, ranked, started_at, finished_at, review_flags)
       VALUES (?, 'ring', 1, 1, 4, 0, 0, 1, '2026-11-04T09:00:00Z', '2026-11-04T09:00:30Z', ?)`,
    ).run(player, flags);
  }

  beforeEach(() => {
    db = openDatabase(':memory:');
    review = new Review(db, () => new Date('2026-11-05T08:00:00Z'));
    result(ALICE, '["first-game","fast"]');
  });

  it('lists flagged results awaiting a decision', () => {
    expect(review.flagged()).toEqual([
      {
        puzzleId: 'ring',
        playerId: ALICE,
        nickname: null,
        guesses: 4,
        crosswordHints: 0,
        wordleHints: 0,
        seconds: 30,
        flags: ['first-game', 'fast'],
        finishedAt: '2026-11-04T09:00:30Z',
        decision: null,
        reviewedAt: null,
      },
    ]);
  });

  it('hides a result, and keeps it again, by a short player id', () => {
    expect(review.decide('ring', ALICE.slice(0, 13), 'hide')).toBe(ALICE);
    expect(review.flagged()).toEqual([]);
    expect(review.flagged(true)).toMatchObject([{ decision: 'hide' }]);
    expect(db.prepare('SELECT hidden FROM results').get()).toEqual({ hidden: 1 });

    review.decide('ring', ALICE, 'keep');
    expect(review.flagged(true)).toMatchObject([
      { decision: 'keep', reviewedAt: '2026-11-05T08:00:00.000Z' },
    ]);
    expect(db.prepare('SELECT hidden FROM results').get()).toEqual({ hidden: 0 });
  });

  it('refuses a player id that is too short, unknown or ambiguous', () => {
    result(ALICE_TWIN, null);
    expect(() => review.decide('ring', '0b6f', 'hide')).toThrow(ReviewError);
    expect(() => review.decide('ring', 'ffffffff', 'hide')).toThrow(/No result/);
    expect(() => review.decide('ring', '0b6f8f4e', 'hide')).toThrow(/More than one/);
    expect(() => review.decide('other', ALICE, 'hide')).toThrow(/No result/);
  });
});
