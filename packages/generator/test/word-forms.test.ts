import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { candidatePool, parseClueLists } from '../src/clue-lists';
import type { PuzzleFile } from '@crosswordle/engine';
import { addDays, freshPool, generateDaily } from '../src/daily';
import { DEFAULT_LAYOUT } from '../src/layout';
import { sameWord } from '../src/word-forms';

describe('sameWord', () => {
  it.each([
    ['JIZZ', 'JIZZED'],
    ['jizz', 'jizzing'],
    ['FUCKER', 'FUCKERS'],
    ['fucked', 'fucker'],
    ['WHORE', 'WHORING'],
    ['whore', 'whored'],
    ['shagged', 'shagger'],
    ['pees', 'peed'],
    ['booze', 'boozing'],
    ['floozy', 'floozies'],
    ['level', 'levelled'],
    ['horn', 'horny'],
  ])('%s and %s are forms of one word', (a, b) => {
    expect(sameWord(a, b)).toBe(true);
    expect(sameWord(b, a)).toBe(true);
  });

  it.each([
    ['shit', 'shithead'],
    ['car', 'card'],
    ['tent', 'content'],
    ['bum', 'bimbo'],
  ])('%s and %s are different words', (a, b) => {
    expect(sameWord(a, b)).toBe(false);
  });
});

describe('the generator and word forms', () => {
  const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  // The Naughty pool is full of forms (JIZZ, JIZZED, JIZZING), so it's the hard case.
  const { clues } = parseClueLists([
    { name: 'rude.tsv', text: read('data/clues-naughty/rude.tsv') },
  ]);
  const pool = candidatePool(clues, new Set(clues.keys()));
  const naughty = {
    ...DEFAULT_LAYOUT,
    minEntries: 10,
    maxEntries: 16,
    maxSize: 11,
    attempts: 10,
  };
  // As in `npm run generate:naughty`: a word rests 30 days, its other forms 10.
  const options = { idPrefix: 'naughty-', recentDays: 30, formRestDays: 10 };
  const answers = (p: { entries: readonly { answer: string }[] }) => p.entries.map((e) => e.answer);

  // Forty days in a row: without the rules this run has same-day pairs and repeats within the
  // windows (JIZZ one day, JIZZED the next).
  const puzzles: PuzzleFile[] = [];
  for (let i = 0; i < 40; i++) {
    puzzles.push(generateDaily(addDays('2027-01-01', i), pool, puzzles, naughty, options)!);
  }

  it('never puts two forms of a word in one puzzle', () => {
    for (const puzzle of puzzles) {
      const words = answers(puzzle);
      const pairs = words.flatMap((a, i) => words.slice(i + 1).filter((b) => sameWord(a, b)));
      expect(pairs, puzzle.id).toEqual([]);
    }
  });

  it('rests a word for 30 days', () => {
    puzzles.forEach((puzzle, i) => {
      const recent = new Set(puzzles.slice(Math.max(0, i - 30), i).flatMap(answers));
      expect(
        answers(puzzle).filter((a) => recent.has(a)),
        puzzle.id,
      ).toEqual([]);
    });
  });

  it('rests other forms of a word for 10 days', () => {
    puzzles.forEach((puzzle, i) => {
      const recent = puzzles.slice(Math.max(0, i - 10), i).flatMap(answers);
      const repeats = answers(puzzle).filter((a) => recent.some((b) => sameWord(a, b)));
      expect(repeats, puzzle.id).toEqual([]);
    });
  });

  it('lets a form back after its shorter rest, but not the word', () => {
    const used: PuzzleFile = {
      version: 1,
      id: 'naughty-2027-01-01',
      title: 'Used',
      answerEncoding: 'plain',
      entries: [{ row: 0, col: 0, direction: 'across', answer: 'JIZZ', clue: 'Spunk' }],
    };
    const fresh = (date: string) => freshPool(date, pool, [used], options).map((c) => c.answer);
    expect(fresh('2027-01-08')).not.toContain('JIZZED');
    expect(fresh('2027-01-12')).toContain('JIZZED');
    expect(fresh('2027-01-12')).not.toContain('JIZZ');
    expect(fresh('2027-02-01')).toContain('JIZZ');
    // By default the forms rest as long as the word.
    expect(freshPool('2027-01-12', pool, [used]).map((c) => c.answer)).not.toContain('JIZZED');
  });
});
