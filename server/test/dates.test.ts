import { describe, expect, it } from 'vitest';
import { addDays, dateIn, daysBetween, isDate } from '../dates';

describe('dates', () => {
  it('steps over month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-04', '2026-11-22')).toBe(18);
  });

  it('accepts only real dates', () => {
    expect(isDate('2026-11-04')).toBe(true);
    for (const text of ['2026-13-01', '2026-00-05', '2026-02-30', '2026-1-4', 'today']) {
      expect(isDate(text), text).toBe(false);
    }
  });

  it('gives the date in a time zone, across the UK clock change', () => {
    expect(dateIn('Europe/London', new Date('2026-07-01T22:59:00Z'))).toBe('2026-07-01');
    expect(dateIn('Europe/London', new Date('2026-07-01T23:00:00Z'))).toBe('2026-07-02');
  });
});
