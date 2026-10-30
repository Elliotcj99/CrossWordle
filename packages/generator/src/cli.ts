import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadPuzzle, parsePuzzleFile, type PuzzleFile } from '@crosswordle/engine';
import { candidatePool, readClueLists } from './clue-lists';
import { addDays, generateDaily, isDate } from './daily';
import { DEFAULT_LAYOUT, type LayoutOptions } from './layout';
import { publishFolder, readPuzzleFolder, type LoadedFile } from './puzzle-files';
import { NOTICE_FILE, readWordLists, writeWordFiles } from './word-lists';
import { clueFor, readWordNet } from './wordnet';

const USAGE = `Usage:
  (--words may be repeated to merge several word-list folders.)
  crosswordle validate <folder> --words <folder>...
      Check every puzzle in a folder, including that its answers are in the word lists
  crosswordle publish --in <folder> --words <folder>... --notice <file> --out <folder>
                      --answers-out <file> [--clues2 <file>...]
      Validate and write puzzles for the site: answer-free files (and the clues' licence notice)
      to --out, and the answers bundle for the scoring Function to --answers-out. --clues2 adds
      an optional second clue per answer (for the Crossword-clue hint), later lists winning.
  crosswordle reveal <id> --puzzles <folder>
      Print one puzzle's answers (clue -> answer), for checking a puzzle locally
  crosswordle words --words <folder>... --out <folder>
      Write the guess dictionary for the site, one file per word length, plus its licence notice
  crosswordle clues --wordnet <folder> --answers <file> --words <folder>... --out <file>
      Write a clue list from Open English WordNet (JSON edition) for the common words in <file>
  crosswordle generate --clues <file> [--clues <file>...] --words <folder>... --puzzles <folder>
                       [--from <YYYY-MM-DD>] [--days <n>] [--id-prefix <s>] [--title-prefix <s>]
                       [--min-entries <n>] [--max-entries <n>] [--max-size <n>] [--candidates <n>]
      Write daily puzzles that don't exist yet (default: 14 days from today). Later clue lists
      override earlier ones. --id-prefix/--title-prefix name a separate collection (e.g. naughty-);
      the layout flags override the newspaper-size default.`;

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      in: { type: 'string' },
      out: { type: 'string' },
      words: { type: 'string', multiple: true },
      wordnet: { type: 'string' },
      answers: { type: 'string' },
      clues: { type: 'string', multiple: true },
      puzzles: { type: 'string' },
      from: { type: 'string' },
      days: { type: 'string' },
      notice: { type: 'string' },
      'answers-out': { type: 'string' },
      clues2: { type: 'string', multiple: true },
      'id-prefix': { type: 'string' },
      'title-prefix': { type: 'string' },
      'min-entries': { type: 'string' },
      'max-entries': { type: 'string' },
      'max-size': { type: 'string' },
      candidates: { type: 'string' },
    },
  });
  const [command, folder] = positionals;

  switch (command) {
    case 'validate': {
      if (folder === undefined || !values.words?.length) return usage();
      const words = await loadWords(values.words);
      if (words === undefined) return 1;
      const loaded = await readPuzzleFolder(folder, words);
      report(loaded);
      return hasProblems(loaded) ? 1 : 0;
    }
    case 'publish': {
      const { in: inFolder, out, words: wordsFolders, notice: noticeFile } = values;
      const answersOut = values['answers-out'];
      if (!inFolder || !out || !wordsFolders?.length || !noticeFile || !answersOut) return usage();
      const notice = await readFile(noticeFile, 'utf8');
      const words = await loadWords(wordsFolders);
      if (words === undefined) return 1;
      const loaded = await readPuzzleFolder(inFolder, words);
      report(loaded);
      if (hasProblems(loaded)) return 1;

      let secondClue: ((answer: string) => string | undefined) | undefined;
      if (values.clues2?.length) {
        const list = await readClueLists(values.clues2);
        if (list.problems.length > 0) {
          console.error(`      - ${list.problems.length} second-clue line(s) skipped`);
        }
        secondClue = (answer) => list.clues.get(answer);
      }

      await publishFolder(
        loaded.flatMap((item) => (item.file === undefined ? [] : [item.file])),
        notice,
        out,
        answersOut,
        secondClue,
      );
      console.log(`Published ${loaded.length} puzzle(s): ${out} (public), ${answersOut} (answers)`);
      return 0;
    }
    case 'reveal': {
      const puzzlesFolder = values.puzzles;
      if (folder === undefined || puzzlesFolder === undefined) return usage();
      const path = join(puzzlesFolder, `${folder}.json`);
      let file: PuzzleFile;
      try {
        file = parsePuzzleFile(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        console.error(`Could not read ${path}: ${error instanceof Error ? error.message : error}`);
        return 1;
      }
      const puzzle = loadPuzzle(file);
      console.log(`${puzzle.title} (${puzzle.id})`);
      for (const entry of puzzle.entries) {
        console.log(`  ${entry.id.padEnd(4)} ${entry.answer.padEnd(12)} ${entry.clue}`);
      }
      return 0;
    }
    case 'words': {
      if (!values.words?.length || values.out === undefined) return usage();
      const words = await loadWords(values.words);
      if (words === undefined) return 1;
      const notices: string[] = [];
      for (const folder of values.words) {
        const notice = await readFile(join(folder, NOTICE_FILE), 'utf8').catch(() => undefined);
        if (notice === undefined) {
          console.error(
            `${join(folder, NOTICE_FILE)} is missing; the word lists' licences require it.`,
          );
          return 1;
        }
        notices.push(notice.trim());
      }
      const lengths = await writeWordFiles(words, `${notices.join('\n\n---\n\n')}\n`, values.out);
      console.log(`Wrote ${words.size} words (lengths ${lengths.join(', ')}) to ${values.out}`);
      return 0;
    }
    case 'clues': {
      const { wordnet: wordnetFolder, answers, words: wordsFolders, out } = values;
      if (!wordnetFolder || !answers || !wordsFolders?.length || !out) return usage();
      const words = await loadWords(wordsFolders);
      if (words === undefined) return 1;
      const wordnet = await readWordNet(wordnetFolder);
      const common = commonWords(await readFile(answers, 'utf8'));

      const lines: string[] = [];
      for (const word of common) {
        if (!words.has(word.toUpperCase())) continue;
        const clue = clueFor(word, wordnet);
        if (clue !== undefined) lines.push(`${word.toUpperCase()}\t${clue}`);
      }
      const header = [
        '# Clues from Open English WordNet (https://en-word.net), CC BY 4.0, which is derived from',
        '# Princeton WordNet (WordNet License). See NOTICE.md.',
        '# Adapted for use as clues: first clause of a definition, bracketed asides removed,',
        '# first letter capitalised; definitions that contain the answer, and senses WordNet',
        '# labels as slurs, are skipped.',
        `# Generated by \`crosswordle clues\` for the common words in ${basename(answers)}.`,
        '# Do not edit by hand: put changes in edits.tsv, which overrides this file.',
      ];
      await writeFile(out, `${[...header, ...lines.sort()].join('\n')}\n`);
      console.log(`Wrote ${lines.length} clues to ${out} (from ${common.length} common words).`);
      return 0;
    }
    case 'generate': {
      const { clues: clueFiles, words: wordsFolders, puzzles } = values;
      if (!clueFiles?.length || !wordsFolders?.length || !puzzles) return usage();
      const from = values.from ?? localToday();
      const days = Number(values.days ?? '14');
      if (!isDate(from) || !Number.isInteger(days) || days < 1) return usage();

      const layout = layoutFromFlags(values);
      if (layout === undefined) return usage();
      const idPrefix = values['id-prefix'] ?? '';
      const titlePrefix = values['title-prefix'] ?? '';

      const words = await loadWords(wordsFolders);
      if (words === undefined) return 1;
      const clueLists = await readClueLists(clueFiles);
      for (const problem of clueLists.problems) console.error(`      - ${problem}`);
      if (clueLists.problems.length > 0) return 1;
      const pool = candidatePool(clueLists.clues, words);

      const loaded = await readPuzzleFolder(puzzles, words);
      if (loaded.some((item) => item.problems.length > 0)) {
        report(loaded);
        return 1;
      }
      const existing = loaded.flatMap((item) => (item.file === undefined ? [] : [item.file]));

      let failed = false;
      for (let i = 0; i < days; i++) {
        const date = addDays(from, i);
        const id = `${idPrefix}${date}`;
        if (existing.some((p) => p.id === id)) {
          console.log(`skip  ${id} (already exists)`);
          continue;
        }
        const puzzle = generateDaily(date, pool, existing, layout, { idPrefix, titlePrefix });
        if (puzzle === undefined) {
          console.error(`FAIL  ${id}: no layout reached the minimum number of entries.`);
          failed = true;
          continue;
        }
        await writeFile(join(puzzles, `${id}.json`), `${JSON.stringify(puzzle, null, 2)}\n`);
        existing.push(puzzle);
        console.log(`new   ${id}: ${puzzle.entries.length} entries`);
      }
      return failed ? 1 : 0;
    }
    default:
      return usage();
  }
}

