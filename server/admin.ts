import { existsSync, readdirSync, statfsSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { puzzleIds } from '../functions/api/_shared';
import { databaseFile, pathsFromEnv, type Paths } from './config';
import { openDatabase } from './db';
import { Feedback, FeedbackError, type FeedbackItem } from './feedback';
import { addDays, DAY_MS, isDate } from './dates';
import { Health, RUNWAY_DAYS, type HealthReport } from './health';
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
 *   node admin.mjs feedback [--all] | feedback show|close|reopen <id>
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
  feedback [--all]            Open feature requests, oldest first (--all: closed ones too).
  feedback show <id>          One request in full.
  feedback close <id>         Dealt with. feedback reopen <id> undoes it.

<player> is the player id, or its first 8 or more characters as the list shows them.`;

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
    // The log keeps 14 days; a year is plenty and keeps the date valid.
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 366) {
      console.error('--hours must be a number of hours from 1 to 8784 (a year).');
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

  // The health check reports the schema as it is, so it doesn't upgrade the database first.
  const db = openDatabase(databaseFile(paths), undefined, { migrate: command !== 'health' });
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
        console.log(describeHealth(report, paths));
        return report.ok ? 0 : 2;
      }
      case 'feedback': {
        const requests = new Feedback(db);
        const [action, idText] = rest;
        if (action === undefined) {
          const items = requests.list(values.all);
          console.log(
            items.length === 0
              ? values.all
                ? 'No feature requests.'
                : 'No open feature requests.'
              : items.map(describeRequestLine).join('\n'),
          );
          return 0;
        }
        if (idText === undefined || !/^\d{1,9}$/.test(idText) || rest.length !== 2) break;
        const id = Number(idText);
        if (action === 'show') {
          console.log(describeRequest(requests.get(id)));
          return 0;
        }
        if (action === 'close' || action === 'reopen') {
          const status = action === 'close' ? 'closed' : 'open';
          if (requests.get(id).status === status) {
            console.log(`Request ${id} is already ${status}.`);
            return 0;
          }
          const item = requests.setStatus(id, status);
          console.log(`Request ${item.id} is ${item.status}: ${item.title}`);
          return 0;
        }
        break;
      }
      case 'stats': {
        const to = values.to ?? new Date().toISOString().slice(0, 10);
        if (!isDate(to) || (values.from !== undefined && !isDate(values.from))) {
          console.error('--from and --to must be real dates (YYYY-MM-DD).');
          return 1;
        }
        const from = values.from ?? addDays(to, -6);
        if (from > to) {
          console.error('--from must not be after --to.');
          return 1;
        }
        console.log(describeStats(new Stats(db).report(from, to), from, to));
        return 0;
      }
    }
    console.error(USAGE);
    return 1;
  } catch (error) {
    if (error instanceof ReviewError || error instanceof FeedbackError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    db.close();
  }
}

function describeRequestLine(item: FeedbackItem): string {
  const status = item.status === 'closed' ? '  (closed)' : '';
  return `#${item.id}  ${item.createdAt.slice(0, 10)}  ${item.title}${status}`;
}

function describeRequest(item: FeedbackItem): string {
  return [
    `#${item.id}  ${item.title}`,
    `From player ${item.playerId.slice(0, 8)}, ${item.createdAt}. ` +
      (item.status === 'open' ? 'Open.' : `Closed ${item.closedAt}.`),
    '',
    item.description,
  ].join('\n');
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

function describeHealth({ ok, checks, runway }: HealthReport, paths: Paths): string {
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
    lines.push(
      `  ${name}: last ${r.last ?? 'none'}, ${r.daysLeft} days after the latest date anyone is on${warn}`,
    );
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
