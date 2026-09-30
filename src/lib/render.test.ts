import { describe, expect, it, vi } from 'vitest';
import { newTemplate } from './model';
import { canvasToRows, overflowIds, wrapText } from './render';

describe('label raster', () => {
  it('wraps a long product name within the element width', () => {
    const context = { measureText: (text: string) => ({ width: text.length * 10 }) };
    const lines = wrapText(context as CanvasRenderingContext2D, 'Homemade strawberry jam', 100);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length <= 10)).toBe(true);
    expect(lines.join(' ')).toBe('Homemade strawberry jam');
  });

  it('packs black pixels LSB-first into 48 bytes', () => {
    const pixels = new Uint8ClampedArray(384 * 4).fill(255);
    for (const x of [0, 7, 9]) pixels.fill(0, x * 4, x * 4 + 3);
    const canvas = {
      width: 384,
      height: 1,
      getContext: () => ({ getImageData: () => ({ data: pixels }) }),
    } as unknown as HTMLCanvasElement;
    const rows = canvasToRows(canvas);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(48);
    expect(rows[0][0]).toBe(0b10000001);
    expect(rows[0][1]).toBe(0b00000010);
  });

  it('allows text to overlap a frame but detects actual canvas overflow', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({ measureText: (value: string) => ({ width: value.length * 10 }) }),
      }),
    });
    try {
      const template = newTemplate();
      template.elements = [template.elements[0]];
      template.elements[0].y = 34;
      expect(overflowIds(template, 'Название продукта', new Date(2026, 8, 30), 'ru')).toEqual([]);
      template.elements[0].x = 100;
      expect(overflowIds(template, 'Название продукта', new Date(2026, 8, 30), 'ru')).toEqual([
        template.elements[0].id,
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
