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

  const at = (index: number, letter: string) => ({ index, letter });

  it('never reveals a letter the grid already shows from a crossing', () => {
    // CAT with C and A on the grid: only T is left.
    expect(chooseHintLetter('CAT', [], [at(0, 'C'), at(1, 'A')])).toEqual({
      index: 2,
      letter: 'T',
    });
    // Grid letters and greens together can leave nothing.
    expect(chooseHintLetter('CAT', ['COT'], [at(1, 'A')])).toBeUndefined();
  });

  it('treats a letter shown on the grid as seen, preferring one not seen anywhere', () => {
    // TART with the first T on the grid: A and R are unseen singles, so A (leftmost) still wins,
    // and the other T (now seen green) comes last.
    expect(chooseHintLetter('TART', [], [at(0, 'T')])).toEqual({ index: 1, letter: 'A' });
    expect(chooseHintLetter('TART', [], [at(0, 'T'), at(1, 'A'), at(2, 'R')])).toEqual({
      index: 3,
      letter: 'T',
    });
  });

  it("can't be steered to a chosen letter by claiming positions the caller doesn't know", () => {
    // Claiming every position but the first, with wrong letters, doesn't hide them: the clue is
    // still the one it would be with nothing known, so the answer can't be read a letter at a time.
    const claims = [at(1, 'X'), at(2, 'X'), at(3, 'X'), at(4, 'X')];
    expect(chooseHintLetter('BRAIN', [], claims)).toEqual(chooseHintLetter('BRAIN', []));
    expect(chooseHintLetter('BRAIN', [], [at(0, 'Q'), ...claims])).toEqual({
      index: 0,
      letter: 'B',
    });
  });

  it('ignores grid letters outside the word', () => {
    expect(chooseHintLetter('CAT', [], [at(-1, 'C'), at(3, 'T'), at(1.5, 'A')])).toEqual({
      index: 0,
      letter: 'C',
    });
  });
});
