import test from 'node:test';
import assert from 'node:assert/strict';
import { algorithmTrainerBuiltInCasesForSet, algorithmTrainerCases } from '../src/algorithm-trainer-cases.js';
import { cubeStateFromScramble, isSolvedFaces, parseScramble } from '../src/cube-state.js';

const expectedSetCounts = {
  pll: 21,
  oll: 57,
  oll2: 10,
  f2lFull: 41,
  f2l: 12,
};

test('built-in algorithm trainer cases have stable ids and expected set counts', () => {
  const ids = algorithmTrainerCases.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const [set, count] of Object.entries(expectedSetCounts)) {
    assert.equal(algorithmTrainerCases.filter((item) => item.set === set).length, count);
  }
});

test('built-in algorithm trainer aggregate sets expose practical training pools', () => {
  const cfopCases = algorithmTrainerBuiltInCasesForSet('cfopFull');

  assert.equal(cfopCases.length, 119);
  assert.equal(cfopCases.filter((item) => item.set === 'f2lFull').length, 41);
  assert.equal(cfopCases.filter((item) => item.set === 'oll').length, 57);
  assert.equal(cfopCases.filter((item) => item.set === 'pll').length, 21);
});

test('built-in algorithm trainer cases parse and generate solved inverse setups', () => {
  for (const item of algorithmTrainerCases) {
    const algorithm = String(item.algorithm || '').trim();
    assert.ok(algorithm, `${item.id} has an algorithm`);
    const setup = invertAlgorithm(algorithm);
    const faces = cubeStateFromScramble(`${setup} ${algorithm}`);

    assert.ok(isSolvedFaces(faces), `${item.id} setup should be solved by its algorithm`);
  }
});

function invertAlgorithm(algorithm) {
  return parseScramble(algorithm)
    .reverse()
    .map(invertMove)
    .join(' ');
}

function invertMove(move) {
  if (move.suffix === '2') return `${move.face}2`;
  if (move.suffix === "'") return move.face;
  return `${move.face}'`;
}
