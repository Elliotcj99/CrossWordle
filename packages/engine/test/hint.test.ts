import { describe, expect, it } from 'vitest';
import { chooseHintLetter } from '../src';

describe('chooseHintLetter', () => {
  it('reveals a single-occurrence letter, leftmost, when nothing is known', () => {
    // CAT: all distinct, all unseen — leftmost wins.
    expect(chooseHintLetter('CAT', [])).toEqual({ index: 0, letter: 'C' });
  });

  it('prefers a letter that occurs fewer times (single before double)', () => {
    // TART: T appears twice, A and R once — so A (leftmost single) over either T.
    expect(chooseHintLetter('TART', [])).toEqual({ index: 1, letter: 'A' });
  });

  it('prefers double over triple when no single-occurrence letter is free', () => {
    // NANNA: N x3, A x2 — A (the double) is chosen over any N (triple).
    expect(chooseHintLetter('NANNA', [])).toEqual({ index: 1, letter: 'A' });
  });

  it('never reveals a position that is already green', () => {
    // COT vs CAT: C and T are green; only A (pos 1) is left.
    expect(chooseHintLetter('CAT', ['COT'])).toEqual({ index: 1, letter: 'A' });
  });

  it('prefers an unseen letter over one only seen as yellow', () => {
    // CRANE vs BRAIN: R,A green; N yellow. B and I are unseen — B (leftmost) wins over yellow N.
    expect(chooseHintLetter('BRAIN', ['CRANE'])).toEqual({ index: 0, letter: 'B' });
  });

  it('falls back to a yellow letter when no unseen letter is free', () => {
    // ACT vs CAT: T green, A and C both seen yellow — reveals the leftmost yellow (C at pos 0).
    expect(chooseHintLetter('CAT', ['ACT'])).toEqual({ index: 0, letter: 'C' });
  });

  it('ignores guesses of the wrong length', () => {
    expect(chooseHintLetter('CAT', ['CATS', 'XX'])).toEqual({ index: 0, letter: 'C' });
  });

  it('returns undefined when every position is already green', () => {
    expect(chooseHintLetter('CAT', ['CAT'])).toBeUndefined();
  });
});
