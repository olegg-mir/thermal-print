import { formatDate, shiftedLocalDate } from './calendar';
import type { LabelTemplate, Language, StaticElement } from './model';

/** Adds a print-time expiry line without changing the saved template. */
export function withExpiry(
  template: LabelTemplate,
  months: number,
  days: number,
  now: Date,
  language: Language,
): LabelTemplate {
  const hasExpiry = months > 0 || days > 0;
  const customExpiry = template.elements.some(
    (element) => element.type === 'date' && element.source === 'expiry',
  );
  if (!hasExpiry && !customExpiry) return template;
  const expiry = shiftedLocalDate(now, 0, months, days);
  if (customExpiry) {
    const elements = template.elements.flatMap((element) => {
      if (element.type !== 'date' || element.source !== 'expiry') return [element];
      if (!hasExpiry) return [];
      const date = shiftedLocalDate(
        expiry,
        element.offsetYears,
        element.offsetMonths,
        element.offsetDays,
      );
      const resolved: StaticElement = {
        id: element.id,
        type: 'text',
        x: element.x,
        y: element.y,
        width: element.width,
        style: element.style,
        text: `${element.prefix}${formatDate(date, element.format, language)}`,
      };
      return [resolved];
    });
    return { ...template, elements };
  }
  const element: StaticElement = {
    id: 'quick-expiry',
    type: 'text',
    x: 44,
    y: template.height + 2,
    width: 296,
    text: `${language === 'ru' ? 'Годен до: ' : 'Best before: '}${formatDate(expiry, 'short', language)}`,
    style: { fontFamily: 'Noto Sans', fontSize: 20, bold: false, align: 'center' },
  };
  return { ...template, height: template.height + 56, elements: [...template.elements, element] };
}
