import { describe, expect, it } from 'vitest';
import { dateElementText, formatDate, shiftedLocalDate } from './calendar';
import type { DateElement } from './model';

describe('calendar labels', () => {
  it('clamps a month shift to the last day of February', () => {
    const date = shiftedLocalDate(new Date(2025, 0, 31, 9), 0, 1, 0);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2025, 1, 28]);
  });
  it('handles leap day and then applies day offset', () => {
    const date = shiftedLocalDate(new Date(2024, 0, 31, 9), 0, 1, 1);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2024, 2, 1]);
  });
  it('handles negative month offsets across years', () => {
    const date = shiftedLocalDate(new Date(2025, 0, 31, 9), 0, -2, 0);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2024, 10, 30]);
  });
  it('formats dynamic date fields in both languages', () => {
    const element = {
      type: 'date',
      prefix: 'Use by: ',
      format: 'iso',
      offsetDays: 2,
      offsetMonths: 0,
      offsetYears: 0,
    } as DateElement;
    expect(dateElementText(element, new Date(2026, 8, 29), 'en')).toBe('Use by: 2026-10-01');
    expect(formatDate(new Date(2026, 8, 29), 'short', 'ru')).toBe('29.09.2026');
  });
});
