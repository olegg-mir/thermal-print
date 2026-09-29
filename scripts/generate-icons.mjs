import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
for (const size of [192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png);
}
