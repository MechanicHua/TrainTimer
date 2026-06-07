import test from 'node:test';
import assert from 'node:assert/strict';
import { opPdfAlgorithmForCase, opPdfAlgorithms, opPdfSourceNormalizations } from '../src/op-pdf-algorithms.js';
import { buildOpFormulaLibrary, formulasForOpCase } from '../src/op-formula-library.js';
import { faceletsFromScramble, parseScramble } from '../src/cube-state.js';
import { evaluateOpFormulaCandidate, opCaseLibrary, recognizeOllCase, recognizePllCase } from '../src/op-analysis.js';

test('PDF OP formula library covers every OLL and PLL case once', () => {
  const counts = opPdfAlgorithms.reduce((memo, item) => {
    memo[item.kind] = (memo[item.kind] || 0) + 1;
    return memo;
  }, {});
  const uniqueCases = new Set(opPdfAlgorithms.map((item) => `${item.kind}:${item.caseId}`));
  const library = buildOpFormulaLibrary();

  assert.deepEqual(counts, { oll: 57, pll: 21 });
  assert.equal(opPdfAlgorithms.length, 78);
  assert.equal(uniqueCases.size, 78);
  assert.equal(library.pdfFormulaCount, 78);
  assert.equal(library.userFormulaCount, 0);
  assert.equal(library.totalFormulaCount, 78);
});

test('OP formula library case list follows OLL and PLL training order', () => {
  const library = buildOpFormulaLibrary();
  const keys = library.cases.map((item) => `${item.kind}:${item.caseId}`);

  assert.deepEqual(keys.slice(0, 5), [
    'oll:oll-01',
    'oll:oll-02',
    'oll:oll-03',
    'oll:oll-04',
    'oll:oll-05',
  ]);
  assert.deepEqual(keys.slice(57, 64), [
    'pll:pll-aa',
    'pll:pll-ab',
    'pll:pll-e',
    'pll:pll-h',
    'pll:pll-ua',
    'pll:pll-ub',
    'pll:pll-z',
  ]);
});

test('PDF OP formulas generate the expected recognition signatures', () => {
  for (const item of opPdfAlgorithms) {
    const setup = invertAlgorithm(item.algorithm);
    const recognition = item.kind === 'oll'
      ? recognizeOllCase(faceletsFromScramble(setup))
      : recognizePllCase(faceletsFromScramble(setup));

    assert.equal(recognition?.confidence, 'unique', `${item.pdfLabel} is uniquely recognized`);
    assert.equal(recognition?.caseId, item.caseId, `${item.pdfLabel} maps to ${item.caseId}`);
  }
});

test('OP recognition exposes PDF labels and PDF-prefilled formulas', () => {
  const oll = opCaseLibrary().find((item) => item.id === 'oll-12');
  const pll = opCaseLibrary().find((item) => item.id === 'pll-rb');

  assert.equal(oll.pdfLabel, 'M-');
  assert.equal(oll.source, 'pdf');
  assert.equal(oll.algorithm, "r R2 U' R U' R' U2 R U' M");
  assert.equal(pll.pdfLabel, 'Rb');
  assert.equal(pll.source, 'pdf');
  assert.equal(pll.algorithm, "R' U2 R U2 R' F R U R' U' R' F' R2 U'");
});

test('PDF source normalizations document executable canonical formulas', () => {
  assert.deepEqual(
    opPdfSourceNormalizations.map((item) => `${item.kind}:${item.caseId}`),
    ['oll:oll-12', 'pll:pll-ab', 'pll:pll-rb'],
  );

  for (const item of opPdfSourceNormalizations) {
    const stored = opPdfAlgorithmForCase(item.kind, item.caseId);
    assert.equal(stored?.pdfLabel, item.pdfLabel);
    assert.equal(stored?.page, item.page);
    assert.equal(stored?.algorithm, item.algorithm);
    assert.ok(item.reason);

    const canonicalStartFacelets = faceletsFromScramble(invertAlgorithm(item.algorithm));
    const storedResult = evaluateOpFormulaCandidate({
      kind: item.kind,
      caseId: item.caseId,
      startFacelets: canonicalStartFacelets,
      moves: item.algorithm,
      maxMoves: 40,
    });
    assert.equal(storedResult.accepted, true, `${item.pdfLabel} stored algorithm solves canonical state`);
  }

  const sourceResults = Object.fromEntries(opPdfSourceNormalizations.map((item) => {
    const canonicalStartFacelets = faceletsFromScramble(invertAlgorithm(item.algorithm));
    const result = evaluateOpFormulaCandidate({
      kind: item.kind,
      caseId: item.caseId,
      startFacelets: canonicalStartFacelets,
      moves: item.pdfAlgorithm,
      maxMoves: 40,
    });
    return [`${item.kind}:${item.caseId}`, result.reason];
  }));

  assert.equal(sourceResults['oll:oll-12'], 'accepted');
  assert.equal(sourceResults['pll:pll-ab'], 'pll-not-solved');
  assert.equal(sourceResults['pll:pll-rb'], 'pll-not-solved');
});

