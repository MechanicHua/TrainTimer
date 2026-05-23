import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBatteryLevel, decodeBluetoothMoves } from '../src/bluetooth-moves.js';

test('decodes ASCII move notifications into WCA notation', () => {
  const encoded = new TextEncoder().encode('MOVE R U2 F\'\n');
  const decoded = decodeBluetoothMoves(new DataView(encoded.buffer));

  assert.equal(decoded.protocol, 'notation-text');
  assert.deepEqual(decoded.moves, ['R', 'U2', "F'"]);
  assert.equal(decoded.text, 'MOVE R U2 F\'\n');
});

test('ignores binary packets that do not contain notation moves', () => {
  const decoded = decodeBluetoothMoves([0x01, 0xff, 0x02, 0x7f]);

  assert.equal(decoded.protocol, 'raw');
  assert.deepEqual(decoded.moves, []);
});

test('decodes JSON move notifications explicitly', () => {
  const encoded = new TextEncoder().encode(JSON.stringify({
    moves: ['r', 'U2'],
    latest: 'ignored',
    turn: 'F’',
  }));
  const decoded = decodeBluetoothMoves(encoded);

  assert.equal(decoded.protocol, 'notation-json');
  assert.deepEqual(decoded.moves, ['R', 'U2', "F'"]);
});

test('decodes separated text moves and unicode prime notation', () => {
  const encoded = new TextEncoder().encode('R,U2;F′ D`');
  const decoded = decodeBluetoothMoves(encoded);

  assert.equal(decoded.protocol, 'notation-text');
  assert.deepEqual(decoded.moves, ['R', 'U2', "F'", "D'"]);
});

test('decodes GoCube and Rubiks Connected move packets', () => {
  const decoded = decodeBluetoothMoves([
    0x2a, 0x00, 0x01,
    0x08, 0x00,
    0x05, 0x00,
    0x00, 0x0d, 0x0a,
  ]);

  assert.equal(decoded.protocol, 'gocube-move');
  assert.deepEqual(decoded.moves, ['R', "U'"]);
  assert.equal(decoded.batteryLevel, null);
});

test('decodes GoCube and Rubiks Connected battery packets', () => {
  const decoded = decodeBluetoothMoves([0x2a, 0x00, 0x05, 88, 0x00, 0x00, 0x0d, 0x0a]);

  assert.equal(decoded.protocol, 'gocube-battery');
  assert.deepEqual(decoded.moves, []);
  assert.equal(decoded.batteryLevel, 88);
});

test('decodes the latest move from Giiker and Mi Smart history packets', () => {
  const packet = Array(20).fill(0);
  packet[16] = 0x41; // U
  packet[17] = 0x53; // R'
  packet[18] = 0x62; // F2

  const decoded = decodeBluetoothMoves(packet);

  assert.equal(decoded.protocol, 'giiker-latest-move');
  assert.deepEqual(decoded.moves, ['U']);
  assert.deepEqual(decoded.historyMoves, ['U', "R'", 'F2']);
});

test('decodes encrypted Giiker and Mi Smart history packets', () => {
  const target = Array(18).fill(0);
  target[16] = 0x41; // U
  target[17] = 0x53; // R'
  const key = [
    176, 81, 104, 224, 86, 137, 237, 119, 38, 26, 193, 161, 210, 126, 150, 81, 93, 13,
  ];
  const packet = target.map((byte, index) => (byte - key[index] - key[index] + 512) & 0xff);
  packet.push(0xa7, 0x00);

  const decoded = decodeBluetoothMoves(packet);

  assert.equal(decoded.protocol, 'giiker-encrypted-latest-move');
  assert.deepEqual(decoded.moves, ['U']);
  assert.deepEqual(decoded.historyMoves, ['U', "R'"]);
});

test('decodes standard Bluetooth battery levels', () => {
  const buffer = Uint8Array.from([87]).buffer;
  assert.equal(decodeBatteryLevel(new DataView(buffer)), 87);
  assert.equal(decodeBatteryLevel([0]), 0);
  assert.equal(decodeBatteryLevel([100]), 100);
  assert.equal(decodeBatteryLevel([101]), null);
  assert.equal(decodeBatteryLevel([]), null);
});
