import { dateElementText } from './calendar';
import { PRINT_WIDTH, type LabelElement, type LabelTemplate, type Language } from './model';

export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function textFor(element: LabelElement, product: string, now: Date, language: Language): string {
  if (element.type === 'product')
    return product.trim() || (language === 'ru' ? 'Название продукта' : 'Product name');
  if (element.type === 'date') return dateElementText(element, now, language);
  return element.text;
}

function setFont(ctx: CanvasRenderingContext2D, element: LabelElement): void {
  const style = element.style;
  ctx.font = `${style.bold ? '700' : '400'} ${style.fontSize}px "${style.fontFamily}"`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000';
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      result.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        result.push(line);
        line = '';
      }
      for (const char of word) {
        if (ctx.measureText(line + char).width > width && line) {
          result.push(line);
          line = '';
        }
        line += char;
      }
    }
    result.push(line);
  }
  return result;
}

export function elementBox(
  ctx: CanvasRenderingContext2D,
  element: LabelElement,
  product: string,
  now: Date,
  language: Language,
): ElementBox {
  setFont(ctx, element);
  const lines = wrapText(ctx, textFor(element, product, now, language), element.width);
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: Math.max(1, lines.length) * Math.ceil(element.style.fontSize * 1.22),
  };
}

function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
}

function drawFrame(ctx: CanvasRenderingContext2D, template: LabelTemplate): void {
  const h = template.height;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  if (template.frame === 'classic') {
    rounded(ctx, 12, 12, 360, h - 24, 14);
    ctx.lineWidth = 1;
    rounded(ctx, 19, 19, 346, h - 38, 10);
  } else if (template.frame === 'jar') {
    rounded(ctx, 21, 29, 342, h - 46, 34);
    rounded(ctx, 51, 11, 282, 30, 7);
    ctx.beginPath();
    ctx.moveTo(55, 43);
    ctx.lineTo(329, 43);
    ctx.stroke();
  } else if (template.frame === 'container') {
    rounded(ctx, 16, 37, 352, h - 53, 24);
    rounded(ctx, 9, 17, 366, 30, 9);
    ctx.beginPath();
    ctx.moveTo(29, 52);
    ctx.lineTo(355, 52);
    ctx.stroke();
  } else if (template.frame === 'bag') {
    rounded(ctx, 22, 55, 340, h - 70, 14);
    ctx.beginPath();
    ctx.moveTo(22, 74);
    ctx.lineTo(362, 74);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(192, 55, 25, Math.PI, 0);
    ctx.stroke();
  } else if (template.frame === 'leaves') {
    rounded(ctx, 12, 12, 360, h - 24, 18);
    for (const y of [38, h - 38]) {
      for (const x of [45, 339]) {
        ctx.beginPath();
        ctx.ellipse(x, y, 13, 6, x < 192 ? -0.5 : 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (template.frame === 'dots') {
    for (let x = 18; x < 370; x += 14)
      for (const y of [15, h - 15]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    for (let y = 29; y < h - 20; y += 14)
      for (const x of [16, 368]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (template.frame === 'bottle') {
    rounded(ctx, 21, 48, 342, h - 62, 44);
    rounded(ctx, 111, 24, 162, 30, 8);
    rounded(ctx, 122, 11, 140, 16, 4);
  } else if (template.frame === 'freezer') {
    rounded(ctx, 12, 12, 360, h - 24, 17);
    for (const x of [39, 345]) {
      for (const y of [40, h - 40]) {
        for (let angle = 0; angle < Math.PI; angle += Math.PI / 3) {
          const dx = Math.cos(angle) * 12;
          const dy = Math.sin(angle) * 12;
          ctx.beginPath();
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
        }
      }
    }
  } else if (template.frame === 'ribbon') {
    rounded(ctx, 15, 14, 354, h - 28, 9);
    ctx.lineWidth = 1;
    rounded(ctx, 22, 21, 340, h - 42, 6);
    for (const x of [48, 336]) {
      for (const y of [42, h - 42]) {
        ctx.beginPath();
        ctx.moveTo(x - 9, y);
        ctx.lineTo(x, y + 7);
        ctx.lineTo(x + 9, y);
        ctx.stroke();
      }
    }
  }
}

export function renderLabel(
  template: LabelTemplate,
  product: string,
  now: Date,
  language: Language,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PRINT_WIDTH;
  canvas.height = template.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  drawFrame(ctx, template);
  for (const element of template.elements) {
    setFont(ctx, element);
    const lines = wrapText(ctx, textFor(element, product, now, language), element.width);
    const lineHeight = Math.ceil(element.style.fontSize * 1.22);
    lines.forEach((line, index) => {
      const measured = ctx.measureText(line).width;
      const x =
        element.style.align === 'center'
          ? element.x + (element.width - measured) / 2
          : element.style.align === 'right'
            ? element.x + element.width - measured
            : element.x;
      ctx.fillText(line, x, element.y + lineHeight * index);
    });
  }
  return canvas;
}

export function overflowIds(
  template: LabelTemplate,
  product: string,
  now: Date,
  language: Language,
): string[] {
  const ctx = document.createElement('canvas').getContext('2d')!;
  return template.elements
    .filter((element) => {
      const box = elementBox(ctx, element, product, now, language);
      return (
        box.x < 0 ||
        box.y < 0 ||
        box.x + box.width > PRINT_WIDTH ||
        box.y + box.height > template.height
      );
    })
    .map((element) => element.id);
}

export function canvasToRows(canvas: HTMLCanvasElement): Uint8Array[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const rows: Uint8Array[] = [];
  for (let y = 0; y < canvas.height; y++) {
    const row = new Uint8Array(48);
    for (let x = 0; x < PRINT_WIDTH; x++) {
      const index = (y * PRINT_WIDTH + x) * 4;
      const light =
        pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
      if (light < 175) row[x >> 3] |= 1 << (x & 7);
    }
    rows.push(row);
  }
  return rows;
}
