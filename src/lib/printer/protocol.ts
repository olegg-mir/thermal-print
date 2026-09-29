import type { PrinterSettings } from '../model';

export function crc8(data: Uint8Array): number {
  let crc = 0;
  for (const value of data) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

export function command(opcode: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  if (payload.length > 0xffff) throw new Error('Command too long');
  const result = new Uint8Array(payload.length + 8);
  result.set([0x51, 0x78, opcode, 0, payload.length & 0xff, payload.length >> 8], 0);
  result.set(payload, 6);
  result[result.length - 2] = crc8(payload);
  result[result.length - 1] = 0xff;
  return result;
}

const latticeStart = Uint8Array.from([
  0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c,
]);
const latticeEnd = Uint8Array.from([0xaa, 0x55, 0x17, 0, 0, 0, 0, 0, 0, 0, 0x17]);
const blank = new Uint8Array(48);

export function buildJob(rows: Uint8Array[], settings: PrinterSettings): Uint8Array {
  if (rows.some((row) => row.length !== 48)) throw new Error('MX10 requires 384 pixels per row');
  const frames = [
    command(0xa3, Uint8Array.of(0)),
    command(0xa4, Uint8Array.of(0x32)),
    command(0xbd, Uint8Array.of(settings.speed)),
    command(0xaf, Uint8Array.of(settings.energy >> 8, settings.energy & 0xff)),
    command(0xbe, Uint8Array.of(0)),
    command(0xa6, latticeStart),
    ...Array.from({ length: settings.preFeed }, () => command(0xa2, blank)),
    ...rows.map((row) => command(0xa2, row)),
    ...Array.from({ length: settings.postFeed }, () => command(0xa2, blank)),
    command(0xa6, latticeEnd),
    command(0xa3, Uint8Array.of(0)),
  ];
  const total = frames.reduce((sum, frame) => sum + frame.length, 0);
  const job = new Uint8Array(total);
  let offset = 0;
  for (const frame of frames) {
    job.set(frame, offset);
    offset += frame.length;
  }
  return job;
}
