import { resolveRules, type RuleSet } from './rules';
import {
  cellKey,
  cellsOf,
  PuzzleError,
  startNumbers,
  type Cell,
  type Direction,
  type PublicPuzzleFile,
} from './puzzle';

/**
 * A numbered entry as the browser knows it: where it sits, how long it is and its clue, but no
 * answer. Scoring happens on the server, so the answer never reaches the page.
 */
export interface ClientEntry {
  /** Crossword-style id such as `1A` or `5D`. */
  readonly id: string;
  readonly number: number;
  readonly direction: Direction;
  readonly length: number;
  readonly clue: string;
  /** An optional second clue, revealed on demand as a hint. */
  readonly clue2?: string;
  readonly cells: readonly Cell[];
}

export interface ClientPuzzle {
  readonly id: string;
  readonly title: string;
  readonly rules: RuleSet;
  readonly width: number;
  readonly height: number;
  /** Ordered by number, across before down. */
  readonly entries: readonly ClientEntry[];
}

/** Checks the shape of an untrusted public puzzle file and returns it typed. Throws `PuzzleError`. */
export function parsePublicPuzzleFile(json: unknown): PublicPuzzleFile {
  const problems: string[] = [];
  if (!isRecord(json)) throw new PuzzleError(['The puzzle file is not a JSON object.']);

  if (json.version !== 1) problems.push('"version" must be 1.');
  if (typeof json.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(json.id)) {
    problems.push('"id" must be lowercase letters, digits and single hyphens.');
  }
  if (typeof json.title !== 'string' || json.title.trim() === '') {
    problems.push('"title" must be a non-empty string.');
  }
  if (!Array.isArray(json.entries) || json.entries.length === 0) {
    problems.push('"entries" must be a non-empty array.');
  } else {
    json.entries.forEach((entry, i) => problems.push(...entryProblems(entry, i)));
  }

  if (problems.length > 0) throw new PuzzleError(problems);
  return json as unknown as PublicPuzzleFile;
}

/** Numbers a public puzzle and works out its cells and size. Throws `PuzzleError`. */
export function loadClientPuzzle(file: PublicPuzzleFile): ClientPuzzle {
  const numbers = startNumbers(file.entries);
  const entries = file.entries
    .map((entry): ClientEntry => {
      const number = numbers.get(cellKey(entry))!;
      return {
        id: `${number}${entry.direction === 'across' ? 'A' : 'D'}`,
        number,
        direction: entry.direction,
        length: entry.length,
        clue: entry.clue,
        ...(entry.clue2 === undefined ? {} : { clue2: entry.clue2 }),
        cells: cellsOf(entry),
      };
    })
    .sort((a, b) => a.number - b.number || (a.direction === 'across' ? -1 : 1));

  const allCells = entries.flatMap((entry) => entry.cells);
  return {
    id: file.id,
    title: file.title,
    rules: resolveRules(file.rules),
    width: Math.max(...allCells.map((cell) => cell.col)) + 1,
    height: Math.max(...allCells.map((cell) => cell.row)) + 1,
    entries,
  };
}

function entryProblems(entry: unknown, index: number): string[] {
  const at = `Entry ${index + 1}`;
  if (!isRecord(entry)) return [`${at} is not an object.`];
  const problems: string[] = [];
  if (!isWholeNumber(entry.row)) problems.push(`${at}: "row" must be a whole number ≥ 0.`);
  if (!isWholeNumber(entry.col)) problems.push(`${at}: "col" must be a whole number ≥ 0.`);
  if (entry.direction !== 'across' && entry.direction !== 'down') {
    problems.push(`${at}: "direction" must be "across" or "down".`);
  }
  if (!isWholeNumber(entry.length) || (entry.length as number) < 1) {
    problems.push(`${at}: "length" must be a whole number ≥ 1.`);
  }
  if (typeof entry.clue !== 'string' || entry.clue.trim() === '') {
    problems.push(`${at}: "clue" must be a non-empty string.`);
  }
  if (entry.clue2 !== undefined && (typeof entry.clue2 !== 'string' || entry.clue2.trim() === '')) {
    problems.push(`${at}: "clue2" must be a non-empty string when present.`);
  }
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWholeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
