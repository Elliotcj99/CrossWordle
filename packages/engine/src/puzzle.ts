import { decodeAnswer, encodeAnswer } from './encoding';
import { resolveRules, type GuessBudget, type RuleOverrides, type RuleSet } from './rules';

export type Direction = 'across' | 'down';

/** `plain` for source files in the repo; `xor-base64` for files published with the site. */
export type AnswerEncoding = 'plain' | 'xor-base64';

/** An entry as written in a puzzle file. Numbers and ids are worked out from the layout. */
export interface EntryFile {
  readonly row: number;
  readonly col: number;
  readonly direction: Direction;
  readonly answer: string;
  readonly clue: string;
}

export interface PuzzleFile {
  readonly version: 1;
  /** Lowercase letters, digits and hyphens; daily puzzles use the date, e.g. `2026-10-23`. */
  readonly id: string;
  readonly title: string;
  readonly answerEncoding: AnswerEncoding;
  readonly rules?: RuleOverrides;
  readonly entries: readonly EntryFile[];
}

export interface Cell {
  readonly row: number;
  readonly col: number;
}

export interface Entry {
  /** Crossword-style id such as `1A` or `5D`. */
  readonly id: string;
  readonly number: number;
  readonly direction: Direction;
  readonly answer: string;
  readonly clue: string;
  readonly cells: readonly Cell[];
}

export interface Puzzle {
  readonly id: string;
  readonly title: string;
  readonly rules: RuleSet;
  readonly width: number;
  readonly height: number;
  /** Ordered by number, across before down. */
  readonly entries: readonly Entry[];
}

