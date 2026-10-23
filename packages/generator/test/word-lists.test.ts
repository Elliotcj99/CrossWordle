import { describe, expect, it } from 'vitest';
import { parseWordLists } from '../src/word-lists';

describe('parseWordLists', () => {
  it('merges sources into uppercase words of the allowed lengths, sorted and unique', () => {
    const { words, problems } = parseWordLists([
      { name: 'a.txt', text: 'level\nox\nabyss\r\n\nsettled\n' },
      { name: 'b.txt', text: '# comment\nLEVEL\n  odd  \nextraordinary\n' },
    ]);
    expect([...words]).toEqual(['ABYSS', 'LEVEL', 'ODD', 'SETTLED']);
    expect(problems).toEqual([]);
  });

  it('reports lines that are not letters only', () => {
    const { problems } = parseWordLists([{ name: 'a.txt', text: "level\ncan't\nx-ray\n" }]);
    expect(problems).toEqual([
      'a.txt:2: "can\'t" is not a word of letters only.',
      'a.txt:3: "x-ray" is not a word of letters only.',
    ]);
  });
});
