import { describe, expect, it } from 'vitest';
import { defaultPrinterSettings } from '../model';
import { buildJob, command, crc8 } from './protocol';

describe('MX10 protocol', () => {
  it('matches the documented 200 DPI frame', () => {
    expect([...command(0xa4, Uint8Array.of(0x32))]).toEqual([
      0x51, 0x78, 0xa4, 0, 1, 0, 0x32, 0x9e, 0xff,
    ]);
    expect(crc8(Uint8Array.of(0x32))).toBe(0x9e);
  });
  it('frames a 384-dot row and feed rows inside lattice boundaries', () => {
    const row = new Uint8Array(48);
    row[0] = 0x81;
    const job = buildJob([row], { ...defaultPrinterSettings, preFeed: 1, postFeed: 1 });
    const hex = [...job].map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(hex.match(/5178a2003000/g)?.length).toBe(3);
    expect(hex.indexOf('5178a6000b00')).toBeLessThan(hex.indexOf('5178a2003000'));
    expect(hex.lastIndexOf('5178a6000b00')).toBeGreaterThan(hex.lastIndexOf('5178a2003000'));
    expect(job.length).toBeGreaterThan(150);
  });
  it('rejects a row wider than the MX10 print head', () => {
    expect(() => buildJob([new Uint8Array(49)], defaultPrinterSettings)).toThrow(/384/);
  });
});