/** Lowercase letters-only lines of a word list; skips headers, names and abbreviations. */
function commonWords(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const separator = lines.indexOf('---');
  const body = separator === -1 ? lines : lines.slice(separator + 1);
  return [...new Set(body.filter((line) => /^[a-z]+$/.test(line)))];
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The merged word lists across folders, or `undefined` (after reporting why) if any line is bad. */
async function loadWords(folders: readonly string[]): Promise<ReadonlySet<string> | undefined> {
  const merged = new Set<string>();
  let bad = false;
  for (const folder of folders) {
    const { words, problems } = await readWordLists(folder);
    for (const problem of problems) console.error(`      - ${folder}/${problem}`);
    if (problems.length > 0) bad = true;
    for (const word of words) merged.add(word);
  }
  if (bad) return undefined;
  if (merged.size === 0) {
    console.error(`No words found in ${folders.join(', ')}.`);
    return undefined;
  }
  return merged;
}

/** Layout options from the CLI flags, over the newspaper-size default; `undefined` if any is bad. */
function layoutFromFlags(values: {
  'min-entries'?: string;
  'max-entries'?: string;
  'max-size'?: string;
  candidates?: string;
}): LayoutOptions | undefined {
  const flags: [keyof LayoutOptions, string | undefined][] = [
    ['minEntries', values['min-entries']],
    ['maxEntries', values['max-entries']],
    ['maxSize', values['max-size']],
    ['candidatesPerAttempt', values.candidates],
  ];
  const layout = { ...DEFAULT_LAYOUT };
  for (const [key, raw] of flags) {
    if (raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      console.error(`--${key} must be a whole number ≥ 1.`);
      return undefined;
    }
    layout[key] = value;
  }
  if (layout.minEntries > layout.maxEntries) {
    console.error('--min-entries cannot be greater than --max-entries.');
    return undefined;
  }
  return layout;
}

function report(loaded: readonly LoadedFile[]): void {
  for (const { path, problems } of loaded) {
    if (problems.length === 0) {
      console.log(`ok    ${path}`);
    } else {
      console.error(`FAIL  ${path}`);
      for (const problem of problems) console.error(`      - ${problem}`);
    }
  }
  if (loaded.length === 0) console.error('No puzzle files found.');
}

function hasProblems(loaded: readonly LoadedFile[]): boolean {
  return loaded.length === 0 || loaded.some((item) => item.problems.length > 0);
}

function usage(): number {
  console.error(USAGE);
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
