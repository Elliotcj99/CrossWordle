import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  parsePuzzleFile,
  publishPuzzle,
  PuzzleError,
  toPublicFile,
  type PuzzleFile,
} from '@crosswordle/engine';

export interface PuzzleIndexItem {
  readonly id: string;
  readonly title: string;
}

export interface LoadedFile {
  readonly path: string;
  readonly file?: PuzzleFile;
  readonly problems: readonly string[];
}

/**
 * Reads every `*.json` puzzle in a folder and validates it. The file name must match the id, and
 * every answer must be in `words`.
 */
export async function readPuzzleFolder(
  folder: string,
  words: ReadonlySet<string>,
): Promise<LoadedFile[]> {
  const names = (await readdir(folder)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map((name) => readPuzzle(join(folder, name), words)));
}

async function readPuzzle(path: string, words: ReadonlySet<string>): Promise<LoadedFile> {
  try {
    const file = parsePuzzleFile(JSON.parse(await readFile(path, 'utf8')));
    if (`${file.id}.json` !== basename(path)) {
      return { path, problems: [`The file name must be "${file.id}.json".`] };
    }
    publishPuzzle(file);
    const unknown = file.entries
      .filter((entry) => !words.has(entry.answer))
      .map((entry) => `The answer "${entry.answer}" is not in the word lists.`);
    return unknown.length > 0 ? { path, problems: unknown } : { path, file, problems: [] };
  } catch (error) {
    if (error instanceof PuzzleError) return { path, problems: error.problems };
    if (error instanceof SyntaxError)
      return { path, problems: [`Not valid JSON: ${error.message}`] };
    throw error;
  }
}

/**
 * Publishes the puzzles to two places:
 *
 * - `publicFolder` (served to the browser): the answer-free puzzle files, an `index.json` listing
 *   them, and the clues' licence notice as `NOTICE.md`. This folder is replaced wholesale.
 * - `answersFile` (bundled into the scoring Function, never served): every puzzle in full, with
 *   its answers, keyed by id. This is the only copy of the answers the site ships, and it stays
 *   on the server.
 */
export async function publishFolder(
  files: readonly PuzzleFile[],
  notice: string,
  publicFolder: string,
  answersFile: string,
): Promise<void> {
  await rm(publicFolder, { recursive: true, force: true });
  await mkdir(publicFolder, { recursive: true });
  await writeFile(join(publicFolder, 'NOTICE.md'), notice);

  const index: PuzzleIndexItem[] = [];
  const answers: Record<string, PuzzleFile> = {};
  for (const file of files) {
    await writeFile(
      join(publicFolder, `${file.id}.json`),
      `${JSON.stringify(toPublicFile(file))}\n`,
    );
    index.push({ id: file.id, title: file.title });
    // The Function loads these directly, so keep the plain source (with its answers).
    answers[file.id] = file;
  }
  await writeFile(join(publicFolder, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

  await mkdir(dirname(answersFile), { recursive: true });
  await writeFile(answersFile, `${JSON.stringify(answers)}\n`);
}
