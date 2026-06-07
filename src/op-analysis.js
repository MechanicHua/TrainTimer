import { algorithmTrainerCases } from './algorithm-trainer-cases.js';
import { solveCfopAnalysis } from './cfop-analysis.js';
import { opPdfAlgorithmForCase } from './op-pdf-algorithms.js';
import {
  applyMoveToFacelets,
  applyMovesToFacelets,
  faceletsFromScramble,
  isSolvedFacelets,
  parseScramble,
} from './cube-state.js';

const supportedKinds = new Set(['oll', 'pll']);
const faceletOffsets = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
const faceNames = ['U', 'R', 'F', 'D', 'L', 'B'];
const faceNormals = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};
const oppositeFaces = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
const topFace = 'U';
const sideFaces = ['F', 'R', 'B', 'L'];
const uRotations = ['', 'U', 'U2', "U'"];

let opCaseLibraryCache = null;
let opCaseIndexCache = null;
const opEventsForSaveCache = new WeakMap();

export function opCaseLibrary() {
  if (!opCaseLibraryCache) {
    opCaseLibraryCache = algorithmTrainerCases
      .filter((item) => supportedKinds.has(item.set))
      .map(opCaseFromTrainerCase)
      .filter(Boolean);
  }
  return opCaseLibraryCache;
}

export function opCaseIndex() {
  if (!opCaseIndexCache) {
    const index = { oll: new Map(), pll: new Map() };
    for (const item of opCaseLibrary()) {
      const bucket = index[item.kind].get(item.signature) || [];
      bucket.push(item);
      index[item.kind].set(item.signature, bucket);
    }
    opCaseIndexCache = index;
  }
  return opCaseIndexCache;
}

export function recognizeOllCase(facelets) {
  return recognizeOpCase(facelets, 'oll');
}

export function recognizePllCase(facelets) {
  return recognizeOpCase(facelets, 'pll');
}

export function recognizeOpCase(facelets, kind) {
  if (!supportedKinds.has(kind)) return null;
  const text = String(facelets || '').trim().toUpperCase();
  if (!/^[URFDLB]{54}$/.test(text)) return null;
  if (!isLastLayerBaseSolved(text)) return null;
  const signature = kind === 'oll'
    ? ollSignatureFromFacelets(text)
    : pllSignatureFromFacelets(text);
  if (!signature) return null;

  const matches = opCaseIndex()[kind].get(signature) || [];
  if (matches.length === 0) {
    return {
      kind,
      signature,
      caseId: '',
      name: '',
      group: '',
      algorithm: '',
      matchCount: 0,
      confidence: 'none',
      matches: [],
    };
  }

  const [best] = matches;
  return {
    kind,
    signature,
    caseId: best.id,
    name: best.name,
    group: best.group,
    algorithm: best.algorithm,
    pdfLabel: best.pdfLabel || '',
    source: best.source || '',
    matchCount: matches.length,
    confidence: matches.length === 1 ? 'unique' : 'ambiguous',
    matches: matches.map((item) => ({
      caseId: item.id,
      name: item.name,
      group: item.group,
      algorithm: item.algorithm,
      pdfLabel: item.pdfLabel || '',
      source: item.source || '',
    })),
  };
}

export function ollSignatureFromFacelets(facelets) {
  return canonicalSignature(facelets, rawOllSignature);
}

export function pllSignatureFromFacelets(facelets) {
  return canonicalSignature(facelets, rawPllSignature);
}

export function solveOpAnalysis(solve) {
  const analysis = solveCfopAnalysis(solve);
  const records = Array.isArray(analysis.detectionRecords) && analysis.detectionRecords.length > 0
    ? analysis.detectionRecords
    : analysis.records;
  if (!solve?.scramble || (solve.scramblePuzzle || 'three') !== 'three' || records.length === 0) {
    return { events: [], records: analysis.records, detectionRecords: records };
  }

  const stages = Array.isArray(analysis.stages) ? analysis.stages : [];
  const snapshots = opFaceletSnapshotsForSolve(solve, records);
  if (snapshots.length === 0) return { events: [], records: analysis.records, detectionRecords: records };
  const opSnapshots = normalizeOpSnapshotsForBottomFace(snapshots, analysis.bottomFace, stages);
  const scannedEvents = scanOpEvents(solve, opSnapshots, records, opScanBoundsFromStages(stages));
  const stageEvents = [
    opEventFromStage(stages.find((stage) => stage.key === 'oll' || stage.label === 'O'), 'oll', opSnapshots, records, solve),
    opEventFromStage(stages.find((stage) => stage.key === 'pll' || stage.label === 'P'), 'pll', opSnapshots, records, solve),
  ].filter(Boolean);
  const events = mergeOpEvents(scannedEvents, stageEvents);

  return { events, records: analysis.records, detectionRecords: records };
}

