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

const DATE_SIZE = 20;
const DATE_LINE_HEIGHT = Math.ceil(DATE_SIZE * 1.22);

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
  const top = settings.frameEnabled ? (['bag', 'bottle', 'freezer'].includes(frame) ? 64 : 24) : 12;
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
      style: { fontFamily: settings.fontFamily, fontSize: DATE_SIZE, bold: false, align: 'center' },
    };
    elements.push(element);
    cursor += DATE_LINE_HEIGHT;
  };

  if (showProductionDate) {
    addDate(
      'adaptive-date',
      `${language === 'ru' ? 'Дата: ' : 'Date: '}${formatDate(baseDate, 'short', language)}`,
      12,
    );
  }
  if (shelfLifeMonths > 0 || shelfLifeDays > 0) {
    const expiry = shiftedLocalDate(baseDate, 0, shelfLifeMonths, shelfLifeDays);
    addDate(
      'adaptive-expiry',
      `${language === 'ru' ? 'Годен до: ' : 'Best before: '}${formatDate(expiry, 'short', language)}`,
      showProductionDate ? 8 : 12,
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
