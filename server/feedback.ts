import type { DatabaseSync } from 'node:sqlite';
import { registerPlayer } from './players';

/**
 * Feature requests: a title and a description from a player, stored for the admin to read on the
 * server (`admin.mjs feedback`). They're never shown on the site.
 *
 * Kept with the player id (so deleting a record deletes them too) and the time; never the
 * visitor's address, which only the rate limits see, for 30 days.
 */

export const TITLE_LENGTH = { min: 3, max: 100 } as const;
export const DESCRIPTION_LENGTH = { min: 10, max: 2000 } as const;

export interface FeedbackItem {
  readonly id: number;
  readonly playerId: string;
  readonly title: string;
  readonly description: string;
  readonly createdAt: string;
  readonly status: 'open' | 'closed';
  readonly closedAt: string | null;
}

export type FeedbackProblem = 'title' | 'description';

/**
 * Tidies what a player wrote, or says which part is wrong. Control characters go (the admin reads
 * these in a terminal, where some of them do things), apart from line breaks and tabs in the
 * description; the title is one line with spaces collapsed. Lengths count characters, not bytes.
 */
export function tidyFeedback(
  title: unknown,
  description: unknown,
): { title: string; description: string } | { problem: FeedbackProblem } {
  if (typeof title !== 'string') return { problem: 'title' };
  if (typeof description !== 'string') return { problem: 'description' };
  const line = stripControls(title.normalize('NFC'), false).replace(/\s+/g, ' ').trim();
  const text = stripControls(description.normalize('NFC').replace(/\r\n?/g, '\n'), true)
    .replace(/[ \t]+$/gm, '')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!within(line, TITLE_LENGTH)) return { problem: 'title' };
  if (!within(text, DESCRIPTION_LENGTH)) return { problem: 'description' };
  return { title: line, description: text };
}

function within(text: string, length: { min: number; max: number }): boolean {
  const count = [...text].length;
  return count >= length.min && count <= length.max;
}

/**
 * Replaces control characters with a space: C0 and C1 (with DEL), and the invisible characters
 * that can disguise text in a terminal: zero-width characters, the bidi marks, embeddings,
 * overrides and isolates, the line and paragraph separators, and the byte order mark. With
 * `keepLines`, line breaks and tabs stay.
 */
function stripControls(text: string, keepLines: boolean): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const hidden =
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f) ||
      code === 0xfeff;
    out += !hidden || (keepLines && (char === '\n' || char === '\t')) ? char : ' ';
  }
  return out;
}

export class FeedbackError extends Error {}

export class Feedback {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Stores a tidied request (see `tidyFeedback`); returns its id. */
  add(playerId: string, title: string, description: string): number {
    const at = this.now().toISOString();
    // Both or neither: a player row with nothing attached would count as a new player.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      registerPlayer(this.db, playerId, at);
      const result = this.db
        .prepare(
          `INSERT INTO feedback (player_id, title, description, created_at, status)
           VALUES (?, ?, ?, ?, 'open')`,
        )
        .run(playerId, title, description, at);
      this.db.exec('COMMIT');
      return Number(result.lastInsertRowid);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Open requests, oldest first; with `all`, closed ones too. */
  list(all = false): FeedbackItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM feedback ${all ? '' : "WHERE status = 'open'"} ORDER BY created_at, id`,
      )
      .all() as Row[];
    return rows.map(item);
  }

  get(id: number): FeedbackItem {
    const row = this.db.prepare('SELECT * FROM feedback WHERE id = ?').get(id) as Row | undefined;
    if (row === undefined) throw new FeedbackError(`No feature request ${id}.`);
    return item(row);
  }

  /** Marks a request dealt with (`closed`), or open again. */
  setStatus(id: number, status: 'open' | 'closed'): FeedbackItem {
    this.get(id);
    this.db
      .prepare('UPDATE feedback SET status = ?, closed_at = ? WHERE id = ?')
      .run(status, status === 'closed' ? this.now().toISOString() : null, id);
    return this.get(id);
  }
}

type Row = {
  id: number;
  player_id: string;
  title: string;
  description: string;
  created_at: string;
  status: 'open' | 'closed';
  closed_at: string | null;
};

function item(row: Row): FeedbackItem {
  return {
    id: row.id,
    playerId: row.player_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    status: row.status,
    closedAt: row.closed_at,
  };
}
