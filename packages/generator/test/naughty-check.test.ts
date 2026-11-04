import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseClueLists } from '../src/clue-lists';
import { checkNaughty, forms, hashWord, parseBlocked, parseReviewed } from '../src/naughty-check';
import { parseWordLists } from '../src/word-lists';
import type { WordNet } from '../src/wordnet';

// Made-up words stand in for the blocked ones.
const blocked = new Set(['zork', 'blarg'].map(hashWord));
const none = new Set<string>();
const check = (words: string[], extra: Partial<Parameters<typeof checkNaughty>[0]> = {}) =>
  checkNaughty({ words, clues: [], blocked, reviewed: none, ...extra });

describe('hashWord and parseBlocked', () => {
  it('hashes the lowercase word', () => {
    expect(hashWord('ZORK')).toBe(hashWord('zork'));
    expect(hashWord('zork')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads hashes, skipping comments, and rejects anything else', () => {
    const text = `# comment\n\n${hashWord('zork').toUpperCase()}\n`;
    expect(parseBlocked(text)).toEqual(new Set([hashWord('zork')]));
    expect(() => parseBlocked('zork')).toThrow(/SHA-256/);
  });

  it('reads the first column of reviewed words', () => {
    expect(parseReviewed('# x\nZorkish\tFine\n')).toEqual(new Set(['zorkish']));
  });
});

describe('forms', () => {
  it('takes off common endings, including a doubled consonant', () => {
    expect(forms('zorks')).toContain('zork');
    expect(forms('zorking')).toContain('zork');
    expect(forms('blarggers')).toContain('blarg');
    expect(forms('zorkies')).toContain('zorky');
  });
});

describe('checkNaughty', () => {
  it('passes words that are not blocked', () => {
    expect(check(['bum', 'knob', 'zorro'])).toEqual([]);
  });

  it('fails a blocked word and its forms, even when reviewed', () => {
    expect(check(['zork', 'Zorks', 'blarged'])).toHaveLength(3);
    expect(check(['zork'], { reviewed: new Set(['zork']) })).toHaveLength(1);
  });

  it('fails a compound with a blocked word at either end, unless reviewed', () => {
    expect(check(['zorkface', 'bigblarg'])).toHaveLength(2);
    expect(check(['bigblarg'], { reviewed: new Set(['bigblarg']) })).toEqual([]);
  });

  it('fails a clue that uses a blocked word', () => {
    const clues = [{ name: 'rude.tsv', clues: new Map([['BUM', 'A zorking rear']]) }];
    expect(check([], { clues })).toEqual(['rude.tsv: the clue for BUM uses a blocked word.']);
  });

  it('with WordNet, flags a word with a slur sense unless reviewed', () => {
    const wordnet: WordNet = {
      entries: new Map([['zorro', new Map([['n', ['s1', 's2']]])]]),
      definitions: new Map([
        ['s1', ['a masked hero']],
        ['s2', ['(ethnic slur) offensive term for someone']],
      ]),
    };
    expect(check(['zorro'], { wordnet })).toHaveLength(1);
    expect(check(['zorro'], { wordnet, reviewed: new Set(['zorro']) })).toEqual([]);
  });
});

describe('the Naughty lists', () => {
  const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const clueFile = (name: string) => ({
    name,
    clues: parseClueLists([{ name, text: read(`data/clues-naughty/${name}`) }]).clues,
  });

  it('hold no blocked words', () => {
    const { words } = parseWordLists([
      { name: 'rude.txt', text: read('data/wordlists-naughty/rude.txt') },
    ]);
    expect(
      checkNaughty({
        words: [...words],
        clues: [clueFile('rude.tsv'), clueFile('second.tsv')],
        blocked: parseBlocked(read('data/wordlists-naughty/blocked.sha256')),
        reviewed: parseReviewed(read('data/wordlists-naughty/reviewed.tsv')),
      }),
    ).toEqual([]);
  });

  it('give every word both clues', () => {
    const { words } = parseWordLists([
      { name: 'rude.txt', text: read('data/wordlists-naughty/rude.txt') },
    ]);
    const first = clueFile('rude.tsv').clues;
    const second = clueFile('second.tsv').clues;
    expect([...words].filter((word) => !first.has(word) || !second.has(word))).toEqual([]);
  });
});
