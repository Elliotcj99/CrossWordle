import { existsSync, readdirSync, statfsSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { puzzleIds } from '../functions/api/_shared';
import { databaseFile, pathsFromEnv, type Paths } from './config';
import { openDatabase } from './db';
import { Health, RUNWAY_DAYS, type Runway } from './health';
import { ErrorLog, type LogEntry } from './log';
import { Review, ReviewError, type FlaggedResult } from './review';
import { Stats, type PuzzleStats, type StatsReport } from './stats';

/**
 * The admin command, run on the server beside the site's own database:
 *
 *   node admin.mjs review [--all]
 *   node admin.mjs keep <puzzle-id> <player>
 *   node admin.mjs hide <puzzle-id> <player>
 *   node admin.mjs errors [--hours <n>]
 *   node admin.mjs health
 *   node admin.mjs stats [--from <date>] [--to <date>]
 *
 * On IIS, deploy/iis/Invoke-CrossWordleAdmin.ps1 runs it from the live release with the site's
 * data folder. Locally, `npm run admin -- review` uses `.data` (or CROSSWORDLE_DATA).
 */

const USAGE = `Usage:
  review [--all]              Ranked results flagged for a look, awaiting a decision
                              (--all: decided ones too). Flags never change the leaderboard.
  keep <puzzle-id> <player>   Looked at and fine: stays on the leaderboard (undoes a hide).
  hide <puzzle-id> <player>   Off the leaderboard. Kept in the player's own record.
  errors [--hours <n>]        The API's errors in the last n hours (default 24).
  health                      Every health check in detail, the puzzles left, the database
                              and disk, the last backup and recent errors.
  stats [--from <date>] [--to <date>]
                              Usage per puzzle and per day (YYYY-MM-DD; default: the last
                              7 days, UTC).

<player> is the player id, or its first 8 or more characters as the list shows them.`;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function main(argv: readonly string[]): number {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      all: { type: 'boolean', default: false },
      hours: { type: 'string', default: '24' },
      from: { type: 'string' },
      to: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || command === undefined) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }
  const paths = pathsFromEnv();

  // The error log needs no database.
  if (command === 'errors') {
    const hours = Number(values.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      console.error('--hours must be a positive number.');
      return 1;
    }
    const entries = new ErrorLog(paths.logs).since(new Date(Date.now() - hours * 60 * 60 * 1000));
    console.log(
      entries.length === 0
        ? `No errors in the last ${hours} hours.`
        : entries.map(describeError).join('\n\n'),
    );
    return 0;
  }

  const db = openDatabase(databaseFile(paths));
  try {
    const review = new Review(db);
    switch (command) {
      case 'review': {
        const results = review.flagged(values.all);
        if (results.length === 0) {
          console.log(values.all ? 'No flagged results.' : 'Nothing awaiting review.');
        } else {
          console.log(results.map(describe).join('\n\n'));
        }
        return 0;
      }
      case 'keep':
      case 'hide': {
        const [puzzleId, player] = rest;
        if (puzzleId === undefined || player === undefined || rest.length > 2) break;
        const playerId = review.decide(puzzleId, player, command);
        console.log(
          command === 'hide'
            ? `Hidden: ${playerId} on ${puzzleId}. It stays in the player's own record.`
            : `Kept: ${playerId} on ${puzzleId} stays on the leaderboard.`,
        );
        return 0;
      }
      case 'health': {
        const report = new Health(db, paths.data, puzzleIds).check();
        console.log(describeHealth(report.ok, report.checks, report.runway, paths));
        return report.ok ? 0 : 2;
      }
      case 'stats': {
        const today = new Date().toISOString().slice(0, 10);
        const to = values.to ?? today;
        const from =
          values.from ??
          new Date(Date.parse(`${to}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
        if (!DATE.test(from) || !DATE.test(to) || from > to) {
          console.error('--from and --to must be dates (YYYY-MM-DD), --from first.');
          return 1;
        }
        console.log(describeStats(new Stats(db).report(from, to), from, to));
        return 0;
      }
    }
    console.error(USAGE);
    return 1;
  } catch (error) {
    if (error instanceof ReviewError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    db.close();
  }
}

function describeError(entry: LogEntry): string {
  return [
    `${entry.at}  ${entry.where}${entry.request === undefined ? '' : `  ${entry.request}`}`,
    `  ${entry.message}`,
    ...(entry.playerId === undefined ? [] : [`  Player ${entry.playerId.slice(0, 8)}`]),
    ...(entry.stack === undefined
      ? []
      : entry.stack
          .split('\n')
          .slice(1, 4)
          .map((line) => `  ${line.trim()}`)),
  ].join('\n');
}

function describe(result: FlaggedResult): string {
  const name = result.nickname ?? '(no nickname)';
  const time = result.seconds === null ? 'unknown' : `${result.seconds}s`;
  const status =
    result.decision === null
      ? 'awaiting a decision'
      : `${result.decision === 'hide' ? 'hidden' : 'kept'} ${result.reviewedAt}`;
  return [
    `${result.puzzleId}  ${result.playerId.slice(0, 8)}  ${name}`,
    `  ${result.guesses} guesses, ${result.crosswordHints} Crossword clues, ` +
      `${result.wordleHints} Wordle clues, ${time}, finished ${result.finishedAt}`,
    `  Flags: ${result.flags.join(', ')}. ${status[0]!.toUpperCase()}${status.slice(1)}.`,
  ].join('\n');
}

function describeHealth(
  ok: boolean,
  checks: readonly { name: string; ok: boolean; detail: string; ms: number }[],
  runway: { daily: Runway; naughty: Runway },
  paths: Paths,
): string {
  const lines = [`Status: ${ok ? 'ok' : 'DOWN'}`, ''];
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'ok  ' : 'FAIL'}  ${check.name}: ${check.detail} (${check.ms} ms)`);
  }

  lines.push('', 'Puzzles left:');
  for (const [name, r] of [
    ['daily', runway.daily],
    ['Naughty', runway.naughty],
  ] as const) {
    const warn = r.daysLeft < RUNWAY_DAYS ? `  << under ${RUNWAY_DAYS} days: generate more` : '';
    lines.push(`  ${name}: last ${r.last ?? 'none'}, ${r.daysLeft} days after today${warn}`);
  }

  // This command runs from releases\<sha>\server.
  const release = basename(dirname(dirname(process.argv[1] ?? '')));
  const db = databaseFile(paths);
  const size = [db, `${db}-wal`]
    .filter((f) => existsSync(f))
    .reduce((sum, f) => sum + statSync(f).size, 0);
  const disk = statfsSync(paths.data);
  lines.push(
    '',
    `Release: ${release}`,
    `Database: ${megabytes(size)} (with its write-ahead log)`,
    `Free disk: ${megabytes(disk.bavail * disk.bsize)}`,
    `Last backup: ${lastBackup(join(dirname(paths.data), 'backups'))}`,
  );

  const errors = new ErrorLog(paths.logs).since(new Date(Date.now() - DAY_MS));
  lines.push(
    `Errors in the last 24 hours: ${errors.length}` +
      (errors.length === 0 ? '' : ` (last: ${errors.at(-1)!.at}; see admin.mjs errors)`),
  );
  return lines.join('\n');
}

function lastBackup(folder: string): string {
  try {
    const newest = readdirSync(folder)
      .map((name) => statSync(join(folder, name)))
      .filter((s) => s.isFile())
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    return newest === undefined ? 'none yet' : newest.mtime.toISOString();
  } catch {
    return 'none yet (no backups folder)';
  }
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function describeStats(report: StatsReport, from: string, to: string): string {
  const lines = [`Usage from ${from} to ${to}`];
  const puzzleTable = (title: string, rows: readonly PuzzleStats[]) => {
    lines.push('', title);
    if (rows.length === 0) {
      lines.push('  No games.');
      return;
    }
    lines.push(
      table(
        [
          'Puzzle',
          'Started',
          'Finished',
          'Won',
          'Lost',
          'Ranked',
          'Restarted',
          'Guesses',
          'Crossword clues',
          'Wordle clues',
        ],
        rows.map((r) => [
          r.puzzleId,
          r.started,
          r.finished,
          r.won,
          r.lost,
          r.ranked,
          r.restarted,
          r.guesses,
          r.crosswordClues,
          r.wordleClues,
        ]),
      ),
    );
  };
  puzzleTable('Daily puzzles', report.daily);
  puzzleTable('Naughty puzzles', report.naughty);

  lines.push(
    '',
    'Days (UTC)',
    table(
      ['Day', 'Page loads', 'New players', 'Active players'],
      report.days.map((d) => [d.day, d.pageLoads, d.newPlayers, d.activePlayers]),
    ),
    '',
    'Page loads minus active players is roughly the visitors who looked but never played.',
    `Player ids ever: ${report.players}, of which ${report.playersWithoutGuesses} never made a guess.`,
  );
  return lines.join('\n');
}

/** A plain-text table: the first column left-aligned, the rest right-aligned. */
function table(head: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const cells = [head, ...rows].map((row) => row.map(String));
  const widths = head.map((_, i) => Math.max(...cells.map((row) => row[i]!.length)));
  return cells
    .map(
      (row) =>
        '  ' +
        row
          .map((cell, i) => (i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)))
          .join('  '),
    )
    .join('\n');
}

process.exitCode = main(process.argv.slice(2));
