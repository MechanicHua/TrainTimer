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

test('browser GAN fast decoder can skip Gen4 gyro payload parsing', async () => {
  const gyroPlain = [
    0xec, 0x0a, 0x81, 0x54, 0xa7, 0xff, 0xf9, 0x8e, 0x82, 0x39,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xb9, 0x1b,
  ];
  const bytes = encodeGanPayload(gyroPlain, { mac });
  const actual = await decodeGanBluetoothPacketFast({
    protocol: 'v4',
    mac,
    bytes,
    skipGyroPayload: true,
  });

  assert.equal(actual.mode, 'gyro');
  assert.equal(actual.gyro, undefined);
  assert.deepEqual(actual.moves, []);
  assert.deepEqual(actual.decryptedBytes, gyroPlain);
});

test('browser GAN fast decoder uses a lean Gen4 gyro result on the hot path', async () => {
  const gyroPlain = [
    0xec, 0x0a, 0x81, 0x54, 0xa7, 0xff, 0xf9, 0x8e, 0x82, 0x39,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xb9, 0x1b,
  ];
  const bytes = encodeGanPayload(gyroPlain, { mac });
  const actual = await decodeGanBluetoothPacketFast({
    protocol: 'v4',
    mac,
    bytes,
    skipGyroPayload: true,
    includeDecryptedBytes: false,
    includeStateSignature: false,
  });

  assert.equal(actual.protocol, 'gan-v4');
  assert.equal(actual.mode, 'gyro');
  assert.equal(actual.gyro, undefined);
  assert.equal(actual.decryptedBytes, undefined);
  assert.deepEqual(actual.moves, []);
  assert.deepEqual(actual.historyMoves, []);
});

test('browser GAN fast decoder returns synchronously on the hot path', () => {
  const gyroPlain = [
    0xec, 0x0a, 0x81, 0x54, 0xa7, 0xff, 0xf9, 0x8e, 0x82, 0x39,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xb9, 0x1b,
  ];
  const bytes = encodeGanPayload(gyroPlain, { mac });
  const actual = decodeGanBluetoothPacketFast({
    protocol: 'v4',
    mac,
    bytes,
    skipGyroPayload: true,
    includeDecryptedBytes: false,
    includeStateSignature: false,
  });

  assert.equal(typeof actual?.then, 'undefined');
  assert.equal(actual.mode, 'gyro');
});

