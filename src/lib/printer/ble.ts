import type { PrinterSettings } from '../model';
import { buildJob } from './protocol';

const AE30 = '0000ae30-0000-1000-8000-00805f9b34fb';
const AF30 = '0000af30-0000-1000-8000-00805f9b34fb';
const uuid = (code: string) => `0000${code}-0000-1000-8000-00805f9b34fb`;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type PrinterStatus = 'idle' | 'connecting' | 'connected' | 'printing' | 'disconnected';

export class BlePrinter {
  device?: BluetoothDevice;
  characteristic?: BluetoothRemoteGATTCharacteristic;
  status: PrinterStatus = 'idle';
  onStatus?: (status: PrinterStatus) => void;
  onProgress?: (progress: number) => void;
  onError?: (message: string) => void;
  private paused = false;

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator && window.isSecureContext;
  }

  private update(status: PrinterStatus): void {
    this.status = status;
    this.onStatus?.(status);
  }

  async choose(): Promise<string> {
    if (!BlePrinter.supported()) throw new Error('Web Bluetooth unavailable');
    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [AE30] },
        { services: [AF30] },
        { namePrefix: 'MX' },
        { namePrefix: 'GB' },
        { namePrefix: 'GT' },
        { namePrefix: 'YT' },
      ],
      optionalServices: [AE30, AF30],
    });
    this.device.addEventListener('gattserverdisconnected', () => {
      this.characteristic = undefined;
      this.update('disconnected');
    });
    await this.connect();
    return this.device.name || 'BLE printer';
  }

  async connect(): Promise<void> {
    if (!this.device?.gatt) throw new Error('Choose a printer first');
    if (this.device.gatt.connected && this.characteristic) return;
    this.update('connecting');
    try {
      const server = await this.device.gatt.connect();
      let service: BluetoothRemoteGATTService;
      let family = 'ae';
      try {
        service = await server.getPrimaryService(AE30);
      } catch {
        service = await server.getPrimaryService(AF30);
        family = 'af';
      }
      this.characteristic = await service.getCharacteristic(uuid(`${family}01`));
      try {
        const notifications = await service.getCharacteristic(uuid(`${family}02`));
        await notifications.startNotifications();
        notifications.addEventListener('characteristicvaluechanged', (event) => {
          const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
          const flags = value && value.byteLength > 6 ? value.getUint8(6) : 0;
          this.paused = (flags & 0x10) !== 0;
          if (flags & 0x0f) this.onError?.(`Printer status: 0x${flags.toString(16)}`);
        });
      } catch {
        /* Some compatible models do not expose notifications. */
      }
      this.update('connected');
    } catch (error) {
      this.update('disconnected');
      throw error;
    }
  }

  async print(rows: Uint8Array[], settings: PrinterSettings, copies: number): Promise<void> {
    if (!this.device) throw new Error('Choose a printer first');
    const job = buildJob(rows, settings);
    for (let copy = 0; copy < copies; copy++) {
      await this.connect();
      const characteristic = this.characteristic!;
      this.update('printing');
      try {
        for (let offset = 0; offset < job.length; offset += settings.packetSize) {
          let wait = 0;
          while (this.paused && wait++ < 100) await delay(100);
          if (this.paused) throw new Error('Printer did not resume');
          await characteristic.writeValueWithoutResponse(
            job.slice(offset, offset + settings.packetSize),
          );
          this.onProgress?.(
            (copy + Math.min(1, (offset + settings.packetSize) / job.length)) / copies,
          );
          if (settings.packetDelay) await delay(settings.packetDelay);
        }
        // Allow the MX10 buffer to drain before closing GATT; the next copy reconnects.
        await delay(3000);
      } finally {
        this.device.gatt?.disconnect();
        this.characteristic = undefined;
      }
    }
    this.onProgress?.(1);
    this.update('disconnected');
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
    this.characteristic = undefined;
    this.update('disconnected');
  }
}
