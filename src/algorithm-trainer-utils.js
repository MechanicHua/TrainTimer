import { parseScramble } from './cube-state.js';

const maxAlgorithmLength = 220;

export function cleanAlgorithmTrainerAlgorithm(value, options = {}) {
  const maxLength = Number.isInteger(options.maxLength) && options.maxLength > 0
    ? options.maxLength
    : maxAlgorithmLength;
  const algorithm = String(value || '').trim().replace(/\s+/g, ' ');
  if (!algorithm) return '';
  if (algorithm.length > maxLength) throw new Error(`公式不能超过 ${maxLength} 个字符`);
  parseScramble(algorithm);
  return algorithm;
}

export function algorithmTrainerAlgorithmIsValid(value) {
  try {
    return Boolean(cleanAlgorithmTrainerAlgorithm(value));
  } catch {
    return false;
  }
}

export function algorithmTrainerAlgorithmStepCount(value) {
  const algorithm = cleanAlgorithmTrainerAlgorithm(value);
  return algorithm ? parseScramble(algorithm).length : 0;
}

export function algorithmTrainerSetupText(algorithm = '') {
  const moves = parseScramble(cleanAlgorithmTrainerAlgorithm(algorithm));
  return moves.reverse().map(invertMove).join(' ');
}

function invertMove(move) {
  if (move.suffix === '2') return `${move.face}2`;
  if (move.suffix === "'") return move.face;
  return `${move.face}'`;
}
