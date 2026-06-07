import test from 'node:test';
import assert from 'node:assert/strict';
import { opCaseSamplesForSolves, summarizeOpStats } from '../src/op-stats.js';
import { opPdfAlgorithmForCase } from '../src/op-pdf-algorithms.js';
import { parseScramble } from '../src/cube-state.js';

test('summarizes OP events by OLL and PLL case', () => {
  const summary = summarizeOpStats([
    {
      opEvents: [
        {
          kind: 'oll',
          caseId: 'oll-27',
          name: 'OLL 27',
          group: 'OCLL',
          durationMs: 800,
          observationMs: 120,
          tps: 8.75,
          turns: 7,
          moves: ['R', 'U', "R'", 'U', 'R', 'U2', "R'"],
          formulaAccepted: true,
        },
        {
          kind: 'pll',
          caseId: 'pll-t',
          name: 'T Perm',
          durationMs: 1400,
          observationMs: 200,
          tps: 10,
          turns: 14,
          moves: ['R', 'U', "R'"],
          formulaAccepted: false,
        },
      ],
    },
    {
      opEvents: [
        {
          kind: 'oll',
          caseId: 'oll-27',
          name: 'OLL 27',
          durationMs: 1000,
          observationMs: 180,
          tps: 7,
          turns: 7,
          moves: ['R', 'U', "R'", 'U', 'R', 'U2', "R'"],
          formulaAccepted: true,
        },
      ],
    },
  ]);

  assert.equal(summary.totalEvents, 3);
  assert.deepEqual(summary.byKind, { oll: 2, pll: 1 });
  assert.equal(summary.cases[0].caseId, 'oll-27');
  assert.equal(summary.cases[0].count, 2);
  assert.equal(summary.cases[0].averageDurationMs, 900);
  assert.equal(summary.cases[0].averageObservationMs, 150);
  assert.equal(summary.cases[0].averageTps, 7.875);
  assert.equal(summary.cases[0].formulaCount, 1);
  assert.equal(summary.cases[0].acceptedFormulaCount, 1);
  assert.deepEqual(summary.cases[0].mostUsedAcceptedFormula, {
    algorithm: "R U R' U R U2 R'",
    count: 2,
  });
  assert.equal(summary.cases[1].caseId, 'pll-t');
});

test('summarizes OP stats from bluetooth solves without stored OP events', () => {
  const pll = opPdfAlgorithmForCase('pll', 'pll-t');
  const moves = moveTokens(pll.algorithm);
  const summary = summarizeOpStats([
    {
      scramble: invertAlgorithm(pll.algorithm),
      scramblePuzzle: 'three',
      timerStartedAtMs: 1000,
      bluetoothMoveLog: timedMoveLog(moves, 125),
    },
  ]);

  assert.equal(summary.totalEvents, 1);
  assert.deepEqual(summary.byKind, { oll: 0, pll: 1 });
  assert.equal(summary.cases[0].caseId, 'pll-t');
  assert.equal(summary.cases[0].pdfLabel, 'T');
  assert.equal(summary.cases[0].averageDurationMs, moves.length * 125);
  assert.equal(summary.cases[0].averageObservationMs, 125);
  assert.equal(summary.cases[0].averageTurns, moves.length);
  assert.equal(summary.cases[0].acceptedFormulaCount, 1);
  assert.deepEqual(summary.cases[0].mostUsedAcceptedFormula, {
    algorithm: pll.algorithm,
    count: 1,
  });
});

test('summarized OP cases use training order when counts tie', () => {
  const summary = summarizeOpStats([
    {
      opEvents: [
        opEvent('oll', 'oll-10', 'OLL 10'),
        opEvent('oll', 'oll-02', 'OLL 2'),
        opEvent('oll', 'oll-01', 'OLL 1'),
        opEvent('pll', 'pll-ub', 'Ub Perm'),
        opEvent('pll', 'pll-aa', 'Aa Perm'),
      ],
    },
  ]);

  assert.deepEqual(summary.cases.map((item) => `${item.kind}:${item.caseId}`), [
    'oll:oll-01',
    'oll:oll-02',
    'oll:oll-10',
    'pll:pll-aa',
    'pll:pll-ub',
  ]);
});

test('lists per-case OP samples for review in newest-first order', () => {
  const samples = opCaseSamplesForSolves([
    {
      id: 'solve-old',
      createdAt: '2026-06-03T10:00:00.000Z',
      durationMs: 15000,
      opEvents: [
        {
          kind: 'pll',
          caseId: 'pll-t',
          name: 'T Perm',
          pdfLabel: 'T',
          startStep: 21,
          endStep: 34,
          durationMs: 1400,
          observationMs: 180,
          tps: 10,
          turns: 14,
          completedAtTimestampMs: 1780473602000,
          moves: ['R', 'U', "R'"],
          formulaAccepted: false,
          formulaReason: 'pll-not-solved',
        },
      ],
    },
    {
      id: 'solve-new',
      createdAt: '2026-06-03T10:02:00.000Z',
      durationMs: 13000,
      opEvents: [
        {
          kind: 'pll',
          caseId: 'pll-t',
          name: 'T Perm',
          startStep: 18,
          endStep: 31,
          durationMs: 1200,
          observationMs: 150,
          tps: 11.67,
          turns: 14,
          completedAtTimestampMs: 1780473722000,
          moves: ['R', 'U', "R'", "U'"],
          formulaAccepted: true,
          formulaReason: 'accepted',
        },
        opEvent('oll', 'oll-01', 'OLL 1'),
      ],
    },
  ], 'pll', 'pll-t');

  assert.equal(samples.length, 2);
  assert.equal(samples[0].solveId, 'solve-new');
  assert.equal(samples[0].pdfLabel, 'T');
  assert.equal(samples[0].solveDurationMs, 13000);
  assert.equal(samples[0].startStep, 18);
  assert.equal(samples[0].endStep, 31);
  assert.equal(samples[0].durationMs, 1200);
  assert.equal(samples[0].observationMs, 150);
  assert.equal(samples[0].tps, 11.67);
  assert.equal(samples[0].algorithm, "R U R' U'");
  assert.equal(samples[0].formulaAccepted, true);
  assert.equal(samples[1].solveId, 'solve-old');
  assert.equal(samples[1].formulaReason, 'pll-not-solved');
});

function opEvent(kind, caseId, name) {
  return {
    kind,
    caseId,
    name,
    durationMs: 1000,
    observationMs: 100,
    tps: 5,
    turns: 5,
    moves: ['R', 'U'],
    formulaAccepted: false,
  };
}

function moveTokens(algorithm) {
  return parseScramble(algorithm).map((move) => `${move.face}${move.suffix || ''}`);
}

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

function timedMoveLog(moves, intervalMs) {
  return moves.map((move, index) => ({
    move,
    elapsedMs: (index + 1) * intervalMs,
    timestampMs: 1000 + (index + 1) * intervalMs,
    solveStartedAtMs: 1000,
  }));
}
