import { parseLocalDateInput } from './calendar';
import {
  ADAPTIVE_TEMPLATE_ID,
  defaultAdaptiveSettings,
  defaultPrinterSettings,
  initialWorkspace,
  type Workspace,
  type AdaptiveSettings,
} from './model';

const DB_NAME = 'thermal-print';
const STORE = 'data';
const KEY = 'workspace';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadWorkspace(): Promise<Workspace> {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        try {
          resolve(request.result ? parseWorkspace(request.result) : initialWorkspace());
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(workspace, KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function number(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
const frames = [
  'none',
  'classic',
  'jar',
  'container',
  'bag',
  'leaves',
  'dots',
  'bottle',
  'freezer',
  'ribbon',
  'stripes',
  'waves',
  'corners',
];
const fonts = ['Noto Sans', 'Noto Serif', 'Roboto Condensed', 'Montserrat', 'Caveat', 'monospace'];
const aligns = ['left', 'center', 'right'];
const formats = ['short', 'shortYear', 'iso', 'long'];

function parseAdaptive(value: unknown): AdaptiveSettings {
  if (
    !object(value) ||
    !fonts.includes(String(value.fontFamily)) ||
    !number(value.fontSize, 16, 96) ||
    typeof value.bold !== 'boolean' ||
    typeof value.frameEnabled !== 'boolean' ||
    value.frame === 'none' ||
    !frames.includes(String(value.frame))
  )
    throw new Error('Invalid adaptive settings');
  return value as unknown as AdaptiveSettings;
}

export function parseWorkspace(value: unknown): Workspace {
  if (
    !object(value) ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3) ||
    !Array.isArray(value.templates) ||
    value.templates.length === 0 ||
    value.templates.length > 100 ||
    (value.theme !== undefined && !['light', 'dark', 'system'].includes(String(value.theme))) ||
    !object(value.printer)
  )
    throw new Error('Invalid backup version or structure');
  const templates = value.templates.map((raw) => {
    if (
      !object(raw) ||
      typeof raw.id !== 'string' ||
      typeof raw.name !== 'string' ||
      raw.name.length > 100 ||
      !number(raw.height, 160, 2400) ||
      !frames.includes(String(raw.frame)) ||
      !Array.isArray(raw.elements) ||
      raw.elements.length > 40 ||
      typeof raw.updatedAt !== 'string'
    )
      throw new Error('Invalid template');
    const elements = raw.elements.map((element) => {
      if (
        !object(element) ||
        typeof element.id !== 'string' ||
        !number(element.x, 0, 384) ||
        !number(element.y, 0, 2400) ||
        !number(element.width, 24, 384) ||
        !object(element.style) ||
        !fonts.includes(String(element.style.fontFamily)) ||
        !number(element.style.fontSize, 8, 96) ||
        typeof element.style.bold !== 'boolean' ||
        !aligns.includes(String(element.style.align))
      )
        throw new Error('Invalid element');
      if (
        element.type === 'text' &&
        (typeof element.text !== 'string' || element.text.length > 500)
      )
        throw new Error('Invalid text');
      if (
        element.type === 'date' &&
        (typeof element.prefix !== 'string' ||
          element.prefix.length > 100 ||
          (element.source !== undefined && !['today', 'expiry'].includes(String(element.source))) ||
          !formats.includes(String(element.format)) ||
          !number(element.offsetDays, -3650, 3650) ||
          !number(element.offsetMonths, -120, 120) ||
          !number(element.offsetYears, -10, 10))
      )
        throw new Error('Invalid date');
      if (!['product', 'text', 'date'].includes(String(element.type)))
        throw new Error('Invalid element type');
      return element;
    });
    return { ...raw, elements };
  }) as unknown as Workspace['templates'];
  const printer = value.printer;
  if (
    !number(printer.energy, 0, 65535) ||
    !number(printer.speed, 1, 255) ||
    !number(printer.preFeed, 0, 256) ||
    !number(printer.postFeed, 0, 256) ||
    !number(printer.packetSize, 20, 200) ||
    !number(printer.packetDelay, 0, 100)
  )
    throw new Error('Invalid printer settings');
  const selectedTemplateId =
    typeof value.selectedTemplateId === 'string' ? value.selectedTemplateId : '';
  const historyRaw = value.version === 1 ? [] : value.history;
  if (!Array.isArray(historyRaw) || historyRaw.length > 10)
    throw new Error('Invalid print history');
  const history = historyRaw.map((raw) => {
    if (
      !object(raw) ||
      typeof raw.id !== 'string' ||
      typeof raw.printedAt !== 'string' ||
      !Number.isFinite(Date.parse(raw.printedAt)) ||
      typeof raw.templateId !== 'string' ||
      typeof raw.product !== 'string' ||
      raw.product.length > 200 ||
      typeof raw.baseDate !== 'string' ||
      !parseLocalDateInput(raw.baseDate) ||
      !number(raw.shelfLifeMonths, 0, 120) ||
      !number(raw.shelfLifeDays, 0, 3650) ||
      !number(raw.copies, 1, 20) ||
      typeof raw.showProductionDate !== 'boolean'
    )
      throw new Error('Invalid print history entry');
    if (raw.adaptive !== undefined) parseAdaptive(raw.adaptive);
    return raw;
  }) as unknown as Workspace['history'];
  return {
    version: 3,
    language: value.language === 'en' ? 'en' : 'ru',
    theme: value.theme === 'dark' || value.theme === 'system' ? value.theme : 'light',
    selectedTemplateId:
      selectedTemplateId === ADAPTIVE_TEMPLATE_ID ||
      templates.some((t) => t.id === selectedTemplateId)
        ? selectedTemplateId
        : (templates[0]?.id ?? ''),
    templates,
    printer: { ...defaultPrinterSettings, ...printer } as Workspace['printer'],
    adaptive: value.version === 3 ? parseAdaptive(value.adaptive) : { ...defaultAdaptiveSettings },
    history,
  };
}

export function exportWorkspace(workspace: Workspace): Blob {
  return new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' });
}
