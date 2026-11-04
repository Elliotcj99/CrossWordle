import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { addDays } from './dates';

/**
 * The server's error log. On IIS, Node's own output isn't kept, so without this a failure (a
 * game that couldn't be recorded, a request that crashed) would leave no trace.
 *
 * One JSON object per line, in a file per day (`errors-YYYY-MM-DD.log`, UTC), in the logs folder
 * outside the releases. Files older than `keepDays` are deleted, at start-up and every few hours
 * (`prune`), not only when an error comes. An entry holds the time, where it happened, the error
 * (its message trimmed to `MESSAGE_LENGTH`, as a message can quote what was sent) and the
 * request's method and path; no addresses, and a player id only where the error concerns one.
 * Logging never throws, so it can't fail a request or crash the server: anything that goes wrong
 * goes to the console instead.
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
const MESSAGE_LENGTH = 300;

export class ErrorLog {
  private prunedFor: string | undefined;

  constructor(
    private readonly folder: string,
    private readonly now: () => Date = () => new Date(),
    private readonly keepDays = 14,
  ) {}

  error(where: string, error: unknown, context: ErrorContext = {}): void {
    try {
      const entry = this.entryFor(where, error, context);
      console.error(`${entry.at} ${where}:`, error);
      mkdirSync(this.folder, { recursive: true });
      appendFileSync(
        join(this.folder, `errors-${entry.at.slice(0, 10)}.log`),
        `${JSON.stringify(entry)}\n`,
      );
      if (this.prunedFor !== entry.at.slice(0, 10)) this.prune();
    } catch (failure) {
      console.error(`Could not write to the error log (${where}):`, error, failure);
    }
  }

  private entryFor(where: string, error: unknown, context: ErrorContext): LogEntry {
    const trim = (text: string) =>
      text.length > MESSAGE_LENGTH ? `${text.slice(0, MESSAGE_LENGTH)}…` : text;
    let request: string | undefined;
    if (context.request !== undefined) {
      try {
        const url = new URL(context.request.url ?? '/', 'http://localhost');
        request = `${context.request.method ?? '?'} ${url.pathname}${url.search}`;
      } catch {
        request = `${context.request.method ?? '?'} (a URL that couldn't be read)`;
      }
    }
    return {
      at: this.now().toISOString(),
      where,
      message: trim(error instanceof Error ? error.message : String(error)),
      ...(error instanceof Error && error.stack !== undefined
        ? { stack: error.stack.split('\n').slice(1, 8).join('\n') }
        : {}),
      ...(request === undefined ? {} : { request: trim(request) }),
      ...(context.playerId === undefined ? {} : { playerId: context.playerId }),
    };
  }

  /** Entries since a time, oldest first, from the files that can hold them. */
  since(from: Date): LogEntry[] {
    const fromDay = from.toISOString().slice(0, 10);
    const entries: LogEntry[] = [];
    for (const name of this.files().filter((f) => f.day >= fromDay)) {
      let text: string;
      try {
        text = readFileSync(join(this.folder, name.file), 'utf8');
      } catch {
        continue; // Pruned between listing and reading.
      }
      for (const line of text.split('\n')) {
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

  /**
   * Deletes the files older than `keepDays`. Runs when the day's first error is written, and the
   * server also calls it at start-up and every few hours, so old entries go even when nothing
   * fails. Never throws.
   */
  prune(): void {
    try {
      const today = this.now().toISOString().slice(0, 10);
      this.prunedFor = today;
      const oldest = addDays(today, -(this.keepDays - 1));
      for (const { file, day } of this.files()) {
        if (day < oldest) rmSync(join(this.folder, file), { force: true });
      }
    } catch (failure) {
      console.error('Could not prune the error log:', failure);
    }
  }
}
