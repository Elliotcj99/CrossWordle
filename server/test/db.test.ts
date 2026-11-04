import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS, openDatabase, schemaVersion, type Migration } from '../db';

const createNotes: Migration = (db) =>
  db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT)');
const addAuthor: Migration = (db) => db.exec('ALTER TABLE notes ADD COLUMN author TEXT');

const folders: string[] = [];
afterEach(() => folders.splice(0).forEach((f) => rmSync(f, { recursive: true, force: true })));

describe('openDatabase', () => {
  it('runs every migration on a new database and records the version', () => {
    const db = openDatabase(':memory:', [createNotes, addAuthor]);
    expect(schemaVersion(db)).toBe(2);
    db.prepare('INSERT INTO notes (text, author) VALUES (?, ?)').run('hi', 'me');
    expect(db.prepare('SELECT text, author FROM notes').get()).toEqual({
      text: 'hi',
      author: 'me',
    });
  });

  it('creates the folder and file, and only runs new migrations when reopened', () => {
    const folder = mkdtempSync(join(tmpdir(), 'crosswordle-db-'));
    folders.push(folder);
    const path = join(folder, 'nested', 'crosswordle.db');

    const first = openDatabase(path, [createNotes]);
    first.prepare('INSERT INTO notes (text) VALUES (?)').run('kept');
    first.close();

    // createNotes would fail if it ran again; only addAuthor should.
    const second = openDatabase(path, [createNotes, addAuthor]);
    expect(schemaVersion(second)).toBe(2);
    expect(second.prepare('SELECT text FROM notes').get()).toEqual({ text: 'kept' });
    expect(second.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    second.close();
  });

  it('rolls back a failed migration and keeps the earlier version', () => {
    const db = openDatabase(':memory:', [createNotes]);
    const broken: Migration = (d) => {
      d.exec('ALTER TABLE notes ADD COLUMN half TEXT');
      throw new Error('migration failed');
    };
    expect(() => migrate(db, [createNotes, broken])).toThrow('migration failed');
    expect(schemaVersion(db)).toBe(1);
    expect(
      db.prepare("SELECT count(*) AS n FROM pragma_table_info('notes') WHERE name = 'half'").get(),
    ).toEqual({
      n: 0,
    });
  });

  it('refuses a database from a newer release', () => {
    const db = openDatabase(':memory:', [createNotes, addAuthor]);
    expect(() => migrate(db, [createNotes])).toThrow(/schema 2.*only knows 1/);
  });
});

describe('MIGRATIONS', () => {
  it('3: keeps hint details and backfills when each finished attempt started', () => {
    const db = openDatabase(':memory:', MIGRATIONS.slice(0, 2));
    const player = '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f';
    db.exec(`
      INSERT INTO players (id, created_at) VALUES ('${player}', '2026-11-04T09:00:00Z');
      INSERT INTO hints (player_id, puzzle_id, attempt, entry_id, kind, letter, at)
        VALUES ('${player}', 'ring', 1, '1A', 'wordle', '{"index":0,"letter":"C"}', '2026-11-04T09:01:00Z');
      INSERT INTO guesses (player_id, puzzle_id, attempt, entry_id, letters, at)
        VALUES ('${player}', 'ring', 1, '1A', '[]', '2026-11-04T09:02:00Z');
      INSERT INTO results (player_id, puzzle_id, attempt, won, guesses, crossword_hints,
          wordle_hints, ranked, finished_at)
        VALUES ('${player}', 'ring', 1, 1, 4, 0, 1, 1, '2026-11-04T09:05:00Z');
    `);

    migrate(db, MIGRATIONS);

    expect(db.prepare('SELECT detail FROM hints').get()).toEqual({
      detail: '{"index":0,"letter":"C"}',
    });
    expect(db.prepare('SELECT started_at, review_flags, reviewed_at FROM results').get()).toEqual({
      started_at: '2026-11-04T09:01:00Z',
      review_flags: null,
      reviewed_at: null,
    });
  });
});