export class PuzzleError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid puzzle:\n- ${problems.join('\n- ')}`);
    this.name = 'PuzzleError';
  }
}

export function cellKey(cell: Cell): string {
  return `${cell.row},${cell.col}`;
}

/** A letter cell of the grid, with its clue number if an entry starts there. */
export interface GridCell extends Cell {
  readonly key: string;
  readonly number?: number;
}

/** Every letter cell once, each carrying the number of the entry that starts there (if any). */
export function gridCells(puzzle: {
  readonly entries: ReadonlyArray<{ readonly number: number; readonly cells: readonly Cell[] }>;
}): GridCell[] {
  const cells = new Map<string, GridCell>();
  for (const entry of puzzle.entries) {
    entry.cells.forEach((cell, i) => {
      const key = cellKey(cell);
      if (i === 0) {
        cells.set(key, { ...cell, key, number: entry.number });
      } else if (!cells.has(key)) {
        cells.set(key, { ...cell, key });
      }
    });
  }
  return [...cells.values()];
}

/** Checks the shape of untrusted JSON and returns it typed. Throws `PuzzleError`. */
export function parsePuzzleFile(json: unknown): PuzzleFile {
  const problems: string[] = [];
  if (!isRecord(json)) throw new PuzzleError(['The puzzle file is not a JSON object.']);

  if (json.version !== 1) problems.push('"version" must be 1.');
  if (typeof json.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(json.id)) {
    problems.push('"id" must be lowercase letters, digits and single hyphens.');
  }
  if (typeof json.title !== 'string' || json.title.trim() === '') {
    problems.push('"title" must be a non-empty string.');
  }
  if (json.answerEncoding !== 'plain' && json.answerEncoding !== 'xor-base64') {
    problems.push('"answerEncoding" must be "plain" or "xor-base64".');
  }
  if (json.rules !== undefined) problems.push(...ruleOverrideProblems(json.rules));
  if (!Array.isArray(json.entries) || json.entries.length === 0) {
    problems.push('"entries" must be a non-empty array.');
  } else {
    json.entries.forEach((entry, i) => problems.push(...entryShapeProblems(entry, i)));
  }

  if (problems.length > 0) throw new PuzzleError(problems);
  return json as unknown as PuzzleFile;
}

/** Decodes, validates and numbers a puzzle. Throws `PuzzleError`. */
export function loadPuzzle(file: PuzzleFile): Puzzle {
  const rules = resolveRules(file.rules);
  const entries = file.entries.map((entry) => ({
    ...entry,
    answer: file.answerEncoding === 'plain' ? entry.answer : decodeAnswer(entry.answer, file.id),
  }));

  const problems = layoutProblems(entries, rules);
  if (problems.length > 0) throw new PuzzleError(problems);

  const numbers = startNumbers(entries);
  const numbered = entries
    .map((entry): Entry => {
      const number = numbers.get(cellKey(entry))!;
      return {
        id: `${number}${entry.direction === 'across' ? 'A' : 'D'}`,
        number,
        direction: entry.direction,
        answer: entry.answer,
        clue: entry.clue,
        cells: entryCells(entry),
      };
    })
    .sort((a, b) => a.number - b.number || (a.direction === 'across' ? -1 : 1));

  const allCells = numbered.flatMap((entry) => entry.cells);
  return {
    id: file.id,
    title: file.title,
    rules,
    width: Math.max(...allCells.map((cell) => cell.col)) + 1,
    height: Math.max(...allCells.map((cell) => cell.row)) + 1,
    entries: numbered,
  };
}

/** Validates a plain source file and returns the copy that is published with the site. */
export function publishPuzzle(file: PuzzleFile): PuzzleFile {
  if (file.answerEncoding !== 'plain') {
    throw new PuzzleError(['Only plain source files can be published.']);
  }
  loadPuzzle(file);
  return {
    ...file,
    answerEncoding: 'xor-base64',
    entries: file.entries.map((entry) => ({
      ...entry,
      answer: encodeAnswer(entry.answer, file.id),
    })),
  };
}

/** An entry in a public puzzle file: its place and length, but no answer. */
export interface PublicEntryFile {
  readonly row: number;
  readonly col: number;
  readonly direction: Direction;
  /** The answer's length, so the grid and guesses can be sized without the answer itself. */
  readonly length: number;
  readonly clue: string;
  /** An optional second clue, revealed on demand as a hint. A hint, not the answer, so it ships. */
  readonly clue2?: string;
}

/**
 * The puzzle as served to the browser: layout, clues and lengths only. Answers stay on the server
 * (see the scoring Function), so they can't be read from the page.
 */
export interface PublicPuzzleFile {
  readonly version: 1;
  readonly id: string;
  readonly title: string;
  readonly rules?: RuleOverrides;
  readonly entries: readonly PublicEntryFile[];
}

/**
 * Validates a source file and returns the answer-free copy that is published to the browser.
 * `secondClue`, when given, supplies an optional second clue per answer; it is attached only when
 * it differs from the entry's own clue.
 */
export function toPublicFile(
  file: PuzzleFile,
  secondClue?: (answer: string) => string | undefined,
): PublicPuzzleFile {
  loadPuzzle(file); // Throws PuzzleError if the puzzle is invalid.
  const answerOf = (entry: EntryFile): string =>
    file.answerEncoding === 'plain' ? entry.answer : decodeAnswer(entry.answer, file.id);
  const normalise = (clue: string): string => clue.trim().toLowerCase();
  return {
    version: 1,
    id: file.id,
    title: file.title,
    ...(file.rules === undefined ? {} : { rules: file.rules }),
    entries: file.entries.map((entry) => {
      const answer = answerOf(entry);
      const clue2 = secondClue?.(answer);
      const distinct = clue2 !== undefined && normalise(clue2) !== normalise(entry.clue);
      return {
        row: entry.row,
        col: entry.col,
        direction: entry.direction,
        length: answer.length,
        clue: entry.clue,
        ...(distinct ? { clue2 } : {}),
      };
    }),
  };
}

/** The cells a placed entry fills, from its start, direction and length. */
export function cellsOf(placed: {
  readonly row: number;
  readonly col: number;
  readonly direction: Direction;
  readonly length: number;
}): Cell[] {
  return Array.from({ length: placed.length }, (_, i) =>
    placed.direction === 'across'
      ? { row: placed.row, col: placed.col + i }
      : { row: placed.row + i, col: placed.col },
  );
}

function entryCells(entry: EntryFile): Cell[] {
  return cellsOf({ ...entry, length: entry.answer.length });
}

function describe(entry: EntryFile): string {
  return `${entry.direction} entry at row ${entry.row}, col ${entry.col}`;
}

/** Everything wrong with how the entries sit on the grid; empty when the layout is valid. */
function layoutProblems(entries: readonly EntryFile[], rules: RuleSet): string[] {
  const problems: string[] = [];

  for (const entry of entries) {
    if (!/^[A-Z]+$/.test(entry.answer)) {
      problems.push(`The ${describe(entry)} must be capital letters A to Z only.`);
    } else if (entry.answer.length < rules.minLength || entry.answer.length > rules.maxLength) {
      problems.push(
        `The ${describe(entry)} is ${entry.answer.length} letters; entries must be ${rules.minLength} to ${rules.maxLength}.`,
      );
    }
  }
  if (problems.length > 0) return problems;

  const seenStarts = new Set<string>();
  const seenAnswers = new Set<string>();
  const seenClues = new Set<string>();
  for (const entry of entries) {
    const start = `${entry.direction}:${cellKey(entry)}`;
    if (seenStarts.has(start)) problems.push(`Two entries are the ${describe(entry)}.`);
    seenStarts.add(start);
    if (seenAnswers.has(entry.answer))
      problems.push(`An answer is used twice (${describe(entry)}).`);
    seenAnswers.add(entry.answer);
    const clue = entry.clue.trim().toLowerCase();
    if (seenClues.has(clue)) problems.push(`A clue is used twice (${describe(entry)}).`);
    seenClues.add(clue);
  }

  const letters = new Map<string, string>();
  for (const entry of entries) {
    entryCells(entry).forEach((cell, i) => {
      const key = cellKey(cell);
      const letter = entry.answer[i]!;
      const existing = letters.get(key);
      if (existing !== undefined && existing !== letter) {
        problems.push(
          `The ${describe(entry)} puts ${letter} where a crossing entry has ${existing}.`,
        );
      }
      letters.set(key, letter);
    });
  }

  problems.push(...runProblems(entries, letters));
  if (!isConnected(entries))
    problems.push('Every entry must connect to the others through crossings.');
  return problems;
}

/** Every run of two or more letters must be exactly one entry, so no stray words appear. */
function runProblems(
  entries: readonly EntryFile[],
  letters: ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = [];
  const entryRuns = new Set(entries.map((e) => `${e.direction}:${cellKey(e)}:${e.answer.length}`));
  const gridRuns = new Set<string>();

  for (const direction of ['across', 'down'] as const) {
    const step = (cell: Cell, by: number): Cell =>
      direction === 'across'
        ? { row: cell.row, col: cell.col + by }
        : { row: cell.row + by, col: cell.col };

    for (const key of letters.keys()) {
      const [row, col] = key.split(',').map(Number) as [number, number];
      const start = { row, col };
      if (letters.has(cellKey(step(start, -1)))) continue;

      let length = 1;
      while (letters.has(cellKey(step(start, length)))) length++;
      if (length < 2) continue;

      const run = `${direction}:${key}:${length}`;
      gridRuns.add(run);
      if (!entryRuns.has(run)) {
        problems.push(
          `The letters ${direction} from row ${row}, col ${col} (${length} long) are not exactly one entry.`,
        );
      }
    }
  }

  for (const entry of entries) {
    if (!gridRuns.has(`${entry.direction}:${cellKey(entry)}:${entry.answer.length}`)) {
      problems.push(`The ${describe(entry)} runs into neighbouring letters.`);
    }
  }
  return problems;
}

function isConnected(entries: readonly EntryFile[]): boolean {
  const cellsOf = entries.map((entry) => new Set(entryCells(entry).map(cellKey)));
  const reached = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const current = cellsOf[queue.pop()!]!;
    cellsOf.forEach((cells, i) => {
      if (!reached.has(i) && [...cells].some((key) => current.has(key))) {
        reached.add(i);
        queue.push(i);
      }
    });
  }
  return reached.size === entries.length;
}

/** Crossword numbering: start cells numbered left to right, top to bottom. */
export function startNumbers(
  entries: readonly { readonly row: number; readonly col: number }[],
): Map<string, number> {
  const starts = [...new Map(entries.map((entry) => [cellKey(entry), entry])).values()].sort(
    (a, b) => a.row - b.row || a.col - b.col,
  );
  return new Map(starts.map((cell, i) => [cellKey(cell), i + 1]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): boolean {
  return isNonNegativeInteger(value) && (value as number) > 0;
}

function entryShapeProblems(entry: unknown, index: number): string[] {
  const at = `Entry ${index + 1}`;
  if (!isRecord(entry)) return [`${at} is not an object.`];
  const problems: string[] = [];
  if (!isNonNegativeInteger(entry.row)) problems.push(`${at}: "row" must be a whole number ≥ 0.`);
  if (!isNonNegativeInteger(entry.col)) problems.push(`${at}: "col" must be a whole number ≥ 0.`);
  if (entry.direction !== 'across' && entry.direction !== 'down') {
    problems.push(`${at}: "direction" must be "across" or "down".`);
  }
  if (typeof entry.answer !== 'string' || entry.answer === '') {
    problems.push(`${at}: "answer" must be a non-empty string.`);
  }
  if (typeof entry.clue !== 'string' || entry.clue.trim() === '') {
    problems.push(`${at}: "clue" must be a non-empty string.`);
  }
  return problems;
}

function ruleOverrideProblems(rules: unknown): string[] {
  if (!isRecord(rules)) return ['"rules" must be an object.'];
  const problems: string[] = [];
  const known = new Set([
    'minLength',
    'maxLength',
    'guessBudget',
    'duplicateCounts',
    'realWordsOnly',
    'lockGreens',
  ]);
  for (const key of Object.keys(rules)) {
    if (!known.has(key)) problems.push(`"rules.${key}" is not a rule.`);
  }
  // A crossing needs at least two letters, so a one-letter entry can never be part of the grid.
  if (
    rules.minLength !== undefined &&
    !(isPositiveInteger(rules.minLength) && (rules.minLength as number) >= 2)
  ) {
    problems.push('"rules.minLength" must be a whole number ≥ 2.');
  }
  if (rules.maxLength !== undefined && !isPositiveInteger(rules.maxLength)) {
    problems.push('"rules.maxLength" must be a whole number > 0.');
  }
  if (rules.duplicateCounts !== undefined && typeof rules.duplicateCounts !== 'boolean') {
    problems.push('"rules.duplicateCounts" must be true or false.');
  }
  if (rules.realWordsOnly !== undefined && typeof rules.realWordsOnly !== 'boolean') {
    problems.push('"rules.realWordsOnly" must be true or false.');
  }
  if (rules.lockGreens !== undefined && typeof rules.lockGreens !== 'boolean') {
    problems.push('"rules.lockGreens" must be true or false.');
  }
  if (rules.guessBudget !== undefined && !isGuessBudget(rules.guessBudget)) {
    problems.push(
      '"rules.guessBudget" must be {"kind":"shared","guessesPerEntry":n} with n ≥ 1 or {"kind":"perEntry","extraGuesses":n}.',
    );
  }
  return problems;
}

function isGuessBudget(value: unknown): value is GuessBudget {
  if (!isRecord(value)) return false;
  if (value.kind === 'shared') {
    const n = value.guessesPerEntry;
    return typeof n === 'number' && Number.isFinite(n) && n >= 1;
  }
  if (value.kind === 'perEntry') return isNonNegativeInteger(value.extraGuesses);
  return false;
}
