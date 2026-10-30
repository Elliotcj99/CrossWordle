import type { PuzzleFile } from '@crosswordle/engine';
import { DEFAULT_LAYOUT, generateLayout, type Candidate, type LayoutOptions } from './layout';
import { seededRandom } from './random';

/** An answer isn't reused within this many days either side of a puzzle. */
export const RECENT_DAYS = 60;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRAILING_DATE = /(\d{4}-\d{2}-\d{2})$/;

export function isDate(id: string): boolean {
  return DATE.test(id) && !Number.isNaN(Date.parse(`${id}T00:00:00Z`));
}

/**
 * The `YYYY-MM-DD` at the end of an id, so a prefixed collection (e.g. `naughty-2026-10-30`) is
 * still recognised as dated. `undefined` if the id has no trailing date.
 */
export function dateOf(id: string): string | undefined {
  const match = TRAILING_DATE.exec(id);
  return match !== undefined && match !== null && isDate(match[1]!) ? match[1]! : undefined;
}

export function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Saturday 24 October 2026". Spelled out by hand so it doesn't vary with the system locale. */
export function dailyTitle(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
}

/** Answers used by dated puzzles within `RECENT_DAYS` of `date` (any collection prefix). */
export function recentAnswers(date: string, puzzles: readonly PuzzleFile[]): Set<string> {
  const from = addDays(date, -RECENT_DAYS);
  const to = addDays(date, RECENT_DAYS);
  return new Set(
    puzzles
      .flatMap((p) => {
        const day = dateOf(p.id);
        return day !== undefined && day >= from && day <= to ? p.entries : [];
      })
      .map((e) => e.answer),
  );
}

/** How a generated puzzle is named: an id prefix (e.g. `naughty-`) and a title prefix. */
export interface Naming {
  readonly idPrefix?: string;
  readonly titlePrefix?: string;
}

/**
 * The puzzle for `date`, laid out from `pool` minus recently used answers. The same inputs
 * always give the same puzzle; a different `naming.idPrefix` seeds a different puzzle for the same
 * date, so a prefixed collection doesn't clone the daily one. `undefined` if no layout reached the
 * minimum size.
 */
export function generateDaily(
  date: string,
  pool: readonly Candidate[],
  existing: readonly PuzzleFile[],
  layout: LayoutOptions = DEFAULT_LAYOUT,
  naming: Naming = {},
): PuzzleFile | undefined {
  const id = `${naming.idPrefix ?? ''}${date}`;
  const recent = recentAnswers(date, existing);
  const fresh = pool.filter((candidate) => !recent.has(candidate.answer));
  const entries = generateLayout(fresh, seededRandom(id), layout);
  return entries === undefined
    ? undefined
    : {
        version: 1,
        id,
        title: `${naming.titlePrefix ?? ''}${dailyTitle(date)}`,
        answerEncoding: 'plain',
        entries,
      };
}
