import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { addDays, dateIn, daysBetween } from './dates';
import { MIGRATIONS, schemaVersion } from './db';

/**
 * Whether the site can serve a game right now. `GET /api/health` answers the uptime monitor with
 * one word (see `./api/health.ts`); `admin.mjs health` shows the detail on the server.
 *
 * The checks: the database answers and is at this release's schema; the data folder can be
 * written (recording a game needs it); the daily and Naughty puzzles exist for every date a
 * player can be on. The page picks the puzzle by the player's own date, so that's every date from
 * the earliest time zone (UTC−12) to the latest (UTC+14). A warning, not a failure: under
 * `RUNWAY_DAYS` of puzzles left after the latest of those dates.
 */

export const RUNWAY_DAYS = 7;

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly ms: number;
}

export interface Runway {
  /** The last puzzle date, or `undefined` if there are none. */
  readonly last: string | undefined;
  /** Whole days from the latest date a player can be on to the last puzzle (0: it's the last). */
  readonly daysLeft: number;
}

export interface HealthReport {
  readonly ok: boolean;
  readonly checks: readonly Check[];
  readonly runway: { readonly daily: Runway; readonly naughty: Runway };
  /** Set when the site works but needs attention soon. */
  readonly warning?: 'puzzles';
}

/**
 * The dates players can be on now, earliest first: from UTC−12 to UTC+14 (`Etc/GMT` names have
 * the sign the other way round). Usually two dates, sometimes one or three.
 */
export function playableDates(now: Date): string[] {
  const first = dateIn('Etc/GMT+12', now);
  const last = dateIn('Etc/GMT-14', now);
  const dates = [first];
  while (dates.at(-1)! < last) dates.push(addDays(dates.at(-1)!, 1));
  return dates;
}

const DAILY = /^(\d{4}-\d{2}-\d{2})$/;
const NAUGHTY = /^naughty-(\d{4}-\d{2}-\d{2})$/;

function runwayOf(ids: readonly string[], pattern: RegExp, latest: string): Runway {
  const dates = ids.map((id) => pattern.exec(id)?.[1]).filter((d): d is string => d !== undefined);
  const last = dates.sort().at(-1);
  return { last, daysLeft: last === undefined ? -1 : daysBetween(latest, last) };
}

export class Health {
  constructor(
    private readonly db: DatabaseSync,
    private readonly dataFolder: string,
    private readonly puzzleIds: () => readonly string[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  check(): HealthReport {
    const dates = playableDates(this.now());
    const latest = dates.at(-1)!;
    const ids = this.puzzleIds();
    const checks = [
      timed('database', () => {
        this.db.prepare('SELECT 1').get();
        const version = schemaVersion(this.db);
        if (version !== MIGRATIONS.length) {
          throw new Error(`schema ${version}, this release expects ${MIGRATIONS.length}`);
        }
        return `answers, schema ${version}`;
      }),
      timed('data folder', () => {
        // Windows' access check ignores folder permissions, so try a real write.
        const probe = join(this.dataFolder, `.health-${process.pid}`);
        writeFileSync(probe, 'ok');
        rmSync(probe, { force: true });
        return 'writable';
      }),
      timed("today's puzzles", () => {
        const wanted = dates.flatMap((date) => [date, `naughty-${date}`]);
        const missing = wanted.filter((id) => !ids.includes(id));
        if (missing.length > 0) throw new Error(`missing ${missing.join(', ')}`);
        return `daily and Naughty for ${dates[0]} to ${latest} (every time zone)`;
      }),
    ];
    const runway = {
      daily: runwayOf(ids, DAILY, latest),
      naughty: runwayOf(ids, NAUGHTY, latest),
    };
    const short = Math.min(runway.daily.daysLeft, runway.naughty.daysLeft) < RUNWAY_DAYS;
    return {
      ok: checks.every((c) => c.ok),
      checks,
      runway,
      ...(short ? { warning: 'puzzles' as const } : {}),
    };
  }
}

function timed(name: string, run: () => string): Check {
  const start = performance.now();
  let ok = true;
  let detail: string;
  try {
    detail = run();
  } catch (error) {
    ok = false;
    detail = error instanceof Error ? error.message : String(error);
  }
  return { name, ok, detail, ms: Math.round((performance.now() - start) * 10) / 10 };
}
