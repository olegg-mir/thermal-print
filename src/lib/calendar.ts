import type { DateElement, Language } from './model';

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function shiftedLocalDate(source: Date, years: number, months: number, days: number): Date {
  const target = new Date(source.getFullYear(), source.getMonth(), source.getDate(), 12);
  const monthIndex = target.getMonth() + months + years * 12;
  const year = target.getFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(target.getDate(), daysInMonth(year, month));
  return new Date(year, month, day + days, 12);
}

export function formatDate(date: Date, format: DateElement['format'], language: Language): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  if (format === 'iso') return `${year}-${month}-${day}`;
  if (format === 'shortYear') return `${day}.${month}.${year.slice(-2)}`;
  if (format === 'long')
    return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  return `${day}.${month}.${year}`;
}

export function dateElementText(element: DateElement, now: Date, language: Language): string {
  // The editor uses a seven-day example. Quick print replaces expiry fields with the real date.
  const base = element.source === 'expiry' ? shiftedLocalDate(now, 0, 0, 7) : now;
  const date = shiftedLocalDate(
    base,
    element.offsetYears,
    element.offsetMonths,
    element.offsetDays,
  );
  return `${element.prefix}${formatDate(date, element.format, language)}`;
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
