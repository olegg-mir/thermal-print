import { describe, expect, it } from 'vitest';
import { canvasToRows, wrapText } from './render';

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
});
