import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, schemaVersion } from './db';

/**
 * Whether the site can serve a game right now. `GET /api/health` answers the uptime monitor with
 * one word (see `./api/health.ts`); `admin.mjs health` shows the detail on the server.
 *
 * The checks: the database answers and is at this release's schema; the data folder can be
 * written (recording a game needs it); today's daily and Naughty puzzles exist (UK date, when
 * the puzzles change). A warning, not a failure: under `RUNWAY_DAYS` of puzzles left.
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
  /** Whole days from today to the last puzzle (0: today is the last). */
  readonly daysLeft: number;
}

export interface HealthReport {
  readonly ok: boolean;
  readonly checks: readonly Check[];
  readonly runway: { readonly daily: Runway; readonly naughty: Runway };
  /** Set when the site works but needs attention soon. */
  readonly warning?: 'puzzles';
}

/** Today's date in the UK (YYYY-MM-DD): the puzzles change at UK midnight. */
export function ukDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const DAILY = /^(\d{4}-\d{2}-\d{2})$/;
const NAUGHTY = /^naughty-(\d{4}-\d{2}-\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function runwayOf(ids: readonly string[], pattern: RegExp, today: string): Runway {
  const dates = ids.map((id) => pattern.exec(id)?.[1]).filter((d): d is string => d !== undefined);
  const last = dates.sort().at(-1);
  return {
    last,
    daysLeft:
      last === undefined
        ? -1
        : Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS),
  };
}

export class Health {
  constructor(
    private readonly db: DatabaseSync,
    private readonly dataFolder: string,
    private readonly puzzleIds: () => readonly string[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  check(): HealthReport {
    const today = ukDate(this.now());
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
        const missing = [today, `naughty-${today}`].filter((id) => !ids.includes(id));
        if (missing.length > 0) throw new Error(`missing ${missing.join(', ')}`);
        return `daily and Naughty for ${today}`;
      }),
    ];
    const runway = {
      daily: runwayOf(ids, DAILY, today),
      naughty: runwayOf(ids, NAUGHTY, today),
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
