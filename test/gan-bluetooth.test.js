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

test('decodes bundled GAN Gen4 move records in one notification', () => {
  const movePlain = [
    0x01, 0x07, 0x76, 0xcd, 0x0a, 0x00, 0x3a, 0x00, 0x10,
    0x01, 0x07, 0x76, 0xcd, 0x0a, 0x00, 0x3b, 0x00, 0x60,
    0x74, 0xa9,
  ];
  const move = decodeGanBluetoothPacket({
    protocol: 'v4',
    mac,
    bytes: encodeGanPayload(movePlain, { mac }),
  });

  assert.equal(move.mode, 'move');
  assert.equal(move.moveCounter, 59);
  assert.deepEqual(move.moves, ['L', "R'"]);
  assert.deepEqual(move.historyMoves, ['L', "R'"]);
});

test('decodes GAN Gen4 solved state packets', () => {
  const solvedPlain = [
    0xed, 0x0e, 0xc5, 0x00, 0x05, 0x39, 0x70, 0x00, 0x00, 0x09,
    0x1a, 0x2b, 0x3c, 0x4d, 0x00, 0x00, 0x00, 0x00, 0xdf, 0x3c,
  ];
  const solved = decodeGanBluetoothPacket({
    protocol: 'v4',
    mac,
    bytes: encodeGanPayload(solvedPlain, { mac }),
  });
  assert.equal(solved.mode, 'state');
  assert.equal(solved.moveCounter, 197);
  assert.equal(solved.stateSolved, true);
  assert.equal(solved.stateSignature, '05 39 70 00 00 09 1a 2b 3c 4d 00 00 00 00');
  assert.equal(solved.facelets, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  assert.deepEqual(solved.state.cp, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(solved.state.co, [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(solved.state.ep, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(solved.state.eo, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  const unsolvedPlain = [
    0xed, 0x0e, 0xb6, 0x00, 0x05, 0x3b, 0xb8, 0x00, 0x00, 0x09,
    0x1a, 0xb3, 0xa4, 0x4d, 0x00, 0x00, 0x00, 0x00, 0xe2, 0x17,
  ];
  const unsolved = decodeGanBluetoothPacket({
    protocol: 'v4',
    mac,
    bytes: encodeGanPayload(unsolvedPlain, { mac }),
  });
  assert.equal(unsolved.mode, 'state');
  assert.equal(unsolved.stateSolved, false);
  assert.notEqual(unsolved.facelets, solved.facelets);
});

test('decodes GAN Gen4 gyro packets', () => {
  const gyroPlain = [
    0xec, 0x0a, 0x81, 0x54, 0xa7, 0xff, 0xf9, 0x8e, 0x82, 0x39,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xb9, 0x1b,
  ];
  const gyro = decodeGanBluetoothPacket({
    protocol: 'v4',
    mac,
    bytes: encodeGanPayload(gyroPlain, { mac }),
  });

  assert.equal(gyro.mode, 'gyro');
  assert.equal(gyro.gyro.raw.qw, 0x8154);
  assert.equal(gyro.gyro.velocity.x, 0);
  assert.equal(gyro.gyro.velocity.y, 0);
  assert.equal(gyro.gyro.velocity.z, 0);
  assert.equal(Math.hypot(
    gyro.gyro.quaternion.x,
    gyro.gyro.quaternion.y,
    gyro.gyro.quaternion.z,
    gyro.gyro.quaternion.w,
  ) > 0.99, true);
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
