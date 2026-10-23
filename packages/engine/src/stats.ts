/** How one puzzle went, as recorded when it ended. */
export interface PuzzleResult {
  readonly won: boolean;
  readonly guesses: number;
}

export interface Stats {
  readonly played: number;
  readonly won: number;
  /** Wins on consecutive days, ending with the latest dated puzzle played. */
  readonly currentStreak: number;
  readonly bestStreak: number;
  /** Mean guesses over won puzzles, or `undefined` before the first win. */
  readonly averageGuesses: number | undefined;
}

const DATED = /^\d{4}-\d{2}-\d{2}$/;

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Totals and streaks from finished puzzles, keyed by puzzle id. Streaks count dated puzzles; the
 * current streak ends if the latest one is older than yesterday (`today` as YYYY-MM-DD).
 */
export function computeStats(
  results: Readonly<Record<string, PuzzleResult>>,
  today: string,
): Stats {
  const all = Object.values(results);
  const wins = all.filter((r) => r.won);

  let current = 0;
  let best = 0;
  let previous: string | undefined;
  for (const date of Object.keys(results)
    .filter((id) => DATED.test(id))
    .sort()) {
    const continues = previous !== undefined && nextDay(previous) === date;
    current = results[date]!.won ? (continues ? current + 1 : 1) : 0;
    best = Math.max(best, current);
    previous = date;
  }

  const stillGoing = previous !== undefined && (previous === today || nextDay(previous) === today);

  return {
    played: all.length,
    won: wins.length,
    currentStreak: stillGoing ? current : 0,
    bestStreak: best,
    averageGuesses:
      wins.length === 0 ? undefined : wins.reduce((sum, r) => sum + r.guesses, 0) / wins.length,
  };
}
