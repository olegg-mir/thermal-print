import { describe, expect, it } from 'vitest';
import { initialWorkspace } from './model';
import { parseWorkspace } from './storage';

describe('backup validation', () => {
  it('round trips a valid workspace', () => {
    const source = initialWorkspace();
    expect(parseWorkspace(JSON.parse(JSON.stringify(source)))).toEqual(source);
  });
  it('rejects unknown versions and invalid printer settings', () => {
    const source = initialWorkspace();
    expect(() => parseWorkspace({ ...source, version: 2 })).toThrow();
    expect(() =>
      parseWorkspace({ ...source, printer: { ...source.printer, packetSize: 1000 } }),
    ).toThrow();
  });
  it('rejects malformed date rules', () => {
    const source = initialWorkspace();
    const backup = structuredClone(source);
    (backup.templates[0].elements[1] as { offsetMonths: number }).offsetMonths = 1000;
    expect(() => parseWorkspace(backup)).toThrow();
  });
  it('loads older backups without a theme and validates new appearance values', () => {
    const source = initialWorkspace();
    const legacy = { ...source } as Partial<typeof source>;
    delete legacy.theme;
    expect(parseWorkspace(legacy).theme).toBe('light');
    expect(() => parseWorkspace({ ...source, theme: 'unknown' })).toThrow();
  });
  it('accepts saved dark themes, extra fonts and frames, and positioned expiry dates', () => {
    const source = initialWorkspace();
    source.theme = 'dark';
    source.templates[0].frame = 'freezer';
    source.templates[0].elements[1].style.fontFamily = 'Montserrat';
    if (source.templates[0].elements[1].type === 'date')
      source.templates[0].elements[1].source = 'expiry';
    expect(parseWorkspace(source)).toEqual(source);
  });
});
