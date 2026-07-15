import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bluetoothStateLogPostSolveCaptureMs,
  bluetoothStateLogRevision,
  shouldCaptureBluetoothStateLogPacket,
} from '../src/bluetooth-state-log.js';

test('captures state packets while timing and briefly after a bluetooth stop', () => {
  assert.ok(bluetoothStateLogPostSolveCaptureMs >= 1000);
  assert.equal(shouldCaptureBluetoothStateLogPacket('timing', 5000, 0), true);
  assert.equal(shouldCaptureBluetoothStateLogPacket('saving', 5000, 5500), true);
  assert.equal(shouldCaptureBluetoothStateLogPacket('done', 5500, 5500), true);
  assert.equal(shouldCaptureBluetoothStateLogPacket('done', 5501, 5500), false);
  assert.equal(shouldCaptureBluetoothStateLogPacket('ready', 5000, 5500), false);
});

test('state log revision changes for distinct packets at the same move step', () => {
  const first = [{ step: 12, timestampMs: 1000, stateSignature: 'a', raw: '01' }];
  const second = [...first, { step: 12, timestampMs: 1010, stateSignature: 'b', raw: '02' }];
  assert.notEqual(bluetoothStateLogRevision(first), bluetoothStateLogRevision(second));
  assert.equal(bluetoothStateLogRevision(second), bluetoothStateLogRevision(second.map((entry) => ({ ...entry }))));
});
