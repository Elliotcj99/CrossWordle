import { describe, expect, it } from 'vitest';
import { nicknameAllowed, tidyNickname } from '../moderation';

const rude = new Set(['bum', 'knob', 'minge', 'bellend']);
const allowed = (name: string) => nicknameAllowed(tidyNickname(name)!, rude);

describe('tidyNickname', () => {
  it('trims and collapses spaces', () => {
    expect(tidyNickname('  Word   Wizard ')).toBe('Word Wizard');
  });

  it('accepts letters (any language), digits, spaces, dots, dashes and underscores', () => {
    expect(tidyNickname('Zoë_42')).toBe('Zoë_42');
    expect(tidyNickname('J.R. Hartley')).toBe('J.R. Hartley');
    expect(tidyNickname('Anne-Marie')).toBe('Anne-Marie');
  });

  it('accepts scripts written with combining marks, but nothing invisible', () => {
    expect(tidyNickname('नमस्ते')).toBe('नमस्ते');
    expect(tidyNickname('\u3164\u3164')).toBeUndefined();
    expect(tidyNickname('Sam\u200Bantha')).toBeUndefined();
    expect(tidyNickname('\u2800\u2800')).toBeUndefined();
    // Marks that show as nothing: the grapheme joiner and variation selectors.
    expect(tidyNickname('F\u034Fun')).toBeUndefined();
    expect(tidyNickname('Wa\uFE0Fve')).toBeUndefined();
  });

  it('refuses other characters, a leading symbol, and the wrong length', () => {
    expect(tidyNickname('a')).toBeUndefined();
    expect(tidyNickname('x'.repeat(21))).toBeUndefined();
    expect(tidyNickname('<script>')).toBeUndefined();
    expect(tidyNickname('-dash')).toBeUndefined();
    expect(tidyNickname('emoji 😀')).toBeUndefined();
    expect(tidyNickname('   ')).toBeUndefined();
  });
});

describe('nicknameAllowed', () => {
  it('allows ordinary names, including ones that contain a rude word inside another', () => {
    for (const name of [
      'Word Wizard',
      'Scunthorpe Sam',
      'Pen Island',
      'Cassandra',
      'Arsenal Fan',
      'Dickens',
      'Grape Ape',
      'Bumblebee',
      'J R R Fan',
      'Kitty',
    ]) {
      expect(allowed(name), name).toBe(true);
    }
  });

  it('refuses profanity the library knows, in its usual disguises', () => {
    for (const name of ['fuck', 'FvCk', 'sh1t', 'fuuuuck', 'b1tch']) {
      expect(allowed(name), name).toBe(false);
    }
  });

  it('refuses a word spelled out with gaps', () => {
    for (const name of ['f u c k', 's.h.i.t', 'Mr f-u-c-k']) {
      expect(allowed(name), name).toBe(false);
    }
  });

  it('refuses our own rude words as whole words, with look-alike digits', () => {
    for (const name of ['Big Bum', 'kn0b', 'b e l l e n d', 'MINGE_lord', 'Be11end']) {
      expect(allowed(name), name).toBe(false);
    }
  });

  it("can't be got past with marks on the letters", () => {
    for (const name of ['Bel\u0335lend', 'Fu\u0301ck', 'Kno\u0308b']) {
      expect(tidyNickname(name), name).toBeDefined();
      expect(allowed(name), name).toBe(false);
    }
    expect(allowed('Zoë')).toBe(true);
  });

  it('refuses our words inside a spelled-out run, even with letters beside them', () => {
    for (const name of ['x b u m', 'b u m s', 'Mr k n o b s']) {
      expect(allowed(name), name).toBe(false);
    }
  });
});
