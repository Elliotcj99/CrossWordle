import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { features } from '../api/features';
import { CACHE_MS, health } from '../api/health';
import { openDatabase } from '../db';
import { Health, playableDates } from '../health';

let db: DatabaseSync;
let folder: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  folder = mkdtempSync(join(tmpdir(), 'crosswordle-health-'));
});

afterEach(() => rmSync(folder, { recursive: true, force: true }));

/** Daily and Naughty ids from `first` for `days` days. */
function ids(first: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.parse(`${first}T00:00:00Z`) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return [day, `naughty-${day}`];
  }).flat();
}

const at = (iso: string) => () => new Date(iso);

describe('playableDates', () => {
  it('is every date a player somewhere can be on, from UTC−12 to UTC+14', () => {
    // 12:00 UTC: 00:00 on the 4th at UTC−12, 02:00 on the 5th at UTC+14.
    expect(playableDates(new Date('2026-11-04T12:00:00Z'))).toEqual(['2026-11-04', '2026-11-05']);
    // 10:30 UTC: still the 3rd at UTC−12, already the 5th at UTC+14.
    expect(playableDates(new Date('2026-11-04T10:30:00Z'))).toEqual([
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ]);
  });
});

describe('Health', () => {
  it('passes with a working database, a writable folder and today’s puzzles', () => {
    const report = new Health(
      db,
      folder,
      () => ids('2026-11-01', 30),
      at('2026-11-04T12:00:00Z'),
    ).check();
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => [c.name, c.ok])).toEqual([
      ['database', true],
      ['data folder', true],
      ["today's puzzles", true],
    ]);
    // Counted from the 5th, the latest date anyone is on.
    expect(report.runway.daily).toEqual({ last: '2026-11-30', daysLeft: 25 });
    expect(report.warning).toBeUndefined();
  });

  it('warns, but stays up, with under 7 days of puzzles left', () => {
    const report = new Health(
      db,
      folder,
      () => ids('2026-11-01', 10),
      at('2026-11-04T12:00:00Z'),
    ).check();
    expect(report.ok).toBe(true);
    expect(report.runway.naughty.daysLeft).toBe(5);
    expect(report.warning).toBe('puzzles');
  });

  it("fails without today's puzzles, or with an unwritable data folder", () => {
    const late = new Health(
      db,
      folder,
      () => ids('2026-11-01', 3),
      at('2026-11-04T12:00:00Z'),
    ).check();
    expect(late.ok).toBe(false);
    expect(late.checks[2]).toMatchObject({
      ok: false,
      detail: 'missing 2026-11-04, naughty-2026-11-04, 2026-11-05, naughty-2026-11-05',
    });

    const file = join(folder, 'not-a-folder');
    writeFileSync(file, '');
    const stuck = new Health(
      db,
      file,
      () => ids('2026-11-01', 30),
      at('2026-11-04T12:00:00Z'),
    ).check();
    expect(stuck.ok).toBe(false);
    expect(stuck.checks[1]).toMatchObject({ name: 'data folder', ok: false });
  });

  it('fails when the database is closed', () => {
    const closed = openDatabase(':memory:');
    closed.close();
    const report = new Health(
      closed,
      folder,
      () => ids('2026-11-01', 30),
      at('2026-11-04T12:00:00Z'),
    ).check();
    expect(report.checks[0]).toMatchObject({ name: 'database', ok: false });
  });
});

describe('GET /api/health', () => {
  const request = { request: new Request('http://localhost/api/health') };

  it('answers in one word, and keeps the answer for 30 seconds', async () => {
    let clock = 0;
    let puzzles = ids('2026-11-01', 30);
    const handler = health(
      new Health(db, folder, () => puzzles, at('2026-11-04T12:00:00Z')),
      () => clock,
    );

    const ok = await handler(request);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(await ok.json()).toEqual({ status: 'ok' });

    puzzles = [];
    clock = CACHE_MS - 1;
    expect((await handler(request)).status).toBe(200); // still the kept answer

    clock = CACHE_MS;
    const down = await handler(request);
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ status: 'down' });
  });

  it('says when the puzzles are running out', async () => {
    const handler = health(
      new Health(db, folder, () => ids('2026-11-01', 10), at('2026-11-04T12:00:00Z')),
    );
    expect(await (await handler(request)).json()).toEqual({ status: 'ok', warning: 'puzzles' });
  });
});

describe('GET /api/features', () => {
  it('counts a page load each time it is asked', async () => {
    let loads = 0;
    const handler = features({}, () => loads++);
    await handler({ request: new Request('http://localhost/api/features') });
    await handler({ request: new Request('http://localhost/api/features') });
    expect(loads).toBe(2);
  });
});
