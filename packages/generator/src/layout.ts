import { loadPuzzle, PuzzleError, type Direction, type EntryFile } from '@crosswordle/engine';
import type { Random } from './random';

export interface Candidate {
  readonly answer: string;
  readonly clue: string;
}

export interface LayoutOptions {
  /** A layout with fewer entries is thrown away. */
  readonly minEntries: number;
  /** Stop adding entries at this many. */
  readonly maxEntries: number;
  /** Largest width and height, so the grid stays playable on a phone. */
  readonly maxSize: number;
  /** Layouts to try; the best one wins. */
  readonly attempts: number;
  /** Answers each attempt draws from the pool at random. Fewer is faster; too few can't fill. */
  readonly candidatesPerAttempt: number;
}

/**
 * Newspaper size: British quick crosswords (the Guardian Quick, the Times Quick Cryptic) use a
 * 13 × 13 grid with usually 24 to 26 clues.
 */
export const DEFAULT_LAYOUT: LayoutOptions = {
  minEntries: 24,
  maxEntries: 26,
  maxSize: 13,
  attempts: 100,
  candidatesPerAttempt: 2000,
};

interface BoardCell {
  readonly letter: string;
  across: boolean;
  down: boolean;
}

interface Placement {
  readonly row: number;
  readonly col: number;
  readonly direction: Direction;
}

const step = (direction: Direction): { dr: number; dc: number } =>
  direction === 'across' ? { dr: 0, dc: 1 } : { dr: 1, dc: 0 };
const key = (row: number, col: number) => `${row},${col}`;
const area = (size: { width: number; height: number }) => size.width * size.height;

/** A freeform grid being built up one crossing word at a time. */
class Board {
  readonly cells = new Map<string, BoardCell>();
  readonly entries: (Candidate & Placement)[] = [];
  private minRow = Infinity;
  private maxRow = -Infinity;
  private minCol = Infinity;
  private maxCol = -Infinity;

  get area(): number {
    return this.entries.length === 0 ? 0 : this.width * this.height;
  }

  /** The grid's size if the word were placed here. */
  sizeWith(answer: string, at: Placement): { width: number; height: number } {
    const { dr, dc } = step(at.direction);
    const endRow = at.row + dr * (answer.length - 1);
    const endCol = at.col + dc * (answer.length - 1);
    return {
      width: Math.max(this.maxCol, endCol) - Math.min(this.minCol, at.col) + 1,
      height: Math.max(this.maxRow, endRow) - Math.min(this.minRow, at.row) + 1,
    };
  }

  get crossings(): number {
    let count = 0;
    for (const cell of this.cells.values()) if (cell.across && cell.down) count++;
    return count;
  }

  place(candidate: Candidate, at: Placement): void {
    const { dr, dc } = step(at.direction);
    [...candidate.answer].forEach((letter, i) => {
      const row = at.row + dr * i;
      const col = at.col + dc * i;
      const cell = this.cells.get(key(row, col)) ?? { letter, across: false, down: false };
      cell[at.direction] = true;
      this.cells.set(key(row, col), cell);
      this.minRow = Math.min(this.minRow, row);
      this.maxRow = Math.max(this.maxRow, row);
      this.minCol = Math.min(this.minCol, col);
      this.maxCol = Math.max(this.maxCol, col);
    });
    this.entries.push({ ...candidate, ...at });
  }

  /**
   * How many letters the word would share with existing entries if placed here, or `undefined`
   * if it can't go here: a clash, a run into a neighbouring word, or the grid getting too big.
   */
  fit(answer: string, at: Placement, maxSize: number): number | undefined {
    const { dr, dc } = step(at.direction);
    const length = answer.length;
    if (this.cells.has(key(at.row - dr, at.col - dc))) return undefined;
    if (this.cells.has(key(at.row + dr * length, at.col + dc * length))) return undefined;

    let crossings = 0;
    for (let i = 0; i < length; i++) {
      const row = at.row + dr * i;
      const col = at.col + dc * i;
      const cell = this.cells.get(key(row, col));
      if (cell !== undefined) {
        if (cell.letter !== answer[i] || cell[at.direction]) return undefined;
        crossings++;
      } else if (
        this.cells.has(key(row + dc, col + dr)) ||
        this.cells.has(key(row - dc, col - dr))
      ) {
        return undefined;
      }
    }

    const { width, height } = this.sizeWith(answer, at);
    return height > maxSize || width > maxSize ? undefined : crossings;
  }

