/**
 * Date arithmetic on `YYYY-MM-DD` strings (UTC calendar days), shared by the server and the admin
 * command so there's one copy of it.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The date `days` after (or before, if negative) a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whether a string is a real `YYYY-MM-DD` date (not, say, month 13). */
export function isDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

/** Whole days from one date to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The date in a time zone, e.g. `Europe/London` or `Etc/GMT-14`. */
export function dateIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
