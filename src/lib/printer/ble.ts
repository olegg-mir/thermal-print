import type { PrinterSettings } from '../model';
import { buildJob } from './protocol';

const AE30 = '0000ae30-0000-1000-8000-00805f9b34fb';
const AF30 = '0000af30-0000-1000-8000-00805f9b34fb';
const uuid = (code: string) => `0000${code}-0000-1000-8000-00805f9b34fb`;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function timed<T>(operation: Promise<T>, label: string, ms = 12000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export type PrinterStatus = 'idle' | 'connecting' | 'connected' | 'printing' | 'disconnected';

export class BlePrinter {
  device?: BluetoothDevice;
  characteristic?: BluetoothRemoteGATTCharacteristic;
  status: PrinterStatus = 'idle';
  onStatus?: (status: PrinterStatus) => void;
  onProgress?: (progress: number) => void;
  onError?: (message: string) => void;
  private notifications?: BluetoothRemoteGATTCharacteristic;
  private notificationHandler?: EventListener;
  private paused = false;
  private fault = 0;
  private session = 0;

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator && window.isSecureContext;
  }

  private update(status: PrinterStatus): void {
    this.status = status;
    this.onStatus?.(status);
  }

  private readonly onDisconnected = () => {
    if (this.device?.gatt?.connected) return;
    this.clearSession();
    this.update('disconnected');
  };

  private clearSession(): void {
    this.session++;
    if (this.notifications && this.notificationHandler) {
      this.notifications.removeEventListener(
        'characteristicvaluechanged',
        this.notificationHandler,
      );
    }
    this.notifications = undefined;
    this.notificationHandler = undefined;
    this.characteristic = undefined;
    this.paused = false;
    this.fault = 0;
  }

  async choose(): Promise<string> {
    if (!BlePrinter.supported()) throw new Error('Web Bluetooth unavailable');
    const device = await navigator.bluetooth.requestDevice({
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
    this.disconnect();
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.device = device;
    device.addEventListener('gattserverdisconnected', this.onDisconnected);
    await this.connect();
    return device.name || 'BLE printer';
  }

  async reconnect(): Promise<string> {
    if (!this.device) return this.choose();
    this.disconnect();
    await this.connect();
    return this.device.name || 'BLE printer';
  }

  /** A backgrounded browser can retain a GATT object whose radio link has gone stale. */
  onPageHidden(): void {
    if (this.status === 'connected' || this.status === 'connecting') this.disconnect();
  }

  async connect(): Promise<void> {
    if (!this.device?.gatt) throw new Error('Choose a printer first');
    if (this.device.gatt.connected && this.characteristic) return;
    this.clearSession();
    const currentSession = this.session;
    this.update('connecting');
    try {
      const server = await timed(this.device.gatt.connect(), 'Bluetooth connection');
      let service: BluetoothRemoteGATTService;
      let family = 'ae';
      try {
        service = await timed(server.getPrimaryService(AE30), 'Bluetooth service');
      } catch {
        service = await timed(server.getPrimaryService(AF30), 'Bluetooth service');
        family = 'af';
      }
      const characteristic = await timed(
        service.getCharacteristic(uuid(`${family}01`)),
        'Bluetooth write channel',
      );
      try {
        const notifications = await timed(
          service.getCharacteristic(uuid(`${family}02`)),
          'Bluetooth notifications',
        );
        await timed(notifications.startNotifications(), 'Bluetooth notifications');
        const handler: EventListener = (event) => {
          if (this.session !== currentSession) return;
          const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
          // AE is the flow-control frame. Other replies can carry unrelated payloads.
          if (
            !value ||
            value.byteLength < 9 ||
            value.getUint8(0) !== 0x51 ||
            value.getUint8(1) !== 0x78 ||
            value.getUint8(2) !== 0xae
          )
            return;
          const flags = value.getUint8(6);
          this.paused = (flags & 0x10) !== 0;
          this.fault = flags & 0x0f;
          if (this.fault) this.onError?.(`Printer status: 0x${flags.toString(16)}`);
        };
        notifications.addEventListener('characteristicvaluechanged', handler);
        this.notifications = notifications;
        this.notificationHandler = handler;
      } catch {
        // Some compatible models do not expose notifications.
      }
      if (this.session !== currentSession) throw new Error('Bluetooth connection was interrupted');
      this.characteristic = characteristic;
      this.update('connected');
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  async print(rows: Uint8Array[], settings: PrinterSettings, copies: number): Promise<void> {
    if (!this.device) throw new Error('Choose a printer first');
    const job = buildJob(rows, settings);
    try {
      for (let copy = 0; copy < copies; copy++) {
        await this.connect();
        const characteristic = this.characteristic!;
        this.update('printing');
        try {
          for (let offset = 0; offset < job.length; offset += settings.packetSize) {
            if (this.characteristic !== characteristic) throw new Error('Bluetooth disconnected');
            if (this.fault) throw new Error(`Printer stopped: 0x${this.fault.toString(16)}`);
            let wait = 0;
            while (this.paused && wait++ < 100) await delay(100);
            if (this.paused) throw new Error('Printer did not resume');
            await timed(
              characteristic.writeValueWithoutResponse(
                job.slice(offset, offset + settings.packetSize),
              ),
              'Bluetooth write',
            );
            this.onProgress?.(
              (copy + Math.min(1, (offset + settings.packetSize) / job.length)) / copies,
            );
            if (settings.packetDelay) await delay(settings.packetDelay);
          }
          // Let the MX10 buffer drain; each copy then gets a fresh GATT session.
          await delay(3000);
          if (this.fault) throw new Error(`Printer stopped: 0x${this.fault.toString(16)}`);
        } finally {
          this.disconnect();
        }
      }
      this.onProgress?.(1);
    } finally {
      this.disconnect();
    }
  }

  disconnect(): void {
    this.clearSession();
    this.device?.gatt?.disconnect();
    this.update('disconnected');
  }
}