export function opEventsForSave(solve) {
  const cacheKey = opEventsCacheKey(solve);
  const cached = solve && typeof solve === 'object' ? opEventsForSaveCache.get(solve) : null;
  if (cached?.key === cacheKey) return cached.events;

  const events = solveOpAnalysis(solve).events.map((event) => ({
    kind: event.kind,
    caseId: event.caseId,
    name: event.name,
    group: event.group,
    algorithm: event.algorithm,
    pdfLabel: event.pdfLabel || '',
    source: event.source || '',
    confidence: event.confidence,
    matchCount: event.matchCount,
    startStep: event.startStep,
    endStep: event.endStep,
    completedAt: event.completedAt,
    turns: event.turns,
    durationMs: Number.isFinite(event.durationMs) ? Math.round(event.durationMs) : null,
    observationMs: Number.isFinite(event.observationMs) ? Math.round(event.observationMs) : null,
    tps: Number.isFinite(event.tps) ? event.tps : null,
    moves: event.moves,
    startedAtElapsedMs: Number.isFinite(event.startedAtElapsedMs) ? Math.round(event.startedAtElapsedMs) : null,
    firstMoveElapsedMs: Number.isFinite(event.firstMoveElapsedMs) ? Math.round(event.firstMoveElapsedMs) : null,
    completedAtElapsedMs: Number.isFinite(event.completedAtElapsedMs) ? Math.round(event.completedAtElapsedMs) : null,
    startedAtTimestampMs: Number.isFinite(event.startedAtTimestampMs) ? Math.round(event.startedAtTimestampMs) : null,
    firstMoveTimestampMs: Number.isFinite(event.firstMoveTimestampMs) ? Math.round(event.firstMoveTimestampMs) : null,
    completedAtTimestampMs: Number.isFinite(event.completedAtTimestampMs) ? Math.round(event.completedAtTimestampMs) : null,
    startedAtIsoTime: event.startedAtIsoTime || '',
    firstMoveIsoTime: event.firstMoveIsoTime || '',
    completedAtIsoTime: event.completedAtIsoTime || '',
    startFacelets: event.startFacelets || '',
    signature: event.signature,
    formulaAccepted: event.formulaAccepted === true,
    formulaReason: event.formulaReason || '',
    moveTimings: event.moveTimings,
  }));
  if (solve && typeof solve === 'object') opEventsForSaveCache.set(solve, { key: cacheKey, events });
  return events;
}

export function evaluateOpFormulaCandidate(options = {}) {
  const kind = String(options.kind || '').toLowerCase();
  if (!supportedKinds.has(kind)) return rejectedFormula('unsupported-kind');

  const startFacelets = String(options.startFacelets || '').trim().toUpperCase();
  if (!/^[URFDLB]{54}$/.test(startFacelets)) return rejectedFormula('invalid-start-state');

  const startRecognition = recognizeOpCase(startFacelets, kind);
  if (!startRecognition || startRecognition.confidence === 'none') return rejectedFormula('unrecognized-start-state');
  if (startRecognition.confidence !== 'unique') return rejectedFormula('ambiguous-start-state', { startRecognition });
  if (options.caseId && startRecognition.caseId !== options.caseId) {
    return rejectedFormula('case-mismatch', { startRecognition });
  }

  const moves = normalizeFormulaMoves(options.moves);
  if (!moves) return rejectedFormula('invalid-moves', { startRecognition });
  if (moves.length === 0) return rejectedFormula('empty-moves', { startRecognition });

  const maxMoves = Number.isFinite(Number(options.maxMoves))
    ? Math.max(1, Math.round(Number(options.maxMoves)))
    : (kind === 'oll' ? 24 : 30);
  if (moves.length > maxMoves) return rejectedFormula('too-long', { startRecognition, moves, maxMoves });

  let facelets = startFacelets;
  for (let index = 0; index < moves.length; index += 1) {
    facelets = applyMoveToFacelets(facelets, moves[index]);
    if (index < moves.length - 1) {
      const intermediate = recognizeOpCase(facelets, kind);
      const pauseMs = pauseAfterMoveMs(options.moveTimings, index);
      const pauseThresholdMs = Number.isFinite(Number(options.intermediatePauseMs))
        ? Math.max(0, Number(options.intermediatePauseMs))
        : 1200;
      if (pauseMs != null
        && pauseMs >= pauseThresholdMs
        && intermediate?.confidence === 'unique'
        && intermediate.caseId !== startRecognition.caseId) {
        return rejectedFormula('intermediate-op-case', {
          startRecognition,
          moves,
          intermediate,
          intermediateStep: index + 1,
          pauseMs,
          pauseThresholdMs,
        });
      }
    }
  }

  if (kind === 'oll') {
    if (!pllSignatureFromFacelets(facelets)) {
      const finalRecognition = recognizeOllCase(facelets);
      if (finalRecognition?.confidence === 'unique' && finalRecognition.caseId !== startRecognition.caseId) {
        return rejectedFormula('intermediate-op-case', {
          startRecognition,
          moves,
          finalRecognition,
          finalFacelets: facelets,
        });
      }
      return rejectedFormula('oll-not-oriented', { startRecognition, moves, finalFacelets: facelets });
    }
    if (!isValidPllCompletionState(facelets)) {
      return rejectedFormula('oll-not-pll-state', {
        startRecognition,
        moves,
        finalRecognition: recognizePllCase(facelets),
        finalFacelets: facelets,
      });
    }
  }
  if (kind === 'pll' && !isSolvedFacelets(facelets)) {
    return rejectedFormula('pll-not-solved', { startRecognition, moves, finalFacelets: facelets });
  }

  return {
    accepted: true,
    reason: 'accepted',
    kind,
    caseId: startRecognition.caseId,
    name: startRecognition.name,
    group: startRecognition.group,
    pdfLabel: startRecognition.pdfLabel || '',
    algorithm: moves.join(' '),
    moves,
    moveCount: moves.length,
    startSignature: startRecognition.signature,
  };
}

