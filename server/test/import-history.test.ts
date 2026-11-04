import { describe, expect, it } from 'vitest';
import { puzzleIds } from '../../functions/api/_shared';
import { importHistory } from '../api/import-history';
import { openDatabase } from '../db';
import { Records } from '../records';

const PLAYER = '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f';

// The earliest dated daily puzzle in the bundle, and "now" a day after it.
const first = puzzleIds()
  .filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id))
  .sort()[0]!;
const now = () => new Date(`${first}T12:00:00Z`);

function post(body: unknown, playerId: string | null = PLAYER) {
  return new Request('http://localhost/api/import-history', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(playerId === null ? {} : { 'x-player-id': playerId }),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/import-history', () => {
  it('copies released puzzles only: not the sample, unknown ids or ones not out yet', async () => {
    const records = new Records(openDatabase(':memory:'));
    const handler = importHistory(records, now);
    const later = puzzleIds()
      .filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id) && id > first)
      .sort()
      .at(-1)!;
    const response = await handler({
      request: post({
        results: {
          [first]: { won: false, guesses: 2 },
          sample: { won: false, guesses: 1 },
          '1999-01-01': { won: false, guesses: 1 },
          [later]: { won: false, guesses: 1 },
          ['__proto__']: { won: false, guesses: 1 },
        },
      }),
    });
    expect(await response.json()).toEqual({ imported: 1 });
    expect(records.importedHistory(PLAYER)).toEqual([{ puzzleId: first, won: false, guesses: 2 }]);
  });

  it('refuses a request without a player id or results', async () => {
    const handler = importHistory(new Records(openDatabase(':memory:')), now);
    expect((await handler({ request: post({ results: {} }, null) })).status).toBe(400);
    expect((await handler({ request: post({ nothing: true }) })).status).toBe(400);
  });
});
