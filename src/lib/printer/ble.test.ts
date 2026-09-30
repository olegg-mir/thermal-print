import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPrinterSettings } from '../model';
import { BlePrinter } from './ble';

class FakeCharacteristic extends EventTarget {
  value?: DataView;
  writes = 0;

  async startNotifications() {
    return this;
  }
  async writeValueWithoutResponse() {
    this.writes++;
  }
  notify(bytes: number[]) {
    this.value = new DataView(Uint8Array.from(bytes).buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

function fakeDevice() {
  const device = new EventTarget() as EventTarget & {
    name: string;
    gatt: { connected: boolean; connect: () => Promise<unknown>; disconnect: () => void };
  };
  const write = new FakeCharacteristic();
  const notifications = new FakeCharacteristic();
  const service = {
    getCharacteristic: async (id: string) => (id.includes('ae01') ? write : notifications),
  };
  device.name = 'MX10';
  device.gatt = {
    connected: false,
    connect: async () => {
      device.gatt.connected = true;
      return { getPrimaryService: async () => service };
    },
    disconnect: () => {
      if (!device.gatt.connected) return;
      device.gatt.connected = false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    },
  };
  return { device, write, notifications };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MX10 Bluetooth session', () => {
  it('clears a stop status on reconnect and can print without reloading the page', async () => {
    const { device, write, notifications } = fakeDevice();
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('navigator', { bluetooth: { requestDevice: async () => device } });
    const printer = new BlePrinter();
    await printer.choose();
    notifications.notify([0x51, 0x78, 0xae, 1, 1, 0, 0x0e, 0, 0xff]);
    const settings = {
      ...defaultPrinterSettings,
      preFeed: 0,
      postFeed: 0,
      packetSize: 10000,
      packetDelay: 0,
    };
    await expect(printer.print([], settings, 1)).rejects.toThrow('0xe');
    expect(printer.status).toBe('disconnected');
    await printer.reconnect();
    expect(printer.status).toBe('connected');
    vi.useFakeTimers();
    const job = printer.print([], settings, 1);
    await vi.advanceTimersByTimeAsync(3001);
    await job;
    expect(write.writes).toBe(1);
    expect(printer.status).toBe('disconnected');
  });

  it('drops an idle connection when the app is hidden', async () => {
    const { device } = fakeDevice();
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('navigator', { bluetooth: { requestDevice: async () => device } });
    const printer = new BlePrinter();
    await printer.choose();
    printer.onPageHidden();
    expect(device.gatt.connected).toBe(false);
    expect(printer.status).toBe('disconnected');
  });
});