function opEventsCacheKey(solve) {
  const moveLog = Array.isArray(solve?.bluetoothMoveLog) ? solve.bluetoothMoveLog : [];
  const moves = Array.isArray(solve?.bluetoothMoves) ? solve.bluetoothMoves : [];
  return [
    solve?.scramble || '',
    solve?.scramblePuzzle || '',
    solve?.timerStartedAtMs ?? '',
    solve?.timerStartedAt || '',
    solve?.bluetoothSolvedByStatePacket === true || solve?.finalSolvedByStatePacket === true ? 1 : 0,
    moveLog.map(opMoveLogCachePart).join(','),
    moves.map((move) => String(move || '')).join(' '),
  ].join('|');
}

function opMoveLogCachePart(entry) {
  if (typeof entry === 'string') return entry;
  return [
    entry?.move || '',
    entry?.elapsedMs ?? '',
    entry?.timestampMs ?? '',
    entry?.solveStartedAtMs ?? '',
  ].join(':');
}

function opCaseFromTrainerCase(item) {
  const kind = item.set;
  const pdfAlgorithm = opPdfAlgorithmForCase(kind, item.id);
  const setup = invertAlgorithm(item.algorithm);
  const facelets = faceletsFromScramble(setup);
  const signature = kind === 'oll'
    ? ollSignatureFromFacelets(facelets)
    : pllSignatureFromFacelets(facelets);
  if (!signature) return null;
  return {
    id: item.id,
    kind,
    name: item.name,
    group: item.group,
    algorithm: pdfAlgorithm?.algorithm || item.algorithm,
    trainerAlgorithm: item.algorithm,
    pdfLabel: pdfAlgorithm?.pdfLabel || '',
    source: pdfAlgorithm ? 'pdf' : 'algorithm-trainer',
    signature,
  };
}

function normalizeFormulaMoves(value) {
  try {
    const text = Array.isArray(value)
      ? value.join(' ')
      : String(value || '');
    return parseScramble(text).map((move) => `${move.face}${move.suffix || ''}`);
  } catch {
    return null;
  }
}

function rejectedFormula(reason, details = {}) {
  return {
    accepted: false,
    reason,
    ...details,
  };
}

function pauseAfterMoveMs(moveTimings, moveIndex) {
  if (!Array.isArray(moveTimings)) return null;
  const next = moveTimings[moveIndex + 1];
  const delta = Number(next?.deltaMs);
  return Number.isFinite(delta) ? Math.max(0, delta) : null;
}

function pauseAfterStep(records, endIndex) {
  const currentElapsed = Number(records[endIndex - 1]?.elapsedMs);
  const nextElapsed = Number(records[endIndex]?.elapsedMs);
  if (!Number.isFinite(currentElapsed) || !Number.isFinite(nextElapsed)) return null;
  return Math.max(0, nextElapsed - currentElapsed);
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

function canonicalSignature(facelets, signatureFn) {
  const text = String(facelets || '').trim().toUpperCase();
  if (!/^[URFDLB]{54}$/.test(text)) return '';

  let best = '';
  for (const rotation of uRotations) {
    const rotated = rotation ? applyMovesToFacelets(text, rotation) : text;
    const signature = signatureFn(rotated);
    if (signature && (!best || signature < best)) best = signature;
  }
  return best;
}

function rawOllSignature(facelets) {
  const bits = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      bits.push(faceletAt(facelets, topFace, row, col) === topFace ? '1' : '0');
    }
  }
  for (const face of sideFaces) {
    for (let col = 0; col < 3; col += 1) {
      bits.push(faceletAt(facelets, face, 0, col) === topFace ? '1' : '0');
    }
  }
  return bits.join('');
}

function rawPllSignature(facelets) {
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (faceletAt(facelets, topFace, row, col) !== topFace) return '';
    }
  }

  let ring = '';
  for (const face of sideFaces) {
    for (let col = 0; col < 3; col += 1) {
      ring += faceletAt(facelets, face, 0, col);
    }
  }
  return ring;
}

function faceletAt(facelets, face, row, col) {
  return facelets[faceletOffsets[face] + row * 3 + col];
}

function isLastLayerBaseSolved(facelets) {
  if (faceletAt(facelets, 'U', 1, 1) !== 'U' || faceletAt(facelets, 'D', 1, 1) !== 'D') return false;
  const downCenter = faceletAt(facelets, 'D', 1, 1);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (faceletAt(facelets, 'D', row, col) !== downCenter) return false;
    }
  }
  for (const face of sideFaces) {
    const center = faceletAt(facelets, face, 1, 1);
    for (let row = 1; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if (faceletAt(facelets, face, row, col) !== center) return false;
      }
    }
  }
  return true;
}

function opFaceletSnapshotsForSolve(solve, records) {
  try {
    let facelets = faceletsFromScramble(solve.scramble);
    const snapshots = [facelets];
    for (const record of records) {
      facelets = applyMoveToFacelets(facelets, record.move);
      snapshots.push(facelets);
    }
    return snapshots;
  } catch {
    return [];
  }
}

