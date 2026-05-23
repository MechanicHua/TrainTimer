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

export async function generateScramble() {
  const external = await generateExternalScramble();
  if (external) return external;

  return {
    scramble: generateFallbackThreeByThreeScramble(),
    source: 'fallback-333-random-moves',
    warning:
      '未检测到内置 TNoodle JAR、tnoodle 命令或 TNOODLE_JAR，当前使用本地备用 3x3 随机步打乱。',
  };
}

export async function drawScrambleSvg(scramble) {
  const normalizedScramble = String(scramble || '').trim();
  if (!normalizedScramble) return null;

  const puzzle = process.env.TNOODLE_PUZZLE || 'three';
  const commands = tnoodleCommandCandidates('draw', puzzle, normalizedScramble);

  for (const candidate of commands) {
    try {
      const { stdout } = await execFileAsync(candidate.command, candidate.args, { timeout: 15000, maxBuffer: 1024 * 1024 });
      const svg = normalizeSvgOutput(stdout);
      if (svg) return { svg, source: candidate.source };
    } catch {
      // Try the next configured integration before letting the client use its local preview fallback.
    }
  }

  return null;
}

async function generateExternalScramble() {
  const puzzle = process.env.TNOODLE_PUZZLE || 'three';
  const commands = tnoodleCommandCandidates('scramble', puzzle);

  for (const candidate of commands) {
    try {
      const { stdout } = await execFileAsync(candidate.command, candidate.args, { timeout: 15000 });
      const scramble = normalizeExternalOutput(stdout);
      if (scramble) return { scramble, source: candidate.source };
    } catch {
      // Try the next configured integration before falling back locally.
    }
  }

  return null;
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
