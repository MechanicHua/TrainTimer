import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeGanBluetoothPacket, encodeGanPayload } from '../src/gan-bluetooth.js';
import { applyMove, cubeFromFaces, facesFromCube, isSolvedFaces, parseScramble } from '../src/cube-state.js';
import {
  ganBluetoothIsDuplicateMovePacket,
  ganBluetoothMovesFromDecoded,
  ganBluetoothNextMoveCounter,
} from '../public/gan-move-history.js';

const mac = '01:02:03:04:05:06';
const faceOrder = ['U', 'R', 'F', 'D', 'L', 'B'];

test('GAN state resync lets the final move stop timing before the solved state packet', () => {
  const result = applyGanMovePacketsFromState({
    facelets: 'UUUUUUUUUFFFRRRRRRLLLFFFFFFDDDDDDDDDBBBLLLLLLRRRBBBBBB',
    previousMoveCounter: 16,
    packets: [
      [
        0x01, 0x07, 0x9e, 0xc0, 0x0e, 0x00, 0x11, 0x00, 0x02,
        0x02, 0x04, 0x9e, 0xc0, 0x0e, 0x00, 0x00, 0x00, 0x00, 0x51, 0x5f,
      ],
    ],
  });

  assert.deepEqual(result.appliedMoves, ['U']);
  assert.equal(result.lastMoveCounter, 17);
  assert.equal(result.solved, true);
});

test('GAN bundled final turns stop timing without waiting for the next state packet', () => {
  const result = applyGanMovePacketsFromState({
    facelets: 'DDDUUUDDDBFBRRRRRRLLLBFBBFBUDUUDUUDUFBFLLLLLLRRRFBFFBF',
    previousMoveCounter: 54,
    packets: [
      [
        0x01, 0x07, 0x68, 0xcc, 0x0a, 0x00, 0x37, 0x00, 0x02,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ],
      [
        0x01, 0x07, 0x23, 0xcd, 0x0a, 0x00, 0x38, 0x00, 0x10,
        0x01, 0x07, 0x23, 0xcd, 0x0a, 0x00, 0x39, 0x00, 0x60, 0x1a, 0xd5,
      ],
      [
        0x01, 0x07, 0x76, 0xcd, 0x0a, 0x00, 0x3a, 0x00, 0x10,
        0x01, 0x07, 0x76, 0xcd, 0x0a, 0x00, 0x3b, 0x00, 0x60, 0x74, 0xa9,
      ],
    ],
  });

  assert.deepEqual(result.appliedMoves, ['U', 'L', "R'", 'L', "R'"]);
  assert.equal(result.lastMoveCounter, 59);
  assert.equal(result.solved, true);
});

function applyGanMovePacketsFromState({ facelets, previousMoveCounter, packets }) {
  const cube = cubeFromFaces(facesFromFacelets(facelets));
  let lastMoveCounter = previousMoveCounter;
  const appliedMoves = [];

  for (const plainPacket of packets) {
    const decoded = decodeGanBluetoothPacket({
      protocol: 'v4',
      mac,
      bytes: encodeGanPayload(plainPacket, { mac }),
    });
    const duplicate = ganBluetoothIsDuplicateMovePacket(decoded, lastMoveCounter);
    const moves = duplicate ? [] : ganBluetoothMovesFromDecoded(decoded, lastMoveCounter);
    lastMoveCounter = ganBluetoothNextMoveCounter(lastMoveCounter, decoded, moves);

    for (const moveText of moves) {
      applyMove(cube, parseScramble(moveText)[0]);
      appliedMoves.push(moveText);
    }
  }

  return {
    appliedMoves,
    lastMoveCounter,
    solved: isSolvedFaces(facesFromCube(cube)),
  };
}

function facesFromFacelets(facelets) {
  assert.match(facelets, /^[URFDLB]{54}$/);
  const output = {};
  for (const [faceIndex, face] of faceOrder.entries()) {
    output[face] = [];
    const offset = faceIndex * 9;
    for (let row = 0; row < 3; row += 1) {
      output[face][row] = [];
      for (let col = 0; col < 3; col += 1) {
        output[face][row][col] = { face: facelets[offset + row * 3 + col] };
      }
    }
  }
  return output;
}
