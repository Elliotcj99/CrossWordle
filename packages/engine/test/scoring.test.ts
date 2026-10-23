import { describe, expect, it } from 'vitest';
import { bestMarks, duplicateCounts, evaluateGuess, scoreGuess } from '../src';

describe('scoreGuess', () => {
  it('marks an exact match all correct', () => {
    expect(scoreGuess('LEVEL', 'LEVEL')).toEqual(Array(5).fill('correct'));
  });

  it('gives a yellow only while unmatched copies remain (EERIE vs LEVEL)', () => {
    expect(scoreGuess('EERIE', 'LEVEL')).toEqual([
      'present',
      'correct',
      'absent',
      'absent',
      'absent',
    ]);
  });

  it('greys the second copy when the answer has one (SPEED vs ABIDE)', () => {
    expect(scoreGuess('SPEED', 'ABIDE')).toEqual([
      'absent',
      'absent',
      'present',
      'absent',
      'present',
    ]);
  });

  it('takes greens before yellows when the answer has three copies (GEESE vs EERIE)', () => {
    expect(scoreGuess('GEESE', 'EERIE')).toEqual([
      'absent',
      'correct',
      'present',
      'absent',
      'correct',
    ]);
  });

  it('handles a guess of one repeated letter', () => {
    expect(scoreGuess('EEEEE', 'EERIE')).toEqual([
      'correct',
      'correct',
      'absent',
      'absent',
      'correct',
    ]);
  });

  it('rejects a guess of the wrong length', () => {
    expect(() => scoreGuess('LEVELS', 'LEVEL')).toThrow(RangeError);
  });
});

describe('duplicateCounts', () => {
  it('badges green and yellow tiles whose letter the answer has more than once', () => {
    // E E R I E vs LEVEL: yellow E, green E, grey R, grey I, grey E.
    expect(duplicateCounts('EERIE', 'LEVEL')).toEqual([2, 2, undefined, undefined, undefined]);
  });

  it('badges a letter the guess uses only once', () => {
    // L A T E R vs LEVEL: green L, grey A, grey T, green E, grey R.
    expect(duplicateCounts('LATER', 'LEVEL')).toEqual([2, undefined, undefined, 2, undefined]);
  });

  it('shows nothing for a letter the answer has only once', () => {
    // S P E E D vs ABIDE: the yellow E and yellow D each appear once in ABIDE.
    expect(duplicateCounts('SPEED', 'ABIDE')).toEqual(Array(5).fill(undefined));
  });

  it('shows nothing on grey tiles', () => {
    // O D D E R vs EXTRA: the Ds are grey (not in the answer); E and R are once-only yellows.
    expect(duplicateCounts('ODDER', 'EXTRA')).toEqual(Array(5).fill(undefined));
  });

  it('counts three copies', () => {
    expect(duplicateCounts('GEESE', 'EERIE')).toEqual([undefined, 3, 3, undefined, 3]);
  });
});

describe('bestMarks', () => {
  it('keeps the best mark each letter has earned', () => {
    const marks = bestMarks([
      ...evaluateGuess('EERIE', 'LEVEL', { duplicateCounts: false }),
      ...evaluateGuess('LATER', 'LEVEL', { duplicateCounts: false }),
    ]);
    expect(Object.fromEntries(marks)).toEqual({
      E: 'correct',
      R: 'absent',
      I: 'absent',
      L: 'correct',
      A: 'absent',
      T: 'absent',
    });
  });
});

describe('evaluateGuess', () => {
  it('adds badges when the rule is on', () => {
    expect(evaluateGuess('EERIE', 'LEVEL', { duplicateCounts: true })[0]).toEqual({
      letter: 'E',
      mark: 'present',
      answerCount: 2,
    });
  });

  it('leaves badges off when the rule is off', () => {
    expect(evaluateGuess('EERIE', 'LEVEL', { duplicateCounts: false })[0]).toEqual({
      letter: 'E',
      mark: 'present',
    });
  });
});