test('OP formula library supplements only accepted user formulas', () => {
  const userOllMoves = ["y'", "M'", "R'", "U'", 'R', "U'", "R'", 'U2', 'R', "U'", 'M'];
  const userPllMoves = ['R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'", "U'", 'R', 'U', "R'", "F'"];
  const library = buildOpFormulaLibrary([
    {
      createdAt: '2026-06-03T10:00:00.000Z',
      opEvents: [
        {
          kind: 'oll',
          caseId: 'oll-12',
          pdfLabel: 'M-',
          moves: userOllMoves,
          startFacelets: faceletsFromScramble(invertAlgorithm(userOllMoves.join(' '))),
          formulaAccepted: true,
          durationMs: 700,
          observationMs: 120,
          tps: 10,
        },
        {
          kind: 'oll',
          caseId: 'oll-12',
          pdfLabel: 'M-',
          moves: userOllMoves,
          startFacelets: faceletsFromScramble(invertAlgorithm(userOllMoves.join(' '))),
          formulaAccepted: true,
          durationMs: 900,
          observationMs: 180,
          tps: 8,
        },
        {
          kind: 'pll',
          caseId: 'pll-t',
          moves: ['R', 'U', "R'"],
          formulaAccepted: false,
        },
        {
          kind: 'pll',
          caseId: 'pll-t',
          moves: userPllMoves,
          startFacelets: faceletsFromScramble(invertAlgorithm(userPllMoves.join(' '))),
          formulaAccepted: true,
          durationMs: 1300,
        },
      ],
    },
  ]);

  assert.equal(library.pdfFormulaCount, 78);
  assert.equal(library.userFormulaCount, 1);
  assert.equal(library.totalFormulaCount, 79);
  assert.equal(formulasForOpCase(library, 'oll', 'oll-12').length, 2);
  const userOll = formulasForOpCase(library, 'oll', 'oll-12').find((item) => item.source === 'user');
  assert.equal(userOll.userOccurrences, 2);
  assert.equal(userOll.averageDurationMs, 800);
  assert.equal(userOll.averageObservationMs, 150);
  assert.equal(userOll.averageTps, 9);
  assert.equal(formulasForOpCase(library, 'pll', 'pll-t').length, 1);
  assert.equal(formulasForOpCase(library, 'pll', 'pll-t')[0].userOccurrences, 1);
});

test('OP formula library folds AUF-wrapped PDF algorithms back into the prefilled formula', () => {
  const oll = opPdfAlgorithmForCase('oll', 'oll-28');
  const aufWrappedMoves = [...moveTokens(oll.algorithm), 'U'];
  const library = buildOpFormulaLibrary([
    {
      createdAt: '2026-06-03T10:00:00.000Z',
      opEvents: [
        {
          kind: 'oll',
          caseId: 'oll-28',
          pdfLabel: 'A',
          moves: aufWrappedMoves,
          startFacelets: faceletsFromScramble(invertAlgorithm(aufWrappedMoves.join(' '))),
          formulaAccepted: true,
          durationMs: 1600,
          observationMs: 200,
          tps: 8.75,
        },
      ],
    },
  ]);
  const formulas = formulasForOpCase(library, 'oll', 'oll-28');
  const pdfFormula = formulas.find((item) => item.source === 'pdf');

  assert.equal(library.pdfFormulaCount, 78);
  assert.equal(library.userFormulaCount, 0);
  assert.equal(library.totalFormulaCount, 78);
  assert.equal(formulas.length, 1);
  assert.equal(pdfFormula.algorithm, oll.algorithm);
  assert.equal(pdfFormula.userOccurrences, 1);
  assert.equal(pdfFormula.averageDurationMs, 1600);
  assert.equal(pdfFormula.averageObservationMs, 200);
  assert.equal(pdfFormula.averageTps, 8.75);
});

test('OP formula library revalidates stored accepted events before admission', () => {
  const pll = opPdfAlgorithmForCase('pll', 'pll-t');
  const startFacelets = faceletsFromScramble(invertAlgorithm(pll.algorithm));
  const library = buildOpFormulaLibrary([
    {
      createdAt: '2026-06-03T10:00:00.000Z',
      opEvents: [
        {
          kind: 'pll',
          caseId: 'pll-t',
          moves: moveTokens(pll.algorithm).slice(0, -1),
          startFacelets,
          formulaAccepted: true,
        },
        {
          kind: 'pll',
          caseId: 'pll-t',
          moves: moveTokens(pll.algorithm),
          formulaAccepted: true,
        },
      ],
    },
  ]);
  const [formula] = formulasForOpCase(library, 'pll', 'pll-t');

  assert.equal(library.userFormulaCount, 0);
  assert.equal(library.totalFormulaCount, 78);
  assert.equal(formula.userOccurrences, 0);
});

test('OP formula library rejects composite OP sequences from user formula admission', () => {
  const startPll = opCaseLibrary().find((item) => item.id === 'pll-t');
  const nextPll = opCaseLibrary().find((item) => item.id === 'pll-f');
  const transitionMoves = moveTokens('M2 U M2 U2 M2 U M2');
  const solveMoves = moveTokens(nextPll.algorithm);
  const moves = [...transitionMoves, ...solveMoves];
  const library = buildOpFormulaLibrary([
    {
      createdAt: '2026-06-03T10:00:00.000Z',
      scramble: invertAlgorithm(startPll.algorithm),
      scramblePuzzle: 'three',
      timerStartedAtMs: 1000,
      bluetoothMoveLog: timedMoveLog(moves, 100),
    },
  ]);
  const tFormula = formulasForOpCase(library, 'pll', 'pll-t').find((item) => item.source === 'pdf');
  const fFormula = formulasForOpCase(library, 'pll', 'pll-f').find((item) => item.source === 'pdf');

  assert.equal(library.pdfFormulaCount, 78);
  assert.equal(library.userFormulaCount, 0);
  assert.equal(library.totalFormulaCount, 78);
  assert.equal(tFormula.userOccurrences, 0);
  assert.equal(fFormula.userOccurrences, 1);
});

test('OP formula library derives accepted user observations from bluetooth solves without stored OP events', () => {
  const pll = opPdfAlgorithmForCase('pll', 'pll-t');
  const moves = moveTokens(pll.algorithm);
  const library = buildOpFormulaLibrary([
    {
      createdAt: '2026-06-03T10:00:00.000Z',
      scramble: invertAlgorithm(pll.algorithm),
      scramblePuzzle: 'three',
      timerStartedAtMs: 1000,
      bluetoothMoveLog: timedMoveLog(moves, 100),
    },
  ]);
  const [formula] = formulasForOpCase(library, 'pll', 'pll-t');

  assert.equal(library.pdfFormulaCount, 78);
  assert.equal(library.userFormulaCount, 0);
  assert.equal(library.totalFormulaCount, 78);
  assert.equal(formula.source, 'pdf');
  assert.equal(formula.userOccurrences, 1);
  assert.equal(formula.averageDurationMs, moves.length * 100);
  assert.equal(formula.averageObservationMs, 100);
  assert.equal(formula.averageTps, 10);
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

function moveTokens(algorithm) {
  return parseScramble(algorithm).map((move) => `${move.face}${move.suffix || ''}`);
}

function timedMoveLog(moves, intervalMs) {
  return moves.map((move, index) => ({
    move,
    elapsedMs: (index + 1) * intervalMs,
    timestampMs: 1000 + (index + 1) * intervalMs,
    solveStartedAtMs: 1000,
  }));
}
