import test from 'node:test';
import assert from 'node:assert/strict';
import { faceletsFromScramble, solvedFaceletString } from '../src/cube-state.js';
import { stopTnoodle } from '../src/tnoodle-service.js';
import { after } from 'node:test';
after(() => stopTnoodle());
import { drawScrambleSvg, generateFallbackThreeByThreeScramble, generateScramble } from '../src/scramble.js';

const threeByThreeMovePattern = /^[UDRLFB](2|')?$/;

test('generates scrambles through bundled TNoodle CLI when available', async () => {
  const result = await generateScramble();
  const moves = result.scramble.split(' ');

  assert.equal(result.source, 'bundled-tnoodle-cli-1.1.1');
  assert.equal(result.puzzle, 'three');
  // Random-state solutions can be shorter than 17; length is not the contract.
  assert.ok(moves.length > 0, result.scramble);
  assert.notEqual(faceletsFromScramble(result.scramble), solvedFaceletString);
  assert.ok(moves.length <= 25);
  for (const move of moves) assert.match(move, threeByThreeMovePattern);
});

test('generates requested TNoodle puzzle scrambles', async () => {
  const result = await generateScramble('two');
  const moves = result.scramble.split(' ');

  assert.equal(result.source, 'bundled-tnoodle-cli-1.1.1');
  assert.equal(result.puzzle, 'two');
  assert.ok(moves.length >= 8);
  for (const move of moves) assert.match(move, threeByThreeMovePattern);
});

test('fallback scramble has valid 3x3 moves and avoids repeated faces', () => {
  const scramble = generateFallbackThreeByThreeScramble(25);
  const moves = scramble.split(' ');

  assert.equal(moves.length, 25);

  let previousFace = null;
  for (const move of moves) {
    assert.match(move, threeByThreeMovePattern);
    assert.notEqual(move[0], previousFace);
    previousFace = move[0];
  }
});

test('draws scramble previews through bundled TNoodle CLI when available', async () => {
  const result = await drawScrambleSvg('R U');

  assert.equal(result.source, 'bundled-tnoodle-cli-1.1.1');
  assert.equal(result.puzzle, 'three');
  assert.match(result.svg, /^<svg[\s>]/);
  assert.match(result.svg, /viewBox="0 0 130 98"/);
});
