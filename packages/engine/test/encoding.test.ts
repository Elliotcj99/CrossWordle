import { describe, expect, it } from 'vitest';
import { decodeAnswer, encodeAnswer } from '../src';

describe('answer encoding', () => {
  it('round-trips an answer', () => {
    const encoded = encodeAnswer('SETTLED', '2026-10-23');
    expect(encoded).not.toContain('SETTLED');
    expect(decodeAnswer(encoded, '2026-10-23')).toBe('SETTLED');
  });

  it('refuses an empty key', () => {
    expect(() => encodeAnswer('ODD', '')).toThrow(RangeError);
  });
});
