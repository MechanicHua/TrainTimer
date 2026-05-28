import test from 'node:test';
import assert from 'node:assert/strict';
import {
  algorithmTrainerAlgorithmIsValid,
  algorithmTrainerAlgorithmStepCount,
  algorithmTrainerSetupText,
  cleanAlgorithmTrainerAlgorithm,
} from '../src/algorithm-trainer-utils.js';
import { cubeStateFromScramble, isSolvedFaces } from '../src/cube-state.js';

test('validates and normalizes trainer algorithms before storing them', () => {
  assert.equal(cleanAlgorithmTrainerAlgorithm("  R   U2   R'  "), "R U2 R'");
  assert.equal(algorithmTrainerAlgorithmIsValid("R U R'"), true);
  assert.equal(algorithmTrainerAlgorithmIsValid("R nonsense R'"), false);
});

test('builds inverse trainer setup and reports notation step count', () => {
  const algorithm = "R U2 R'";
  const setup = algorithmTrainerSetupText(algorithm);

  assert.equal(setup, 'R U2 R\'');
  assert.equal(algorithmTrainerAlgorithmStepCount(algorithm), 3);
  assert.equal(isSolvedFaces(cubeStateFromScramble(`${setup} ${algorithm}`)), true);
});