function normalizeOpSnapshotsForBottomFace(snapshots, bottomFace, stages = []) {
  const bottom = String(bottomFace || 'D').toUpperCase();
  if (!oppositeFaces[bottom] || bottom === 'D') return snapshots;
  if (!shouldNormalizeOpSnapshotsForCfopBottom(stages)) return snapshots;
  return snapshots.map((facelets) => orientFaceletsForOpBottom(facelets, bottom));
}

function shouldNormalizeOpSnapshotsForCfopBottom(stages) {
  const items = Array.isArray(stages) ? stages : [];
  const f2lCompletedAt = Math.max(
    ...items
      .filter((stage) => /^F\d+$/.test(String(stage?.label || '')))
      .map((stage) => Number(stage.completedAt))
      .filter(Number.isFinite),
  );
  const ollCompletedAt = Number(items.find((stage) => stage?.key === 'oll' || stage?.label === 'O')?.completedAt);
  const pllCompletedAt = Number(items.find((stage) => stage?.key === 'pll' || stage?.label === 'P')?.completedAt);
  const opBoundary = Number.isFinite(ollCompletedAt) ? ollCompletedAt : pllCompletedAt;
  return Number.isFinite(f2lCompletedAt) && Number.isFinite(opBoundary) && f2lCompletedAt < opBoundary;
}

function orientFaceletsForOpBottom(facelets, bottomFace) {
  const top = oppositeFaces[bottomFace];
  const basis = opOrientationBasis(top);
  if (!basis) return facelets;

  const output = Array(54).fill('');
  for (const face of faceNames) {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const oldColor = faceletAt(facelets, face, row, col);
        const newFace = faceFromNormal(vectorToOpBasis(faceNormals[face], basis));
        const newPosition = vectorToOpBasis(positionForFacelet(face, row, col), basis);
        const [newRow, newCol] = faceGridPosition(newFace, newPosition);
        const newColor = faceFromNormal(vectorToOpBasis(faceNormals[oldColor], basis));
        output[faceletOffsets[newFace] + newRow * 3 + newCol] = newColor;
      }
    }
  }

  return output.every(Boolean) ? output.join('') : facelets;
}

function opOrientationBasis(top) {
  const newY = faceNormals[top];
  if (!newY) return null;
  const front = ['F', 'R', 'B', 'L', 'U', 'D']
    .map((face) => faceNormals[face])
    .find((normal) => dot(normal, newY) === 0);
  if (!front) return null;
  return {
    x: cross(newY, front),
    y: newY,
    z: front,
  };
}

function vectorToOpBasis(vector, basis) {
  return [
    dot(vector, basis.x),
    dot(vector, basis.y),
    dot(vector, basis.z),
  ];
}

function positionForFacelet(face, row, col) {
  if (face === 'U') return [col - 1, 1, row - 1];
  if (face === 'D') return [col - 1, -1, 1 - row];
  if (face === 'F') return [col - 1, 1 - row, 1];
  if (face === 'B') return [1 - col, 1 - row, -1];
  if (face === 'R') return [1, 1 - row, 1 - col];
  if (face === 'L') return [-1, 1 - row, col - 1];
  return [0, 0, 0];
}

function faceGridPosition(face, [x, y, z]) {
  if (face === 'U') return [z + 1, x + 1];
  if (face === 'D') return [1 - z, x + 1];
  if (face === 'F') return [1 - y, x + 1];
  if (face === 'B') return [1 - y, 1 - x];
  if (face === 'R') return [1 - y, 1 - z];
  if (face === 'L') return [1 - y, z + 1];
  return [0, 0];
}