  get width(): number {
    return this.maxCol - this.minCol + 1;
  }

  get height(): number {
    return this.maxRow - this.minRow + 1;
  }

  /** Every place the word could cross the existing grid, with its crossing count. */
  placements(answer: string, maxSize: number): (Placement & { crossings: number })[] {
    const found: (Placement & { crossings: number })[] = [];
    for (const [cellKey, cell] of this.cells) {
      if (cell.across && cell.down) continue;
      const direction: Direction = cell.across ? 'down' : 'across';
      const { dr, dc } = step(direction);
      const [row, col] = cellKey.split(',').map(Number) as [number, number];
      for (let i = 0; i < answer.length; i++) {
        if (answer[i] !== cell.letter) continue;
        const at = { row: row - dr * i, col: col - dc * i, direction };
        const crossings = this.fit(answer, at, maxSize);
        if (crossings !== undefined && crossings > 0) found.push({ ...at, crossings });
      }
    }
    return found;
  }

  /** The entries moved so the grid starts at row 0, column 0, in reading order. */
  toEntries(): EntryFile[] {
    return this.entries
      .map(({ answer, clue, row, col, direction }) => ({
        row: row - this.minRow,
        col: col - this.minCol,
        direction,
        answer,
        clue,
      }))
      .sort((a, b) => a.row - b.row || a.col - b.col || (a.direction === 'across' ? -1 : 1));
  }
}

/** One layout attempt: a seed word, then crossing words added greedily until full or stuck. */
function buildBoard(pool: readonly Candidate[], options: LayoutOptions, random: Random): Board {
  const board = new Board();
  const order = random.shuffle(pool).slice(0, options.candidatesPerAttempt);
  const seed = order.find((c) => c.answer.length >= 6 && c.answer.length <= options.maxSize);
  if (seed === undefined) return board;
  board.place(seed, { row: 0, col: 0, direction: random.int(2) === 0 ? 'across' : 'down' });

  const used = new Set([seed.answer]);
  // Synonyms often share a clue, but one puzzle never shows the same clue twice.
  const usedClues = new Set([seed.clue.toLowerCase()]);
  let placedThisPass = true;
  while (placedThisPass && board.entries.length < options.maxEntries) {
    placedThisPass = false;
    for (const candidate of order) {
      if (board.entries.length >= options.maxEntries) break;
      if (used.has(candidate.answer) || usedClues.has(candidate.clue.toLowerCase())) continue;
      const spots = board.placements(candidate.answer, options.maxSize);
      if (spots.length === 0) continue;
      // Prefer more crossings, then the least growth of the grid; break ties at random.
      const best = spots
        .map((spot) => ({
          spot,
          score:
            spot.crossings * 10 -
            area(board.sizeWith(candidate.answer, spot)) * 0.2 +
            random.next(),
        }))
        .sort((a, b) => b.score - a.score)[0]!.spot;
      board.place(candidate, best);
      used.add(candidate.answer);
      usedClues.add(candidate.clue.toLowerCase());
      placedThisPass = true;
    }
  }
  return board;
}

/** Higher is better: more entries and crossings, a compact square grid, varied lengths. */
function scoreBoard(board: Board): number {
  const lengths = new Set(board.entries.map((e) => e.answer.length));
  return (
    board.entries.length * 10 +
    board.crossings * 6 +
    lengths.size * 3 -
    board.area * 0.3 -
    Math.abs(board.width - board.height) * 2
  );
}

/**
 * The best valid layout found in `options.attempts` tries, or `undefined` if none reached
 * `options.minEntries`. Every result passes the engine's own puzzle validation.
 */
export function generateLayout(
  pool: readonly Candidate[],
  random: Random,
  options: LayoutOptions = DEFAULT_LAYOUT,
): EntryFile[] | undefined {
  let best: { entries: EntryFile[]; score: number } | undefined;
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    const board = buildBoard(pool, options, random);
    if (board.entries.length < options.minEntries) continue;

    const entries = board.toEntries();
    try {
      loadPuzzle({
        version: 1,
        id: 'candidate',
        title: 'Candidate',
        answerEncoding: 'plain',
        entries,
      });
    } catch (error) {
      if (error instanceof PuzzleError) continue;
      throw error;
    }

    const score = scoreBoard(board);
    if (best === undefined || score > best.score) best = { entries, score };
  }
  return best?.entries;
}
