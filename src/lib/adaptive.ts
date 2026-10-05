import { formatDate, shiftedLocalDate } from './calendar';
import {
  ADAPTIVE_TEMPLATE_ID,
  PRINT_WIDTH,
  type AdaptiveSettings,
  type LabelElement,
  type LabelTemplate,
  type Language,
  type StaticElement,
} from './model';
import { wrapText } from './render';

export interface AdaptiveOptions {
  product: string;
  baseDate: Date;
  showProductionDate: boolean;
  shelfLifeMonths: number;
  shelfLifeDays: number;
  language: Language;
  settings: AdaptiveSettings;
}

/** The same Canvas text wrapping used for the final raster determines tape length. */
export function adaptiveTemplate(
  options: AdaptiveOptions,
  context: CanvasRenderingContext2D,
): LabelTemplate {
  const {
    product,
    baseDate,
    showProductionDate,
    shelfLifeMonths,
    shelfLifeDays,
    language,
    settings,
  } = options;
  const frame = settings.frameEnabled ? settings.frame : 'none';
  const side = settings.frameEnabled ? 24 : 8;
  const top = settings.frameEnabled
    ? ['jar', 'container', 'bag', 'leaves', 'bottle', 'freezer', 'ribbon'].includes(frame)
      ? 64
      : 24
    : 12;
  const width = PRINT_WIDTH - side * 2;
  const productLineHeight = Math.ceil(settings.fontSize * 1.22);
  context.font = `${settings.bold ? 700 : 400} ${settings.fontSize}px "${settings.fontFamily}"`;
  const label = product.trim() || (language === 'ru' ? 'Название продукта' : 'Product name');
  const lines = wrapText(context, label, width);
  const elements: LabelElement[] = [
    {
      id: 'adaptive-product',
      type: 'product',
      x: side,
      y: top,
      width,
      style: {
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        bold: settings.bold,
        align: 'center',
      },
    },
  ];
  let cursor = top + Math.max(1, lines.length) * productLineHeight;

  const addDate = (id: string, text: string, gap: number) => {
    cursor += gap;
    const element: StaticElement = {
      id,
      type: 'text',
      x: side,
      y: cursor,
      width,
      text,
      style: {
        fontFamily: settings.dateFontFamily,
        fontSize: settings.dateFontSize,
        bold: settings.dateBold,
        align: 'center',
      },
    };
    elements.push(element);
    context.font = `${settings.dateBold ? 700 : 400} ${settings.dateFontSize}px "${settings.dateFontFamily}"`;
    cursor +=
      Math.max(1, wrapText(context, text, width).length) * Math.ceil(settings.dateFontSize * 1.22);
  };

  if (showProductionDate) {
    addDate(
      'adaptive-date',
      `${language === 'ru' ? 'Дата: ' : 'Date: '}${formatDate(baseDate, 'short', language)}`,
      4,
    );
  }
  if (shelfLifeMonths > 0 || shelfLifeDays > 0) {
    const expiry = shiftedLocalDate(baseDate, 0, shelfLifeMonths, shelfLifeDays);
    addDate(
      'adaptive-expiry',
      `${language === 'ru' ? 'Годен до: ' : 'Best before: '}${formatDate(expiry, 'short', language)}`,
      showProductionDate ? 6 : 4,
    );
  }

  return {
    id: ADAPTIVE_TEMPLATE_ID,
    name: language === 'ru' ? 'Адаптивный' : 'Adaptive',
    frame,
    height: Math.max(
      settings.frameEnabled ? 104 : 0,
      Math.ceil((cursor + (settings.frameEnabled ? 24 : 12)) / 8) * 8,
    ),
    elements,
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
}