function faceFromNormal(normal) {
  for (const [face, candidate] of Object.entries(faceNormals)) {
    if (normal.every((value, index) => value === candidate[index])) return face;
  }
  return '';
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function scanOpEvents(solve, snapshots, records, bounds = {}) {
  const ollStartAt = Number.isInteger(bounds.ollStartAt) ? Math.max(0, bounds.ollStartAt) : 0;
  const stagePllStartAt = Number.isInteger(bounds.pllStartAt) ? Math.max(0, bounds.pllStartAt) : 0;
  const ollEvents = scanOpEventsOfKind('oll', solve, snapshots, records, ollStartAt);
  const oll = ollEvents.findLast((event) => event.formulaAccepted === true) || ollEvents.at(-1) || null;
  const pllStartFromOllEvent = oll != null;
  const pllStartAt = pllStartFromOllEvent ? Math.max(0, oll.endStep ?? 0) : stagePllStartAt;
  let pllEvents = scanOpEventsOfKind('pll', solve, snapshots, records, pllStartAt);
  if (pllEvents.length === 0 && pllStartAt > 0 && pllStartFromOllEvent) {
    pllEvents = scanOpEventsOfKind('pll', solve, snapshots, records, 0);
  }
  return [...ollEvents, ...pllEvents].filter(Boolean);
}

function opScanBoundsFromStages(stages) {
  return {
    ollStartAt: cfopF2lCompletionStep(stages),
    pllStartAt: cfopOllCompletionStep(stages),
  };
}

function cfopF2lCompletionStep(stages) {
  const ollStage = (Array.isArray(stages) ? stages : [])
    .find((stage) => stage?.key === 'oll' || stage?.label === 'O');
  const startStep = Number(ollStage?.startStep);
  return ollStage?.completed && Number.isInteger(startStep) && startStep > 0 ? startStep - 1 : null;
}

function cfopOllCompletionStep(stages) {
  const stage = (Array.isArray(stages) ? stages : [])
    .find((item) => item?.key === 'oll' || item?.label === 'O');
  const completedAt = Number(stage?.completedAt);
  return stage?.completed && Number.isFinite(completedAt) ? completedAt : null;
}

function scanOpEventsOfKind(kind, solve, snapshots, records, startAt = 0) {
  const events = [];
  let nextStartAt = Math.max(0, Number(startAt) || 0);
  let guard = 0;
  while (nextStartAt < records.length && guard < records.length) {
    guard += 1;
    const transition = findRejectedOpTransition(kind, snapshots, records, solve, nextStartAt);
    const accepted = findAcceptedOpEvent(kind, snapshots, records, solve, nextStartAt);
    const compositeTransition = findCompositeOpTransitionForAccepted(kind, snapshots, records, solve, accepted);
    const next = chooseNextOpEvent(transition || compositeTransition, accepted);
    if (!next) break;
    events.push(next);
    nextStartAt = Math.max(nextStartAt + 1, Number(next.endStep) || nextStartAt + 1);
    if (next.formulaAccepted === true) break;
  }
  return events;
}

function chooseNextOpEvent(transition, accepted) {
  if (!transition) return accepted || null;
  if (!accepted) return transition;
  const transitionStart = Number(transition.startStep);
  const acceptedStart = Number(accepted.startStep);
  if (Number.isFinite(transitionStart) && Number.isFinite(acceptedStart) && transitionStart < acceptedStart) {
    return transition;
  }
  const transitionEnd = Number(transition.endStep);
  const acceptedEnd = Number(accepted.endStep);
  if (transitionStart === acceptedStart && Number.isFinite(transitionEnd) && Number.isFinite(acceptedEnd) && transitionEnd < acceptedEnd) {
    return transition;
  }
  return accepted;
}

function findAcceptedOpEvent(kind, snapshots, records, solve, startAt = 0) {
  const maxMoves = kind === 'oll' ? 24 : 30;
  const lastStartIndex = Math.max(0, records.length - 1);
  const firstStartIndex = Math.max(0, Math.min(startAt, lastStartIndex));

  for (let startIndex = firstStartIndex; startIndex <= lastStartIndex; startIndex += 1) {
    const startFacelets = snapshots[startIndex];
    const recognition = kind === 'oll' ? recognizeOllCase(startFacelets) : recognizePllCase(startFacelets);
    if (!recognition || recognition.confidence !== 'unique') continue;
    if (kind === 'oll' && pllSignatureFromFacelets(startFacelets)) continue;

    const maxEndIndex = Math.min(records.length, startIndex + maxMoves);
    for (let endIndex = startIndex + 1; endIndex <= maxEndIndex; endIndex += 1) {
      if (!opEventCompletionReached(kind, snapshots[endIndex], endIndex, records.length, solve)) continue;
      const formulaStartIndex = opFormulaStartIndex(records, startIndex, endIndex);
      if (formulaStartIndex >= endIndex) continue;
      const formulaStartFacelets = snapshots[formulaStartIndex];
      const formulaRecognition = kind === 'oll'
        ? recognizeOllCase(formulaStartFacelets)
        : recognizePllCase(formulaStartFacelets);
      if (!formulaRecognition || formulaRecognition.confidence !== 'unique' || formulaRecognition.caseId !== recognition.caseId) continue;
      const moves = records.slice(formulaStartIndex, endIndex).map((record) => record.move).filter(Boolean);
      const moveTimings = moveTimingsForRange(records, formulaStartIndex, endIndex, elapsedAtSolveStep(records, startIndex));
      const validation = evaluateOpFormulaCandidate({
        kind,
        caseId: formulaRecognition.caseId,
        startFacelets: formulaStartFacelets,
        moves,
        maxMoves,
        moveTimings,
      });
      if (!validation.accepted) continue;
      return opEventFromRange({
        kind,
        recognition: formulaRecognition,
        records,
        solve,
        observationStartIndex: startIndex,
        startIndex: formulaStartIndex,
        endIndex,
        moves,
        startFacelets: formulaStartFacelets,
        formulaAccepted: true,
        formulaReason: validation.reason,
      });
    }
  }

  return null;
}

function findRejectedOpTransition(kind, snapshots, records, solve, startAt = 0) {
  const maxMoves = kind === 'oll' ? 24 : 30;
  const lastStartIndex = Math.max(0, records.length - 1);
  const firstStartIndex = Math.max(0, Math.min(startAt, lastStartIndex));

  for (let startIndex = firstStartIndex; startIndex <= lastStartIndex; startIndex += 1) {
    const startFacelets = snapshots[startIndex];
    const recognition = kind === 'oll' ? recognizeOllCase(startFacelets) : recognizePllCase(startFacelets);
    if (!recognition || recognition.confidence !== 'unique') continue;
    if (kind === 'oll' && pllSignatureFromFacelets(startFacelets)) continue;

    const maxEndIndex = Math.min(records.length - 1, startIndex + maxMoves);
    for (let endIndex = startIndex + 1; endIndex <= maxEndIndex; endIndex += 1) {
      const pauseMs = pauseAfterStep(records, endIndex);
      if (pauseMs == null || pauseMs < 1200) continue;
      const endFacelets = snapshots[endIndex];
      const nextRecognition = kind === 'oll' ? recognizeOllCase(endFacelets) : recognizePllCase(endFacelets);
      if (!nextRecognition || nextRecognition.confidence !== 'unique' || nextRecognition.caseId === recognition.caseId) continue;
      const formulaStartIndex = opFormulaStartIndex(records, startIndex, endIndex);
      if (formulaStartIndex >= endIndex) continue;
      const formulaStartFacelets = snapshots[formulaStartIndex];
      const formulaRecognition = kind === 'oll'
        ? recognizeOllCase(formulaStartFacelets)
        : recognizePllCase(formulaStartFacelets);
      if (!formulaRecognition || formulaRecognition.confidence !== 'unique' || formulaRecognition.caseId !== recognition.caseId) continue;
      const moves = records.slice(formulaStartIndex, endIndex).map((record) => record.move).filter(Boolean);
      const validation = evaluateOpFormulaCandidate({
        kind,
        caseId: formulaRecognition.caseId,
        startFacelets: formulaStartFacelets,
        moves,
        maxMoves,
      });
      return opEventFromRange({
        kind,
        recognition: formulaRecognition,
        records,
        solve,
        observationStartIndex: startIndex,
        startIndex: formulaStartIndex,
        endIndex,
        moves,
        startFacelets: formulaStartFacelets,
        formulaAccepted: false,
        formulaReason: validation.reason === 'intermediate-op-case' ? validation.reason : 'intermediate-op-case',
      });
    }
  }

  return null;
}

function findCompositeOpTransitionForAccepted(kind, snapshots, records, solve, accepted) {
  if (!accepted?.formulaAccepted || acceptedMovesMatchPrefilledFormula(accepted)) return null;
  const startIndex = Math.max(0, Number(accepted.startStep) - 1);
  const endIndex = Math.max(0, Number(accepted.endStep));
  if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex) || endIndex <= startIndex + 1) return null;

  const startFacelets = snapshots[startIndex];
  const recognition = kind === 'oll' ? recognizeOllCase(startFacelets) : recognizePllCase(startFacelets);
  if (!recognition || recognition.confidence !== 'unique') return null;

  for (let splitIndex = startIndex + 1; splitIndex < endIndex; splitIndex += 1) {
    const intermediateFacelets = snapshots[splitIndex];
    const nextRecognition = kind === 'oll'
      ? recognizeOllCase(intermediateFacelets)
      : recognizePllCase(intermediateFacelets);
    if (!nextRecognition || nextRecognition.confidence !== 'unique' || nextRecognition.caseId === recognition.caseId) continue;

    const suffixMoves = records
      .slice(splitIndex, endIndex)
      .map((record) => record.move)
      .filter(Boolean);
    const suffixValidation = evaluateOpFormulaCandidate({
      kind,
      caseId: nextRecognition.caseId,
      startFacelets: intermediateFacelets,
      moves: suffixMoves,
      maxMoves: kind === 'oll' ? 24 : 30,
    });
    if (!suffixValidation.accepted) continue;

    const moves = records
      .slice(startIndex, splitIndex)
      .map((record) => record.move)
      .filter(Boolean);
    return opEventFromRange({
      kind,
      recognition,
      records,
      solve,
      startIndex,
      endIndex: splitIndex,
      moves,
      startFacelets,
      formulaAccepted: false,
      formulaReason: 'intermediate-op-case',
    });
  }

  return null;
}

