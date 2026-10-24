import { readFileSync } from 'node:fs';
import { loadPuzzle, type PuzzleFile } from '@crosswordle/engine';
import { describe, expect, it } from 'vitest';
import { candidatePool, parseClueLists } from '../src/clue-lists';
import { addDays, dailyTitle, generateDaily, recentAnswers } from '../src/daily';
import { DEFAULT_LAYOUT, generateLayout, type Candidate } from '../src/layout';
import { seededRandom } from '../src/random';
import { clueFor, givesAway, type WordNet } from '../src/wordnet';

const clueFile = new URL('../../../data/clues/quick.tsv', import.meta.url);
const { clues } = parseClueLists([{ name: 'quick.tsv', text: readFileSync(clueFile, 'utf8') }]);
// Every clued answer, treated as a dictionary word: the tests don't need the full word lists.
const pool: Candidate[] = candidatePool(clues, new Set(clues.keys()));

// Full newspaper size, with fewer attempts so the tests stay quick.
const quick = { ...DEFAULT_LAYOUT, attempts: 8 };
// Smaller puzzles for tests about which answers are used, not about size.
const small = { ...quick, minEntries: 8, maxEntries: 12, maxSize: 11 };

describe('seededRandom', () => {
  it('repeats for the same seed and differs between seeds', () => {
    const a = seededRandom('2026-10-24');
    const b = seededRandom('2026-10-24');
    const c = seededRandom('2026-10-25');
    const first = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(first);
    expect([c.next(), c.next(), c.next()]).not.toEqual(first);
  });

  it('shuffles without losing items', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededRandom('x').shuffle(items).sort()).toEqual(items);
  });
});

describe('generateLayout', () => {
  const entries = generateLayout(pool, seededRandom('layout'), quick)!;

  it('builds a valid puzzle within the size and entry limits', () => {
    const puzzle = loadPuzzle({
      version: 1,
      id: 't',
      title: 'T',
      answerEncoding: 'plain',
      entries,
    });
    expect(puzzle.entries.length).toBeGreaterThanOrEqual(quick.minEntries);
    expect(puzzle.entries.length).toBeLessThanOrEqual(quick.maxEntries);
    expect(puzzle.width).toBeLessThanOrEqual(quick.maxSize);
    expect(puzzle.height).toBeLessThanOrEqual(quick.maxSize);
  });

  it('gives the same layout for the same seed', () => {
    expect(generateLayout(pool, seededRandom('layout'), quick)).toEqual(entries);
  });

  it('gives up when the pool cannot reach the minimum size', () => {
    const tiny = pool.slice(0, 3);
    expect(generateLayout(tiny, seededRandom('layout'), quick)).toBeUndefined();
  });
});

describe('daily puzzles', () => {
  it('names puzzles by date', () => {
    expect(dailyTitle('2026-10-24')).toBe('Saturday 24 October 2026');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('does not reuse answers from nearby days', () => {
    const first = generateDaily('2026-10-24', pool, [], small)!;
    const second = generateDaily('2026-10-25', pool, [first], small)!;
    const used = new Set(first.entries.map((e) => e.answer));
    expect(second.entries.some((e) => used.has(e.answer))).toBe(false);
    expect(recentAnswers('2027-03-01', [first]).size).toBe(0);
  });

  it('is repeatable for a date', () => {
    const a: PuzzleFile = generateDaily('2026-11-05', pool, [], small)!;
    expect(generateDaily('2026-11-05', pool, [], small)).toEqual(a);
  });
});

describe('clue lists', () => {
  it('lets later lists replace or remove clues', () => {
    const { clues: merged, problems } = parseClueLists([
      { name: 'a', text: 'LLAMA\tAndean pack animal\nSLUT\tA dirty woman\n' },
      { name: 'b', text: '# edits\nllama\tWoolly camelid\nSLUT\t-\n' },
    ]);
    expect([...merged]).toEqual([['LLAMA', 'Woolly camelid']]);
    expect(problems).toEqual([]);
  });

  it('reports malformed lines and clues that contain the answer', () => {
    const { problems } = parseClueLists([
      { name: 'a', text: 'LEVEL\nODD ONE\tStrange\nLEVEL\tA spirit level\n' },
    ]);
    expect(problems).toEqual([
      'a:1: expected "ANSWER<tab>clue".',
      'a:2: "ODD ONE" is not letters only.',
      'a:3: the clue for LEVEL contains the answer.',
    ]);
  });
});

describe('WordNet clues', () => {
  const wordnet: WordNet = {
    entries: new Map([
      [
        'timid',
        new Map([
          ['n', ['s1']],
          ['a', ['s2', 's3']],
        ]),
      ],
      ['level', new Map([['n', ['s4', 's5']]])],
      ['boy', new Map([['n', ['s6', 's7']]])],
      ['taunt', new Map([['n', ['s6']]])],
      ['arse', new Map([['n', ['s8']]])],
    ]),
    definitions: new Map([
      ['s1', ['people who are fearful and cautious']],
      ['s2', ['showing fear and lack of confidence (of people); not brave']],
      ['s3', ['lacking self-confidence']],
      ['s4', ['the height of the levelled ground']],
      ['s5', ['a relative position or degree of value in a graded group']],
      ['s6', ['(ethnic slur) offensive and disparaging term for a person']],
      ['s7', ['a youthful male person']],
      ['s8', ['the fleshy part of the human body that you sit on (vulgar)']],
    ]),
  };

  it('uses the main part of speech and tidies the definition', () => {
    expect(clueFor('timid', wordnet)).toBe('Showing fear and lack of confidence');
  });

  it('skips definitions that give the answer away', () => {
    expect(givesAway('The height of the levelled ground', 'LEVEL')).toBe(true);
    expect(clueFor('level', wordnet)).toBe(
      'A relative position or degree of value in a graded group',
    );
  });

  it('never clues with a slur sense, but keeps the word for its other senses', () => {
    expect(clueFor('boy', wordnet)).toBe('A youthful male person');
    expect(clueFor('taunt', wordnet)).toBeUndefined();
    expect(clueFor('missing', wordnet)).toBeUndefined();
  });

  it('keeps rude senses', () => {
    expect(clueFor('arse', wordnet)).toBe('The fleshy part of the human body that you sit on');
  });
});
