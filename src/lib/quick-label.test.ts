import { describe, expect, it } from 'vitest';
import { newTemplate } from './model';
import { withExpiry } from './quick-label';

describe('quick print expiry', () => {
  it('keeps the saved template intact and clamps a month-end expiry', () => {
    const source = newTemplate();
    const output = withExpiry(source, 1, 0, new Date(2025, 0, 31, 9), 'ru');
    expect(output.height).toBe(source.height + 56);
    expect(output.elements.at(-1)).toMatchObject({ text: 'Годен до: 28.02.2025' });
    expect(source.elements).toHaveLength(2);
  });
  it('does not add an expiry line when no shelf life is entered', () => {
    const source = newTemplate();
    expect(withExpiry(source, 0, 0, new Date(), 'ru')).toBe(source);
  });
  it('fills a positioned expiry field and hides it when shelf life is empty', () => {
    const source = newTemplate();
    source.elements.push({
      ...source.elements[1],
      id: 'custom-expiry',
      type: 'date',
      source: 'expiry',
      prefix: 'Годен до: ',
      format: 'short',
      offsetYears: 0,
      offsetMonths: 0,
      offsetDays: 0,
    });
    const filled = withExpiry(source, 1, 0, new Date(2025, 0, 31, 9), 'ru');
    expect(filled.height).toBe(source.height);
    expect(filled.elements.at(-1)).toMatchObject({ text: 'Годен до: 28.02.2025' });
    expect(withExpiry(source, 0, 0, new Date(), 'ru').elements).toHaveLength(2);
  });
});