function opEventCompletionReached(kind, facelets, endIndex, recordCount, solve) {
  if (!facelets) return false;
  if (kind === 'oll') return Boolean(pllSignatureFromFacelets(facelets));
  if (isSolvedFacelets(facelets)) return true;
  return solveFinalSolvedByStatePacket(solve) && endIndex === recordCount;
}

function mergeOpEvents(primaryEvents, fallbackEvents) {
  const events = [];
  for (const event of primaryEvents) {
    if (!event || hasDuplicateOpEvent(events, event)) continue;
    events.push(event);
  }
  for (const event of fallbackEvents) {
    if (!event || hasDuplicateOpEvent(events, event) || hasOverlappingOpEvent(events, event)) continue;
    events.push(event);
  }
  return events.sort((left, right) => (left.startStep ?? 0) - (right.startStep ?? 0));
}

function hasDuplicateOpEvent(events, event) {
  return events.some((item) => item.kind === event.kind
    && item.caseId === event.caseId
    && item.startStep === event.startStep
    && item.endStep === event.endStep);
}

function hasOverlappingOpEvent(events, event) {
  return events.some((item) => item.kind === event.kind && eventRangesOverlap(item, event));
}

function eventRangesOverlap(left, right) {
  const leftStart = Number(left?.startStep);
  const leftEnd = Number(left?.endStep);
  const rightStart = Number(right?.startStep);
  const rightEnd = Number(right?.endStep);
  if (![leftStart, leftEnd, rightStart, rightEnd].every(Number.isFinite)) return false;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function opEventFromStage(stage, kind, snapshots, records, solve = null) {
  if (!stage?.completed || !Number.isInteger(stage.startStep) || !Number.isInteger(stage.endStep)) return null;
  const observationStartIndex = stage.startStep - 1;
  const formulaStartIndex = opFormulaStartIndex(records, observationStartIndex, stage.endStep);
  if (formulaStartIndex >= stage.endStep) return null;
  const facelets = snapshots[formulaStartIndex];
  if (!facelets) return null;

  const recognition = kind === 'oll' ? recognizeOllCase(facelets) : recognizePllCase(facelets);
  if (!recognition || recognition.confidence === 'none') return null;
  const moves = records
    .slice(formulaStartIndex, stage.endStep)
    .map((record) => record.move)
    .filter(Boolean);
  const moveTimings = moveTimingsForRange(records, formulaStartIndex, stage.endStep, stage.startedAtElapsedMs);
  const validation = evaluateOpFormulaCandidate({
    kind,
    caseId: recognition.caseId,
    startFacelets: facelets,
    moves,
    maxMoves: kind === 'oll' ? 24 : 30,
    moveTimings,
  });
  const firstMoveElapsedMs = elapsedAtSolveStep(records, formulaStartIndex + 1);
  const observationMs = Number.isFinite(stage.startedAtElapsedMs) && Number.isFinite(firstMoveElapsedMs)
    ? Math.max(0, firstMoveElapsedMs - stage.startedAtElapsedMs)
    : null;

  return {
    kind,
    caseId: recognition.caseId,
    name: recognition.name,
    group: recognition.group,
    algorithm: recognition.algorithm,
    pdfLabel: recognition.pdfLabel || '',
    source: recognition.source || '',
    confidence: recognition.confidence,
    matchCount: recognition.matchCount,
    signature: recognition.signature,
    startStep: formulaStartIndex + 1,
    endStep: stage.endStep,
    completedAt: stage.completedAt,
    turns: moves.length,
    durationMs: stage.durationMs,
    observationMs,
    tps: stage.durationMs > 0 ? Math.round((moves.length / (stage.durationMs / 1000)) * 100) / 100 : null,
    moves,
    startedAtElapsedMs: stage.startedAtElapsedMs,
    firstMoveElapsedMs,
    completedAtElapsedMs: stage.completedAtElapsedMs,
    startedAtTimestampMs: stage.startedAtTimestampMs,
    firstMoveTimestampMs: timestampAtSolveStep(records, formulaStartIndex + 1, solve),
    completedAtTimestampMs: stage.completedAtTimestampMs,
    startedAtIsoTime: stage.startedAtIsoTime,
    firstMoveIsoTime: isoTimeAtSolveStep(records, formulaStartIndex + 1, solve),
    completedAtIsoTime: stage.completedAtIsoTime,
    startFacelets: facelets,
    formulaAccepted: validation.accepted === true,
    formulaReason: validation.reason || 'stage-fallback',
    moveTimings,
  };
}

function opEventFromRange({
  kind,
  recognition,
  records,
  solve,
  startIndex,
  observationStartIndex = startIndex,
  endIndex,
  moves,
  startFacelets = '',
  formulaAccepted,
  formulaReason,
}) {
  const startStep = startIndex + 1;
  const endStep = endIndex;
  const turns = moves.length;
  const startedAtElapsedMs = elapsedAtSolveStep(records, observationStartIndex);
  const firstMoveElapsedMs = elapsedAtSolveStep(records, startStep);
  const completedAtElapsedMs = elapsedAtSolveStep(records, endStep);
  const durationMs = Number.isFinite(startedAtElapsedMs) && Number.isFinite(completedAtElapsedMs)
    ? Math.max(0, completedAtElapsedMs - startedAtElapsedMs)
    : null;
  const observationMs = Number.isFinite(startedAtElapsedMs) && Number.isFinite(firstMoveElapsedMs)
    ? Math.max(0, firstMoveElapsedMs - startedAtElapsedMs)
    : null;
  const tps = durationMs > 0 ? Math.round((turns / (durationMs / 1000)) * 100) / 100 : null;

  return {
    kind,
    caseId: recognition.caseId,
    name: recognition.name,
    group: recognition.group,
    algorithm: recognition.algorithm,
    pdfLabel: recognition.pdfLabel || '',
    source: recognition.source || '',
    confidence: recognition.confidence,
    matchCount: recognition.matchCount,
    signature: recognition.signature,
    startStep,
    endStep,
    completedAt: endStep,
    turns,
    durationMs,
    observationMs,
    tps,
    moves,
    formulaAccepted,
    formulaReason,
    startedAtElapsedMs,
    firstMoveElapsedMs,
    completedAtElapsedMs,
    startedAtTimestampMs: timestampAtSolveStep(records, observationStartIndex, solve),
    firstMoveTimestampMs: timestampAtSolveStep(records, startStep, solve),
    completedAtTimestampMs: timestampAtSolveStep(records, endStep, solve),
    startedAtIsoTime: isoTimeAtSolveStep(records, observationStartIndex, solve),
    firstMoveIsoTime: isoTimeAtSolveStep(records, startStep, solve),
    completedAtIsoTime: isoTimeAtSolveStep(records, endStep, solve),
    startFacelets,
    moveTimings: moveTimingsForRange(records, startIndex, endIndex, startedAtElapsedMs),
  };
}

function opFormulaStartIndex(records, startIndex, endIndex) {
  let index = Math.max(0, Number(startIndex) || 0);
  const cappedEndIndex = Math.max(index, Number(endIndex) || index);
  while (index < cappedEndIndex && isAufMove(records[index]?.move)) index += 1;
  return index;
}

function moveTimingsForRange(records, startIndex, endIndex, startedAtElapsedMs = null) {
  const entries = [];
  let previousElapsedMs = Number.isFinite(startedAtElapsedMs) ? startedAtElapsedMs : null;
  for (let recordIndex = startIndex; recordIndex < endIndex; recordIndex += 1) {
    const record = records[recordIndex];
    if (!record?.move) continue;
    const elapsedMs = Number.isFinite(record.elapsedMs) ? record.elapsedMs : null;
    const deltaMs = Number.isFinite(elapsedMs) && Number.isFinite(previousElapsedMs)
      ? Math.max(0, elapsedMs - previousElapsedMs)
      : null;
    entries.push({
      step: Number.isInteger(record.step) ? record.step : recordIndex + 1,
      move: record.move,
      elapsedMs,
      deltaMs,
      timestampMs: Number.isFinite(record.timestampMs) ? record.timestampMs : null,
      isoTime: typeof record.isoTime === 'string' ? record.isoTime : '',
    });
    if (Number.isFinite(elapsedMs)) previousElapsedMs = elapsedMs;
  }
  return entries;
}

function elapsedAtSolveStep(records, step) {
  if (step <= 0) return 0;
  const record = records[step - 1];
  return Number.isFinite(record?.elapsedMs) ? record.elapsedMs : null;
}

function timestampAtSolveStep(records, step, solve = null) {
  if (step <= 0) return solveStartTimestampMs(solve, records);
  const record = records[step - 1];
  return Number.isFinite(record?.timestampMs) ? record.timestampMs : null;
}

function isoTimeAtSolveStep(records, step, solve = null) {
  if (step <= 0) return solveStartIsoTime(solve, records);
  const record = records[step - 1];
  return typeof record?.isoTime === 'string' ? record.isoTime : '';
}

function solveStartTimestampMs(solve, records) {
  const explicit = Number(solve?.timerStartedAtMs ?? solve?.solveStartedAtMs);
  if (Number.isFinite(explicit)) return explicit;
  const firstRecordStart = Number(records[0]?.solveStartedAtMs);
  if (Number.isFinite(firstRecordStart)) return firstRecordStart;
  const startedAt = new Date(solve?.timerStartedAt || records[0]?.solveStartedAtIsoTime || '').getTime();
  return Number.isFinite(startedAt) ? startedAt : null;
}

function solveStartIsoTime(solve, records) {
  if (typeof solve?.timerStartedAt === 'string') return solve.timerStartedAt;
  if (typeof records[0]?.solveStartedAtIsoTime === 'string') return records[0].solveStartedAtIsoTime;
  const startedAtMs = solveStartTimestampMs(solve, records);
  return Number.isFinite(startedAtMs) ? new Date(startedAtMs).toISOString() : '';
}

function solveFinalSolvedByStatePacket(solve) {
  return solve?.bluetoothSolvedByStatePacket === true || solve?.finalSolvedByStatePacket === true;
}

function acceptedMovesMatchPrefilledFormula(event) {
  const pdf = opPdfAlgorithmForCase(event.kind, event.caseId);
  if (!pdf) return false;
  const observedMoves = normalizeFormulaMoves(event.moves);
  const pdfMoves = normalizeFormulaMoves(pdf.algorithm);
  if (!Array.isArray(observedMoves) || !Array.isArray(pdfMoves) || pdfMoves.length === 0) return false;
  if (movesEqual(observedMoves, pdfMoves)) return true;
  return outerAufStrippedMoveCandidates(observedMoves).some((candidate) => movesEqual(candidate, pdfMoves));
}

function outerAufStrippedMoveCandidates(moves) {
  const candidates = [];
  let leading = 0;
  while (leading < moves.length && isAufMove(moves[leading])) leading += 1;
  let trailing = moves.length;
  while (trailing > 0 && isAufMove(moves[trailing - 1])) trailing -= 1;
  for (let start = 0; start <= leading; start += 1) {
    for (let end = moves.length; end >= trailing; end -= 1) {
      if (start === 0 && end === moves.length) continue;
      if (start >= end) continue;
      candidates.push(moves.slice(start, end));
    }
  }
  return candidates;
}

function isAufMove(move) {
  return /^U(?:2|')?$/.test(String(move || ''));
}

function movesEqual(left, right) {
  return left.length === right.length && left.every((move, index) => move === right[index]);
}

function isValidPllCompletionState(facelets) {
  if (isSolvedFacelets(facelets)) return true;
  const pll = recognizePllCase(facelets);
  if (pll?.confidence === 'unique') return true;
  return uRotations.some((rotation) => {
    if (!rotation) return false;
    try {
      return isSolvedFacelets(applyMovesToFacelets(facelets, rotation));
    } catch {
      return false;
    }
  });
}
