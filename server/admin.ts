import { parseArgs } from 'node:util';
import { databaseFile, pathsFromEnv } from './config';
import { openDatabase } from './db';
import { ErrorLog, type LogEntry } from './log';
import { Review, ReviewError, type FlaggedResult } from './review';

/**
 * The admin command, run on the server beside the site's own database:
 *
 *   node admin.mjs review [--all]
 *   node admin.mjs keep <puzzle-id> <player>
 *   node admin.mjs hide <puzzle-id> <player>
 *   node admin.mjs errors [--hours <n>]
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

<player> is the player id, or its first 8 or more characters as the list shows them.`;

function main(argv: readonly string[]): number {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      all: { type: 'boolean', default: false },
      hours: { type: 'string', default: '24' },
      help: { type: 'boolean' },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || command === undefined) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  // The error log needs no database.
  if (command === 'errors') {
    const hours = Number(values.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      console.error('--hours must be a positive number.');
      return 1;
    }
    const entries = new ErrorLog(pathsFromEnv().logs).since(
      new Date(Date.now() - hours * 60 * 60 * 1000),
    );
    console.log(
      entries.length === 0
        ? `No errors in the last ${hours} hours.`
        : entries.map(describeError).join('\n\n'),
    );
    return 0;
  }

  const db = openDatabase(databaseFile(pathsFromEnv()));
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

process.exitCode = main(process.argv.slice(2));
