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
    expect(() => parseWorkspace({ ...source, version: 4 })).toThrow();
    expect(() =>
      parseWorkspace({ ...source, printer: { ...source.printer, packetSize: 1000 } }),
    ).toThrow();
  });
  it('migrates version 1 templates and validates a bounded print history', () => {
    const source = initialWorkspace();
    const old = { ...source, version: 1 } as Record<string, unknown>;
    delete old.history;
    expect(parseWorkspace(old)).toMatchObject({
      version: 3,
      history: [],
      templates: source.templates,
      adaptive: source.adaptive,
    });
    source.history = [
      {
        id: 'job-1',
        printedAt: '2026-09-30T10:00:00.000Z',
        templateId: source.templates[0].id,
        product: 'Томаты',
        baseDate: '2026-09-30',
        shelfLifeMonths: 1,
        shelfLifeDays: 0,
        copies: 2,
        showProductionDate: true,
      },
    ];
    expect(parseWorkspace(source).history).toEqual(source.history);
    const oldV2 = { ...source, version: 2 } as Record<string, unknown>;
    delete oldV2.adaptive;
    expect(parseWorkspace(oldV2).adaptive).toEqual(source.adaptive);
    source.history[0].adaptive = { ...source.adaptive, fontSize: 36 };
    expect(parseWorkspace(source).history[0].adaptive?.fontSize).toBe(36);
    expect(() =>
      parseWorkspace({ ...source, adaptive: { ...source.adaptive, fontSize: 500 } }),
    ).toThrow();
    expect(() =>
      parseWorkspace({ ...source, history: [{ ...source.history[0], baseDate: '2026-02-30' }] }),
    ).toThrow();
    expect(() =>
      parseWorkspace({ ...source, history: Array(11).fill(source.history[0]) }),
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
    for (const frame of ['stripes', 'waves', 'corners'] as const) {
      source.templates[0].frame = frame;
      source.adaptive.frame = frame;
      expect(parseWorkspace(source).templates[0].frame).toBe(frame);
      expect(parseWorkspace(source).adaptive.frame).toBe(frame);
    }
  });
});
