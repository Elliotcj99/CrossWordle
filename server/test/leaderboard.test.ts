import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { leaderboard as leaderboardHandler } from '../api/leaderboard';
import { openDatabase } from '../db';
import { BOARD_SIZE, Leaderboard } from '../leaderboard';

let db: DatabaseSync;
let boards: Leaderboard;
let next = 0;

/** A player id that passes the server's UUID check. */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface Finish {
  readonly nickname?: string | null;
  readonly guesses?: number;
  readonly crossword?: number;
  readonly wordle?: number;
  readonly at?: string;
  readonly ranked?: boolean;
  readonly reason?: 'lost' | 'restarted';
  readonly hidden?: boolean;
  readonly puzzle?: string;
}

/** Adds a player and their finish of a puzzle; returns the player id. */
function finish(f: Finish = {}): string {
  const player = id(++next);
  db.prepare('INSERT INTO players (id, created_at, nickname) VALUES (?, ?, ?)').run(
    player,
    '2026-11-04T08:00:00Z',
    f.nickname === undefined ? `Player ${next}` : f.nickname,
  );
  const ranked = f.ranked ?? f.reason === undefined;
  db.prepare(
    `INSERT INTO results (player_id, puzzle_id, attempt, won, guesses, crossword_hints,
       wordle_hints, ranked, unranked_reason, hidden, finished_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    player,
    f.puzzle ?? 'sample',
    f.reason === 'lost' ? 0 : 1,
    f.guesses ?? 12,
    f.crossword ?? 0,
    f.wordle ?? 0,
    ranked ? 1 : 0,
    f.reason ?? null,
    f.hidden ? 1 : 0,
    f.at ?? '2026-11-04T09:00:00Z',
  );
  return player;
}

beforeEach(() => {
  db = openDatabase(':memory:');
  boards = new Leaderboard(db);
  next = 0;
});

describe('Leaderboard', () => {
  it('orders by guesses, then hints of both kinds, then the earliest finish', () => {
    finish({ nickname: 'Late', guesses: 10, at: '2026-11-04T10:00:00Z' });
    finish({ nickname: 'Hinted', guesses: 10, crossword: 1, at: '2026-11-04T08:30:00Z' });
    finish({ nickname: 'Best', guesses: 9, wordle: 3 });
    finish({ nickname: 'Early', guesses: 10, at: '2026-11-04T09:30:00Z' });

    const board = boards.board('sample');
    expect(board.entries.map((e) => [e.rank, e.nickname])).toEqual([
      [1, 'Best'],
      [2, 'Early'],
      [3, 'Late'],
      [4, 'Hinted'],
    ]);
    expect(board.entries[0]).toMatchObject({ guesses: 9, crosswordHints: 0, wordleHints: 3 });
    expect(board.total).toBe(4);
  });

  it('leaves out lost, restarted, hidden and unnamed games, and other puzzles', () => {
    finish({ nickname: 'On' });
    finish({ reason: 'lost' });
    finish({ reason: 'restarted' });
    finish({ hidden: true });
    finish({ nickname: null });
    finish({ puzzle: 'naughty-sample' });
    const board = boards.board('sample');
    expect(board.entries.map((e) => e.nickname)).toEqual(['On']);
    expect(board.total).toBe(1);
    expect(boards.board('naughty-sample').total).toBe(1);
  });

  it(`shows the top ${BOARD_SIZE}, and the rank of a player below them`, () => {
    for (let i = 0; i < BOARD_SIZE + 2; i++) finish({ guesses: 10 + i });
    const last = id(next);
    const board = boards.board('sample', last);
    expect(board.entries).toHaveLength(BOARD_SIZE);
    expect(board.total).toBe(BOARD_SIZE + 2);
    expect(board.entries.some((e) => e.isYou)).toBe(false);
    expect(board.you).toEqual({ status: 'on-board', rank: BOARD_SIZE + 2 });
  });

  it('marks the caller, without giving out anyone’s player id', () => {
    finish({ guesses: 9 });
    const me = finish({ guesses: 10 });
    const board = boards.board('sample', me);
    expect(board.entries.map((e) => e.isYou)).toEqual([false, true]);
    expect(board.you).toEqual({ status: 'on-board', rank: 2 });
    expect(JSON.stringify(board)).not.toContain('00000000-');
  });

  it('tells a player why they are not on the board', () => {
    finish({ guesses: 9 });
    expect(boards.board('sample', finish({ guesses: 8, nickname: null })).you).toEqual({
      status: 'no-nickname',
      rank: 1,
    });
    expect(boards.board('sample', finish({ reason: 'lost' })).you).toEqual({
      status: 'not-ranked',
      reason: 'lost',
    });
    expect(boards.board('sample', finish({ reason: 'restarted' })).you).toEqual({
      status: 'not-ranked',
      reason: 'restarted',
    });
    expect(boards.board('sample', finish({ hidden: true })).you).toEqual({ status: 'hidden' });
    expect(boards.board('sample', id(999)).you).toBeUndefined();
  });
});

describe('GET /api/leaderboard', () => {
  const get = (query: string) =>
    leaderboardHandler(boards)({
      request: new Request(`http://localhost/api/leaderboard${query}`),
    });

  it('serves a known puzzle’s board, and 404 for anything else', async () => {
    finish({ nickname: 'On' });
    const ok = await get('?puzzle=sample');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ puzzleId: 'sample', total: 1 });
    expect((await get('?puzzle=nope')).status).toBe(404);
    expect((await get('')).status).toBe(404);
  });
});
