import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseConfig, pathsFromEnv, readConfig } from '../config';

const folder = mkdtempSync(join(tmpdir(), 'crosswordle-config-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe('pathsFromEnv', () => {
  it('defaults to a .data folder, with the settings file inside it', () => {
    expect(pathsFromEnv({})).toEqual({
      data: resolve('.data'),
      config: resolve('.data/config.json'),
      logs: resolve('.data/logs'),
    });
  });

  it('takes both from the environment, relative to the working directory', () => {
    const paths = pathsFromEnv({
      CROSSWORDLE_DATA: '..\\..\\..\\data',
      CROSSWORDLE_CONFIG: '..\\..\\..\\config.json',
      CROSSWORDLE_LOGS: '..\\..\\..\\logs',
    });
    expect(paths.data).toBe(resolve('..\\..\\..\\data'));
    expect(paths.config).toBe(resolve('..\\..\\..\\config.json'));
    expect(paths.logs).toBe(resolve('..\\..\\..\\logs'));
  });
});

describe('readConfig', () => {
  it('treats a missing file as no settings', () => {
    expect(readConfig(join(folder, 'missing.json'))).toEqual({});
  });

  it('reads a file, including one with a byte order mark (Windows PowerShell writes one)', () => {
    const path = join(folder, 'config.json');
    writeFileSync(path, '\uFEFF{"contactEmail":"admin@example.com"}');
    expect(readConfig(path)).toEqual({ contactEmail: 'admin@example.com' });
  });

  it('refuses malformed settings rather than running without them', () => {
    expect(() => parseConfig([])).toThrow(/JSON object/);
    expect(() => parseConfig({ contactEmail: 'not-an-address' })).toThrow(/contactEmail/);
    const path = join(folder, 'broken.json');
    writeFileSync(path, '{ not json');
    expect(() => readConfig(path)).toThrow();
  });
});
