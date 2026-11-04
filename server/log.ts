import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The server's error log. On IIS, Node's own output isn't kept, so without this a failure (a
 * game that couldn't be recorded, a request that crashed) would leave no trace.
 *
 * One JSON object per line, in a file per day (`errors-YYYY-MM-DD.log`, UTC), in the logs folder
 * outside the releases. Files older than `keepDays` are deleted. An entry holds the time, where it
 * happened, the error and the request's method and path; no addresses or other player data, only
 * a player id where the error concerns one. Writing to the log never fails the request: if the
 * folder can't be written, the entry goes to the console only.
 */

export interface LogEntry {
  readonly at: string;
  /** What was happening, e.g. `recording a guess` or `request`. */
  readonly where: string;
  readonly message: string;
  readonly stack?: string;
  /** e.g. `POST /api/guess`. */
  readonly request?: string;
  readonly playerId?: string;
}

export interface ErrorContext {
  /** A `Request`, or Node's own request (whose url is just the path). */
  readonly request?: { readonly method?: string | undefined; readonly url?: string | undefined };
  readonly playerId?: string;
}

const FILE = /^errors-(\d{4}-\d{2}-\d{2})\.log$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export class ErrorLog {
  private prunedFor: string | undefined;

  constructor(
    private readonly folder: string,
    private readonly now: () => Date = () => new Date(),
    private readonly keepDays = 14,
  ) {}

  error(where: string, error: unknown, context: ErrorContext = {}): void {
    const at = this.now();
    const url =
      context.request === undefined
        ? undefined
        : new URL(context.request.url ?? '/', 'http://localhost');
    const entry: LogEntry = {
      at: at.toISOString(),
      where,
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof Error && error.stack !== undefined
        ? { stack: error.stack.split('\n').slice(0, 8).join('\n') }
        : {}),
      ...(url === undefined
        ? {}
        : { request: `${context.request!.method ?? '?'} ${url.pathname}${url.search}` }),
      ...(context.playerId === undefined ? {} : { playerId: context.playerId }),
    };
    console.error(`${entry.at} ${where}:`, error);
    try {
      mkdirSync(this.folder, { recursive: true });
      const day = entry.at.slice(0, 10);
      appendFileSync(join(this.folder, `errors-${day}.log`), `${JSON.stringify(entry)}\n`);
      if (this.prunedFor !== day) this.prune(day);
    } catch (failure) {
      console.error('Could not write to the error log:', failure);
    }
  }

  /** Entries since a time, oldest first, from the files that can hold them. */
  since(from: Date): LogEntry[] {
    const fromDay = from.toISOString().slice(0, 10);
    const entries: LogEntry[] = [];
    for (const name of this.files().filter((f) => f.day >= fromDay)) {
      for (const line of readFileSync(join(this.folder, name.file), 'utf8').split('\n')) {
        if (line.trim() === '') continue;
        try {
          const entry = JSON.parse(line) as LogEntry;
          if (entry.at >= from.toISOString()) entries.push(entry);
        } catch {
          // A torn last line from a crash: skip it.
        }
      }
    }
    return entries.sort((a, b) => a.at.localeCompare(b.at));
  }

  private files(): { file: string; day: string }[] {
    try {
      return readdirSync(this.folder)
        .map((file) => ({ file, day: FILE.exec(file)?.[1] }))
        .filter((f): f is { file: string; day: string } => f.day !== undefined)
        .sort((a, b) => a.day.localeCompare(b.day));
    } catch {
      return [];
    }
  }

  private prune(today: string): void {
    this.prunedFor = today;
    const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - (this.keepDays - 1) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    for (const { file, day } of this.files()) {
      if (day < oldest) rmSync(join(this.folder, file), { force: true });
    }
  }
}
