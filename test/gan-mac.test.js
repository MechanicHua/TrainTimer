import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGanMacFromAdvertisementData,
  extractGanMacFromManufacturerData,
  ganManufacturerCompanyId,
  ganManufacturerDataOptions,
} from '../public/gan-mac.js';

test('uses the GAN manufacturer data permission id from Web Bluetooth advertisements', () => {
  assert.equal(ganManufacturerCompanyId, 0x0001);
  assert.equal(ganManufacturerDataOptions.length, 256);
  assert.equal(ganManufacturerDataOptions[0], 0x0001);
  assert.equal(ganManufacturerDataOptions[1], 0x0101);
  assert.equal(ganManufacturerDataOptions.at(-1), 0xff01);
});

test('extracts GAN MAC from the last six manufacturer payload bytes', () => {
  const payload = new DataView(Uint8Array.from([0x02, 0x13, 0x37, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]).buffer);

  assert.equal(extractGanMacFromAdvertisementData(payload), '01:02:03:04:05:06');
});

test('extracts GAN MAC from BluetoothManufacturerData map', () => {
  const payload = new DataView(Uint8Array.from([0xaa, 0xbb, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11]).buffer);
  const manufacturerData = new Map([[0x1201, payload]]);

  assert.equal(extractGanMacFromManufacturerData(manufacturerData), '11:22:33:44:55:66');
});

test('extracts GAN MAC from legacy advertisement DataView with company bytes', () => {
  const payload = new DataView(Uint8Array.from([0x01, 0x12, 0xaa, 0xbb, 0xcc, 0x60, 0x50, 0x40, 0x30, 0x20, 0x10]).buffer);

  assert.equal(extractGanMacFromManufacturerData(payload), '10:20:30:40:50:60');
});

test('ignores short advertisement payloads', () => {
  assert.equal(extractGanMacFromAdvertisementData([0x01, 0x02, 0x03, 0x04, 0x05]), '');
  assert.equal(extractGanMacFromManufacturerData(new Map([[ganManufacturerCompanyId, new DataView(new ArrayBuffer(0))]])), '');
});
