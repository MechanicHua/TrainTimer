import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeGanBluetoothPacket, encodeGanPayload } from '../src/gan-bluetooth.js';
import { decodeGanBluetoothPacketFast, supportsGanFastDecode } from '../public/gan-bluetooth-fast.js';

const mac = '01:02:03:04:05:06';

test('browser GAN fast decoder matches Gen4 gyro packets', async () => {
  assert.equal(supportsGanFastDecode(), true);
  const gyroPlain = [
    0xec, 0x0a, 0x81, 0x54, 0xa7, 0xff, 0xf9, 0x8e, 0x82, 0x39,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xb9, 0x1b,
  ];
  const bytes = encodeGanPayload(gyroPlain, { mac });
  const expected = decodeGanBluetoothPacket({ protocol: 'v4', mac, bytes });
  const actual = await decodeGanBluetoothPacketFast({ protocol: 'v4', mac, bytes });

  assert.deepEqual(actual, expected);
});

test('browser GAN fast decoder matches Gen4 state packets', async () => {
  const solvedPlain = [
    0xed, 0x0e, 0xc5, 0x00, 0x05, 0x39, 0x70, 0x00, 0x00, 0x09,
    0x1a, 0x2b, 0x3c, 0x4d, 0x00, 0x00, 0x00, 0x00, 0xdf, 0x3c,
  ];
  const bytes = encodeGanPayload(solvedPlain, { mac });
  const expected = decodeGanBluetoothPacket({ protocol: 'v4', mac, bytes });
  const actual = await decodeGanBluetoothPacketFast({ protocol: 'v4', mac, bytes });

  assert.deepEqual(actual, expected);
});

test('browser GAN fast decoder matches bundled Gen4 move records', async () => {
  const movePlain = [
    0x01, 0x07, 0x76, 0xcd, 0x0a, 0x00, 0x3a, 0x00, 0x10,
    0x01, 0x07, 0x76, 0xcd, 0x0a, 0x00, 0x3b, 0x00, 0x60,
    0x74, 0xa9,
  ];
  const bytes = encodeGanPayload(movePlain, { mac });
  const expected = decodeGanBluetoothPacket({ protocol: 'v4', mac, bytes });
  const actual = await decodeGanBluetoothPacketFast({ protocol: 'v4', mac, bytes });

  assert.deepEqual(actual, expected);
});

test('browser GAN fast decoder matches Gen3 move packets', async () => {
  const movePlain = [0x55, 0x01, 0x08, 0, 0, 0, 0, 42, 0, 0x02, 0, 0, 0, 0, 0, 0];
  const bytes = encodeGanPayload(movePlain, { mac });
  const expected = decodeGanBluetoothPacket({ protocol: 'v3', mac, bytes });
  const actual = await decodeGanBluetoothPacketFast({ protocol: 'v3', mac, bytes });

  assert.deepEqual(actual, expected);
});
