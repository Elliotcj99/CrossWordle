import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorLog } from '../log';

let folder: string;
let clock: number;
let log: ErrorLog;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'crosswordle-log-'));
  clock = Date.parse('2026-11-20T09:00:00Z');
  log = new ErrorLog(folder, () => new Date(clock));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

describe('ErrorLog', () => {
  it('writes one line per error, with the request and player but nothing else about them', () => {
    const request = new Request('http://localhost/api/guess?x=1', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '192.0.2.7' },
    });
    log.error('recording a guess', new Error('disk full'), {
      request,
      playerId: '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f',
    });
    log.error('start-up', 'not an Error');

    expect(readdirSync(folder)).toEqual(['errors-2026-11-20.log']);
    const entries = log.since(new Date(0));
    expect(entries).toMatchObject([
      {
        at: '2026-11-20T09:00:00.000Z',
        where: 'recording a guess',
        message: 'disk full',
        request: 'POST /api/guess?x=1',
        playerId: '0b6f8f4e-2c1a-4d3b-9e5f-1a2b3c4d5e6f',
      },
      { where: 'start-up', message: 'not an Error' },
    ]);
    expect(entries[0]!.stack).toContain('disk full');
    expect(JSON.stringify(entries)).not.toContain('192.0.2.7');
  });

  it('starts a file a day, keeps 14 days, and reads back from a time', () => {
    for (const day of ['2026-11-01', '2026-11-06', '2026-11-07']) {
      writeFileSync(join(folder, `errors-${day}.log`), '');
    }
    writeFileSync(join(folder, 'notes.txt'), 'not a log');
    log.error('request', new Error('first today'));

    // 14 days including today: from 7 November.
    expect(readdirSync(folder).sort()).toEqual([
      'errors-2026-11-07.log',
      'errors-2026-11-20.log',
      'notes.txt',
    ]);

    clock += 60 * 60 * 1000;
    log.error('request', new Error('an hour later'));
    expect(log.since(new Date(clock - 30 * 60 * 1000)).map((e) => e.message)).toEqual([
      'an hour later',
    ]);
  });

  it('never throws when the folder cannot be written', () => {
    const file = join(folder, 'a-file');
    writeFileSync(file, '');
    const broken = new ErrorLog(join(file, 'logs'));
    expect(() => broken.error('request', new Error('boom'))).not.toThrow();
    expect(broken.since(new Date(0))).toEqual([]);
  });
});