test('browser GAN fast decoder reuses the lean Gen4 gyro hot-path object', async () => {
  const gyroPlain = [
    0xec, 0x0a, 0x81, 0x54, 0xa7, 0xff, 0xf9, 0x8e, 0x82, 0x39,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xb9, 0x1b,
  ];
  const bytes = encodeGanPayload(gyroPlain, { mac });
  const options = {
    protocol: 'v4',
    mac,
    bytes,
    skipGyroPayload: true,
    includeDecryptedBytes: false,
    includeStateSignature: false,
  };
  const first = await decodeGanBluetoothPacketFast(options);
  const second = await decodeGanBluetoothPacketFast(options);

  assert.equal(first, second);
  assert.equal(first.moves, second.moves);
  assert.equal(first.historyMoves, second.historyMoves);
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

test('browser GAN fast decoder can omit Gen4 debug fields on hot path', async () => {
  const solvedPlain = [
    0xed, 0x0e, 0xc5, 0x00, 0x05, 0x39, 0x70, 0x00, 0x00, 0x09,
    0x1a, 0x2b, 0x3c, 0x4d, 0x00, 0x00, 0x00, 0x00, 0xdf, 0x3c,
  ];
  const bytes = encodeGanPayload(solvedPlain, { mac });
  const actual = await decodeGanBluetoothPacketFast({
    protocol: 'v4',
    mac,
    bytes,
    includeStateSignature: false,
    includeStateDetails: false,
    includeDecryptedBytes: false,
  });

  assert.equal(actual.mode, 'state');
  assert.equal(actual.stateSolved, true);
  assert.equal(actual.stateSignature, undefined);
  assert.equal(actual.state, undefined);
  assert.equal(actual.decryptedBytes, undefined);
  assert.equal(actual.facelets, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
});

test('browser GAN fast decoder skips facelets for repeated Gen4 state packets', async () => {
  const solvedPlain = [
    0xed, 0x0e, 0xc5, 0x00, 0x05, 0x39, 0x70, 0x00, 0x00, 0x09,
    0x1a, 0x2b, 0x3c, 0x4d, 0x00, 0x00, 0x00, 0x00, 0xdf, 0x3c,
  ];
  const bytes = encodeGanPayload(solvedPlain, { mac });
  const first = await decodeGanBluetoothPacketFast({
    protocol: 'v4',
    mac,
    bytes,
    includeStateSignature: true,
    includeStateDetails: false,
    includeDecryptedBytes: false,
  });
  const repeated = await decodeGanBluetoothPacketFast({
    protocol: 'v4',
    mac,
    bytes,
    omitRepeatedStateFacelets: true,
    previousStateSignature: first.stateSignature,
    previousStateSolved: first.stateSolved,
    includeStateSignature: true,
    includeStateDetails: false,
    includeDecryptedBytes: false,
  });

  assert.equal(repeated.mode, 'state');
  assert.equal(repeated.stateUnchanged, true);
  assert.equal(repeated.stateSolved, true);
  assert.equal(repeated.facelets, undefined);
  assert.equal(repeated.state, undefined);
  assert.equal(repeated.stateSignature, first.stateSignature);
});

test('browser GAN fast decoder safely reuses hot-path decrypt buffers', async () => {
  const solvedPlain = [
    0xed, 0x0e, 0xc5, 0x00, 0x05, 0x39, 0x70, 0x00, 0x00, 0x09,
    0x1a, 0x2b, 0x3c, 0x4d, 0x00, 0x00, 0x00, 0x00, 0xdf, 0x3c,
  ];
  const movePlain = [
    0x01, 0x07, 0x76, 0xcd, 0x0a, 0x00, 0x3a, 0x00, 0x10,
    0x01, 0x07, 0x76, 0xcd, 0x0a, 0x00, 0x3b, 0x00, 0x60,
    0x74, 0xa9,
  ];
  const solvedBytes = encodeGanPayload(solvedPlain, { mac });
  const moveBytes = encodeGanPayload(movePlain, { mac });
  const state = await decodeGanBluetoothPacketFast({
    protocol: 'v4',
    mac,
    bytes: solvedBytes,
    includeStateSignature: true,
    includeStateDetails: false,
    includeDecryptedBytes: false,
  });
  const moves = await decodeGanBluetoothPacketFast({
    protocol: 'v4',
    mac,
    bytes: moveBytes,
    includeStateSignature: false,
    includeStateDetails: false,
    includeDecryptedBytes: false,
  });
  const repeated = await decodeGanBluetoothPacketFast({
    protocol: 'v4',
    mac,
    bytes: solvedBytes,
    omitRepeatedStateFacelets: true,
    previousStateSignature: state.stateSignature,
    previousStateSolved: state.stateSolved,
    includeStateSignature: true,
    includeStateDetails: false,
    includeDecryptedBytes: false,
  });

  assert.equal(state.facelets, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  assert.deepEqual(moves.moves, ['L', "R'"]);
  assert.equal(repeated.stateUnchanged, true);
  assert.equal(repeated.facelets, undefined);
  assert.equal(state.decryptedBytes, undefined);
  assert.equal(moves.decryptedBytes, undefined);
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

test('browser GAN fast decoder matches Gen2 battery packets', async () => {
  const batteryPlain = [0x90, 77, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const bytes = encodeGanPayload(batteryPlain, { mac });
  const expected = decodeGanBluetoothPacket({ protocol: 'v2', mac, bytes });
  const actual = await decodeGanBluetoothPacketFast({ protocol: 'v2', mac, bytes });

  assert.deepEqual(actual, expected);
});
