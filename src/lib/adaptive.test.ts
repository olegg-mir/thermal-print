import { describe, expect, it } from 'vitest';
import { adaptiveTemplate } from './adaptive';
import { defaultAdaptiveSettings } from './model';

const context = {
  font: '',
  measureText: (text: string) => ({ width: text.length * 24 }),
} as CanvasRenderingContext2D;
const base = {
  baseDate: new Date(2025, 0, 31, 12),
  showProductionDate: false,
  shelfLifeMonths: 0,
  shelfLifeDays: 0,
  language: 'ru' as const,
  settings: defaultAdaptiveSettings,
};

describe('adaptive system template', () => {
  it('grows only with wrapped product lines and enabled dates', () => {
    const oneLine = adaptiveTemplate({ ...base, product: 'Сыр' }, context);
    const twoLines = adaptiveTemplate(
      { ...base, product: 'Домашнее варенье из клубники и абрикосов' },
      context,
    );
    const dated = adaptiveTemplate({ ...base, product: 'Сыр', showProductionDate: true }, context);
    const bothDates = adaptiveTemplate(
      { ...base, product: 'Сыр', showProductionDate: true, shelfLifeMonths: 1 },
      context,
    );
    expect(oneLine.height).toBeLessThan(twoLines.height);
    expect(oneLine.height).toBeLessThan(dated.height);
    expect(dated.height).toBeLessThan(bothDates.height);
    expect(bothDates.elements[0].style).toMatchObject({ fontSize: 50, bold: true });
    expect(bothDates.elements[0].width).toBe(368);
    expect(bothDates.elements.slice(1).every((element) => element.style.fontSize === 20)).toBe(
      true,
    );
    expect(bothDates.elements.at(-1)).toMatchObject({ text: 'Годен до: 28.02.2025' });
    expect(dated.elements[1].y - (dated.elements[0].y + Math.ceil(50 * 1.22))).toBe(4);
    for (const template of [oneLine, twoLines, dated, bothDates])
      expect(template.height % 8).toBe(0);
  });
  it('uses saved font and frame settings in the same dynamic layout', () => {
    const plain = adaptiveTemplate(
      { ...base, product: 'Очень длинное название продукта' },
      context,
    );
    const styled = adaptiveTemplate(
      {
        ...base,
        product: 'Очень длинное название продукта',
        settings: {
          fontFamily: 'Noto Serif',
          fontSize: 64,
          bold: false,
          frameEnabled: true,
          frame: 'classic',
        },
      },
      context,
    );
    expect(styled.frame).toBe('classic');
    expect(styled.elements[0]).toMatchObject({
      x: 24,
      width: 336,
      style: { fontFamily: 'Noto Serif', fontSize: 64, bold: false },
    });
    expect(styled.height).toBeGreaterThan(plain.height);
    expect(styled.height % 8).toBe(0);
  });
});
