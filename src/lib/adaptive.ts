import { formatDate, shiftedLocalDate } from './calendar';
import {
  ADAPTIVE_TEMPLATE_ID,
  PRINT_WIDTH,
  type LabelElement,
  type LabelTemplate,
  type Language,
  type StaticElement,
} from './model';
import { wrapText } from './render';

const SIDE = 8;
const PRODUCT_SIZE = 50;
const DATE_SIZE = 20;
const PRODUCT_LINE_HEIGHT = Math.ceil(PRODUCT_SIZE * 1.22);
const DATE_LINE_HEIGHT = Math.ceil(DATE_SIZE * 1.22);
const WIDTH = PRINT_WIDTH - SIDE * 2;

export interface AdaptiveOptions {
  product: string;
  baseDate: Date;
  showProductionDate: boolean;
  shelfLifeMonths: number;
  shelfLifeDays: number;
  language: Language;
}

/** The same Canvas text wrapping used for the final raster determines tape length. */
export function adaptiveTemplate(
  options: AdaptiveOptions,
  context: CanvasRenderingContext2D,
): LabelTemplate {
  const { product, baseDate, showProductionDate, shelfLifeMonths, shelfLifeDays, language } =
    options;
  context.font = `700 ${PRODUCT_SIZE}px "Noto Sans"`;
  const label = product.trim() || (language === 'ru' ? 'Название продукта' : 'Product name');
  const lines = wrapText(context, label, WIDTH);
  const elements: LabelElement[] = [
    {
      id: 'adaptive-product',
      type: 'product',
      x: SIDE,
      y: 12,
      width: WIDTH,
      style: { fontFamily: 'Noto Sans', fontSize: PRODUCT_SIZE, bold: true, align: 'center' },
    },
  ];
  let cursor = 12 + Math.max(1, lines.length) * PRODUCT_LINE_HEIGHT;

  const addDate = (id: string, text: string, gap: number) => {
    cursor += gap;
    const element: StaticElement = {
      id,
      type: 'text',
      x: SIDE,
      y: cursor,
      width: WIDTH,
      text,
      style: { fontFamily: 'Noto Sans', fontSize: DATE_SIZE, bold: false, align: 'center' },
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
    frame: 'none',
    height: Math.ceil((cursor + 12) / 8) * 8,
    elements,
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
}
