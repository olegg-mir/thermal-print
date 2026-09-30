export type Language = 'ru' | 'en';
export type Frame =
  | 'none'
  | 'classic'
  | 'jar'
  | 'container'
  | 'bag'
  | 'leaves'
  | 'dots'
  | 'bottle'
  | 'freezer'
  | 'ribbon';
export type FontFamily =
  'Noto Sans' | 'Noto Serif' | 'Roboto Condensed' | 'Montserrat' | 'Caveat' | 'monospace';
export type Theme = 'light' | 'dark' | 'system';
export type Align = 'left' | 'center' | 'right';
export type DateFormat = 'short' | 'shortYear' | 'iso' | 'long';

export interface TextStyle {
  fontFamily: FontFamily;
  fontSize: number;
  bold: boolean;
  align: Align;
}

export interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  style: TextStyle;
}

export interface ProductElement extends BaseElement {
  type: 'product';
}
export interface StaticElement extends BaseElement {
  type: 'text';
  text: string;
}
export interface DateElement extends BaseElement {
  type: 'date';
  source?: 'today' | 'expiry';
  prefix: string;
  format: DateFormat;
  offsetDays: number;
  offsetMonths: number;
  offsetYears: number;
}
export type LabelElement = ProductElement | StaticElement | DateElement;

export interface LabelTemplate {
  id: string;
  name: string;
  height: number;
  frame: Frame;
  elements: LabelElement[];
  updatedAt: string;
}

export interface PrinterSettings {
  energy: number;
  speed: number;
  preFeed: number;
  postFeed: number;
  packetSize: number;
  packetDelay: number;
}

export interface Workspace {
  version: 1;
  language: Language;
  theme: Theme;
  selectedTemplateId: string;
  templates: LabelTemplate[];
  printer: PrinterSettings;
}

export const PRINT_WIDTH = 384;
export const DOTS_PER_MM = 8;

export const defaultPrinterSettings: PrinterSettings = {
  energy: 65535,
  speed: 32,
  preFeed: 5,
  postFeed: 100,
  packetSize: 160,
  packetDelay: 20,
};

export function newTemplate(name = 'Продукт', language: Language = 'ru'): LabelTemplate {
  const id = crypto.randomUUID();
  return {
    id,
    name,
    height: 320,
    frame: 'jar',
    updatedAt: new Date().toISOString(),
    elements: [
      {
        id: crypto.randomUUID(),
        type: 'product',
        x: 44,
        y: 120,
        width: 296,
        style: { fontFamily: 'Noto Sans', fontSize: 32, bold: true, align: 'center' },
      },
      {
        id: crypto.randomUUID(),
        type: 'date',
        x: 44,
        y: 224,
        width: 296,
        prefix: language === 'ru' ? 'Дата: ' : 'Date: ',
        format: 'short',
        offsetDays: 0,
        offsetMonths: 0,
        offsetYears: 0,
        style: { fontFamily: 'Noto Sans', fontSize: 20, bold: false, align: 'center' },
      },
    ],
  };
}

export function initialWorkspace(): Workspace {
  const template = newTemplate();
  return {
    version: 1,
    language: 'ru',
    theme: 'light',
    selectedTemplateId: template.id,
    templates: [template],
    printer: { ...defaultPrinterSettings },
  };
}

export function duplicateTemplate(
  template: LabelTemplate,
  language: Language = 'ru',
): LabelTemplate {
  return {
    ...structuredClone(template),
    id: crypto.randomUUID(),
    name: `${template.name} ${language === 'ru' ? 'копия' : 'copy'}`,
    updatedAt: new Date().toISOString(),
    elements: template.elements.map((element) => ({
      ...structuredClone(element),
      id: crypto.randomUUID(),
    })),
  };
}
