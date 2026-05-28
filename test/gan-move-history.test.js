import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ganBluetoothIsDuplicateMovePacket,
  ganBluetoothMoveCounterDelta,
  ganBluetoothMovesFromDecoded,
  ganBluetoothNextMoveCounter,
} from '../public/gan-move-history.js';

test('uses GAN history moves to recover missed fast turns', () => {
  const decoded = {
    moves: ['U'],
    historyMoves: ['U', "R'", 'F2'],
    moveCounter: 12,
    counterModulo: 256,
  };

  assert.deepEqual(ganBluetoothMovesFromDecoded(decoded, 9), ['F2', "R'", 'U']);
});

test('keeps only the latest move when no counter gap is visible', () => {
  const decoded = {
    moves: ['U'],
    historyMoves: ['U', "R'", 'F2'],
    moveCounter: 12,
    counterModulo: 256,
  };

  assert.deepEqual(ganBluetoothMovesFromDecoded(decoded, 11), ['U']);
});

test('handles GAN move counter rollover', () => {
  assert.equal(ganBluetoothMoveCounterDelta(2, 250, 256), 8);
});

test('keeps state packet counters out of move packet dedupe state', () => {
  const statePacket = {
    mode: 'state',
    moveCounter: 42,
    counterModulo: 256,
    moves: [],
    historyMoves: [],
  };
  const movePacket = {
    mode: 'move',
    moveCounter: 42,
    counterModulo: 256,
    moves: ['U'],
    historyMoves: ['U'],
  };
  const previousMoveCounter = 41;
  const afterState = ganBluetoothNextMoveCounter(previousMoveCounter, statePacket, []);

  assert.equal(afterState, previousMoveCounter);
  assert.equal(ganBluetoothIsDuplicateMovePacket(movePacket, afterState), false);
  assert.deepEqual(ganBluetoothMovesFromDecoded(movePacket, afterState), ['U']);
  assert.equal(ganBluetoothNextMoveCounter(afterState, movePacket, ['U']), 42);
});
