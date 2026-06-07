import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundledTnoodleJar = resolve(projectRoot, 'vendor', 'tnoodle-cli-1.1.1.jar');
const axes = {
  U: 'UD',
  D: 'UD',
  R: 'RL',
  L: 'RL',
  F: 'FB',
  B: 'FB',
};
const faces = Object.keys(axes);
const suffixes = ['', "'", '2'];

const defaultExternalTimeoutMs = 15000;

export async function generateScramble(puzzle = defaultPuzzle(), options = {}) {
  const normalizedPuzzle = normalizePuzzle(puzzle);
  const external = await generateExternalScramble(normalizedPuzzle, options);
  if (external) return external;

  if (normalizedPuzzle !== 'three') {
    return {
      scramble: '',
      puzzle: normalizedPuzzle,
      source: 'unavailable',
      warning: `${normalizedPuzzle} 打乱需要 TNoodle CLI，当前未能生成。`,
    };
  }

  return {
    scramble: generateFallbackThreeByThreeScramble(),
    puzzle: normalizedPuzzle,
    source: 'fallback-333-random-moves',
    warning:
      'TNoodle 当前未能及时生成 3x3 打乱，已使用本地备用随机步打乱。',
  };
}

export async function drawScrambleSvg(scramble, puzzle = defaultPuzzle(), options = {}) {
  const normalizedScramble = String(scramble || '').trim();
  if (!normalizedScramble) return null;

  const normalizedPuzzle = normalizePuzzle(puzzle);
  const commands = tnoodleCommandCandidates('draw', normalizedPuzzle, normalizedScramble);
  const timeout = externalTimeoutMs(options);

  for (const candidate of commands) {
    try {
      const { stdout } = await execFileAsync(candidate.command, candidate.args, { timeout, maxBuffer: 1024 * 1024 });
      const svg = normalizeSvgOutput(stdout);
      if (svg) return { svg, puzzle: normalizedPuzzle, source: candidate.source };
    } catch {
      // Try the next configured integration before letting the client use its local preview fallback.
    }
  }

  return null;
}

async function generateExternalScramble(puzzle, options = {}) {
  const commands = tnoodleCommandCandidates('scramble', puzzle);
  const timeout = externalTimeoutMs(options);

  for (const candidate of commands) {
    try {
      const { stdout } = await execFileAsync(candidate.command, candidate.args, { timeout });
      const scramble = normalizeExternalOutput(stdout);
      if (scramble) return { scramble, puzzle, source: candidate.source };
    } catch {
      // Try the next configured integration before falling back locally.
    }
  }

  return null;
}

function externalTimeoutMs(options = {}) {
  const timeout = Number(options.timeoutMs ?? process.env.TRAIN_TIMER_TNOODLE_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? Math.max(100, Math.floor(timeout)) : defaultExternalTimeoutMs;
}

function defaultPuzzle() {
  return process.env.TNOODLE_PUZZLE || 'three';
}

function normalizePuzzle(puzzle) {
  return String(puzzle || defaultPuzzle()).trim() || 'three';
}

function tnoodleCommandCandidates(command, puzzle, scramble = '') {
  const args = command === 'draw'
    ? ['draw', '--puzzle', puzzle, '--scramble', scramble]
    : ['scramble', '--puzzle', puzzle];
  const commands = [];

  if (process.env.TNOODLE_CMD) {
    commands.push({
      command: process.env.TNOODLE_CMD,
      args,
      source: 'tnoodle-command',
    });
  }

  if (process.env.TNOODLE_JAR) {
    commands.push({
      command: 'java',
      args: ['-jar', process.env.TNOODLE_JAR, ...args],
      source: 'tnoodle-jar',
    });
  }

  if (existsSync(bundledTnoodleJar) && process.env.TRAIN_TIMER_DISABLE_BUNDLED_TNOODLE !== '1') {
    commands.push({
      command: 'java',
      args: ['-jar', bundledTnoodleJar, ...args],
      source: 'bundled-tnoodle-cli-1.1.1',
    });
  }

  commands.push({
    command: 'tnoodle',
    args,
    source: 'tnoodle-command',
  });

  return commands;
}

function normalizeExternalOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0].trim();
    if (typeof parsed === 'string') return parsed.trim();
  } catch {
    // Plain text output is the common tnoodle-cli path.
  }

  return trimmed.split('\n').map((line) => line.trim()).find(Boolean) || null;
}

function normalizeSvgOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) return null;
  return trimmed;
}

export function generateFallbackThreeByThreeScramble(length = 20) {
  const moves = [];
  let previousFace = null;
  let previousAxis = null;

  while (moves.length < length) {
    const face = faces[randomInt(faces.length)];
    const axis = axes[face];

    if (face === previousFace) continue;
    if (axis === previousAxis && moves.length > 0 && axes[previousFace] === axis) continue;

    moves.push(`${face}${suffixes[randomInt(suffixes.length)]}`);
    previousFace = face;
    previousAxis = axis;
  }

  return moves.join(' ');
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}
