import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeGanBluetoothPacket,
  encodeGanBluetoothRequests,
  encodeGanPayload,
  normalizeGanMac,
} from '../src/gan-bluetooth.js';

const mac = '01:02:03:04:05:06';

test('normalizes GAN MAC addresses', () => {
  assert.equal(normalizeGanMac('01-02-03-04-05-06'), mac);
  assert.equal(normalizeGanMac('010203040506'), mac);
  assert.equal(normalizeGanMac('bad'), '');
});

test('builds encrypted GAN initialization requests', () => {
  const requests = encodeGanBluetoothRequests({ protocol: 'v3', mac });

  assert.deepEqual(requests.map((request) => request.label), ['硬件信息请求', '状态请求', '电量请求']);
  assert.equal(requests.length, 3);
  assert.equal(requests.every((request) => request.bytes.length === 16), true);
});

test('decodes GAN Gen3 move and battery packets', () => {
  const movePlain = [0x55, 0x01, 0x08, 0, 0, 0, 0, 42, 0, 0x02, 0, 0, 0, 0, 0, 0];
  const move = decodeGanBluetoothPacket({
    protocol: 'v3',
    mac,
    bytes: encodeGanPayload(movePlain, { mac }),
  });
  assert.equal(move.mode, 'move');
  assert.equal(move.moveCounter, 42);
  assert.deepEqual(move.moves, ['U']);

  const batteryPlain = [0x55, 0x10, 0x02, 88, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const battery = decodeGanBluetoothPacket({
    protocol: 'v3',
    mac,
    bytes: encodeGanPayload(batteryPlain, { mac }),
  });
  assert.equal(battery.mode, 'battery');
  assert.equal(battery.batteryLevel, 88);
});

test('decodes GAN Gen4 move and battery packets', () => {
  const movePlain = [0x01, 0x08, 0, 0, 0, 0, 9, 0, 0x60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const move = decodeGanBluetoothPacket({
    protocol: 'v4',
    mac,
    bytes: encodeGanPayload(movePlain, { mac }),
  });
  assert.equal(move.mode, 'move');
  assert.equal(move.moveCounter, 9);
  assert.deepEqual(move.moves, ["R'"]);

  const batteryPlain = [0xef, 0x01, 93, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const battery = decodeGanBluetoothPacket({
    protocol: 'v4',
    mac,
    bytes: encodeGanPayload(batteryPlain, { mac }),
  });
  assert.equal(battery.mode, 'battery');
  assert.equal(battery.batteryLevel, 93);
});

test('decodes GAN Gen2 battery packets', () => {
  const batteryPlain = [0x90, 77, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const battery = decodeGanBluetoothPacket({
    protocol: 'v2',
    mac,
    bytes: encodeGanPayload(batteryPlain, { mac }),
  });

  assert.equal(battery.mode, 'battery');
  assert.equal(battery.batteryLevel, 77);
});
