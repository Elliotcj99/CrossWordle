import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { candidatePool, parseClueLists } from '../src/clue-lists';
import type { PuzzleFile } from '@crosswordle/engine';
import { addDays, generateDaily } from '../src/daily';
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
  const options = { idPrefix: 'naughty-', recentDays: 10 };
  const answers = (p: { entries: readonly { answer: string }[] }) => p.entries.map((e) => e.answer);

  // Twenty days in a row: without the rules this run has same-day pairs and repeats within the
  // window (JIZZ one day, JIZZED the next).
  const puzzles: PuzzleFile[] = [];
  for (let i = 0; i < 20; i++) {
    puzzles.push(generateDaily(addDays('2027-01-01', i), pool, puzzles, naughty, options)!);
  }

  it('never puts two forms of a word in one puzzle', () => {
    for (const puzzle of puzzles) {
      const words = answers(puzzle);
      const pairs = words.flatMap((a, i) => words.slice(i + 1).filter((b) => sameWord(a, b)));
      expect(pairs, puzzle.id).toEqual([]);
    }
  });

  it('rests other forms of recent answers, not just the answers', () => {
    puzzles.forEach((puzzle, i) => {
      const recent = puzzles.slice(Math.max(0, i - 10), i).flatMap(answers);
      const repeats = answers(puzzle).filter((a) => recent.some((b) => sameWord(a, b)));
      expect(repeats, puzzle.id).toEqual([]);
    });
  });
});
