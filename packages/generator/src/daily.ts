import type { PuzzleFile } from '@crosswordle/engine';
import { DEFAULT_LAYOUT, generateLayout, type Candidate, type LayoutOptions } from './layout';
import { seededRandom } from './random';

/** An answer isn't reused within this many days either side of a puzzle. */
export const RECENT_DAYS = 60;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(id: string): boolean {
  return DATE.test(id) && !Number.isNaN(Date.parse(`${id}T00:00:00Z`));
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

/** Answers used by dated puzzles within `RECENT_DAYS` of `date`. */
export function recentAnswers(date: string, puzzles: readonly PuzzleFile[]): Set<string> {
  const from = addDays(date, -RECENT_DAYS);
  const to = addDays(date, RECENT_DAYS);
  return new Set(
    puzzles
      .filter((p) => isDate(p.id) && p.id >= from && p.id <= to)
      .flatMap((p) => p.entries.map((e) => e.answer)),
  );
}

/**
 * The puzzle for `date`, laid out from `pool` minus recently used answers. The same inputs
 * always give the same puzzle. `undefined` if no layout reached the minimum size.
 */
export function generateDaily(
  date: string,
  pool: readonly Candidate[],
  existing: readonly PuzzleFile[],
  layout: LayoutOptions = DEFAULT_LAYOUT,
): PuzzleFile | undefined {
  const recent = recentAnswers(date, existing);
  const fresh = pool.filter((candidate) => !recent.has(candidate.answer));
  const entries = generateLayout(fresh, seededRandom(date), layout);
  return entries === undefined
    ? undefined
    : { version: 1, id: date, title: dailyTitle(date), answerEncoding: 'plain', entries };
}
