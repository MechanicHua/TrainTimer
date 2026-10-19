import {
  applyMoveToFacelets,
  createSolvedCube,
  facesFromFacelets,
  faceletsFromScramble,
  isSolvedFaces,
  parseMoveToken,
} from './cube-state.js';
import { bluetoothStateLogSnapshotCorrections } from './bluetooth-state-log.js';
import { logicalMoveRecords } from './move-metrics.js';

const cubeFaceNormals = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};
const cubeOppositeFaces = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
const cfopBottomFaceOrder = ['D', 'U', 'F', 'B', 'L', 'R'];
const cfopFallbackPairSlots = Array.from({ length: 4 }, (_, index) => ({
  key: `pair-${index + 1}`,
  label: `F${index + 1}`,
  name: `F2L Pair ${index + 1}`,
  cells: [],
}));
const cfopDefinitions = createCfopDefinitions();

export const cfopAnalysisVersion = 8;

export function solveMoveRecords(solve) {
  return logicalMoveRecords(solvePhysicalMoveRecords(solve));
}

export function solvePhysicalMoveRecords(solve) {
  if (!solve) return [];
  const moveLog = Array.isArray(solve.bluetoothMoveLog) ? solve.bluetoothMoveLog : [];
  const moves = Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves : [];
  const records = moveLog.length > 0
    ? moveLog.map((entry, index) => ({
      ...entry,
      step: Number.isFinite(Number(entry.step)) ? Number(entry.step) : index + 1,
      move: String(entry.move || '').trim(),
      elapsedMs: optionalFiniteNumber(entry.elapsedMs),
      timestampMs: optionalFiniteNumber(entry.timestampMs),
      isoTime: typeof entry.isoTime === 'string' ? entry.isoTime : '',
      solveStartedAtMs: optionalFiniteNumber(entry.solveStartedAtMs),
      solveStartedAtIsoTime: typeof entry.solveStartedAtIsoTime === 'string' ? entry.solveStartedAtIsoTime : '',
    }))
    : moves.map((move, index) => ({ step: index + 1, move, elapsedMs: null }));
  const normalized = records
    .map(physicalMoveRecord)
    .filter(Boolean)
    .map((record, index) => ({ ...record, step: index + 1 }));
  return interpolateMoveTimes(normalized, solve);
}

function interpolateMoveTimes(records, solve) {
  const start = solveStartTimestampMs(solve, records);
  const normalized = records.map((record) => ({ ...record,
    elapsedMs: optionalFiniteNumber(record.elapsedMs)
      ?? (Number.isFinite(start) && optionalFiniteNumber(record.timestampMs) != null ? record.timestampMs - start : null),
  }));
  // Interpolate only absent timestamps; observed timings remain untouched.
  let leftIndex = -1;
  let leftTime = 0;
  for (let index = 0; index <= normalized.length; index += 1) {
    const rightTime = index < normalized.length ? normalized[index].elapsedMs : optionalFiniteNumber(solve?.durationMs);
    if (!Number.isFinite(rightTime)) continue;
    const rightIndex = index < normalized.length ? index : normalized.length - 1;
    for (let missing = leftIndex + 1; missing < index && missing <= rightIndex; missing += 1) {
      const elapsedMs = Math.round(leftTime + (Math.max(leftTime, rightTime) - leftTime) * (missing - leftIndex) / (rightIndex - leftIndex));
      normalized[missing] = { ...normalized[missing], elapsedMs, timingInterpolated: true,
        timestampMs: Number.isFinite(start) ? start + elapsedMs : normalized[missing].timestampMs,
        isoTime: Number.isFinite(start) ? new Date(start + elapsedMs).toISOString() : normalized[missing].isoTime,
      };
    }
    leftIndex = index;
    leftTime = rightTime;
  }
  return normalized;
}

function physicalMoveRecord(record) {
  try {
    const move = parseMoveToken(record?.move);
    return { ...record, move: `${move.face}${move.suffix || ''}` };
  } catch {
    return null;
  }
}

function optionalFiniteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function solveCfopAnalysis(solve) {
  const records = solveMoveRecords(solve);
  const detectionRecords = solvePhysicalMoveRecords(solve);
  const physicalStepToLogicalStep = logicalStepMapForPhysicalRecords(detectionRecords);
  const stageTemplate = cfopStageTemplate();
  const finalSolvedEvidence = solveFinalSolvedEvidence(solve);
  const finalSolvedByStatePacket = solveFinalSolvedByStatePacket(solve);
  if (!solve?.scramble || (detectionRecords.length === 0 && !finalSolvedEvidence) || (solve.scramblePuzzle || 'three') !== 'three') {
    return { records, detectionRecords, stages: stageTemplate, finalSolved: false };
  }

  const snapshots = cfopSnapshotsForSolve(solve, detectionRecords);
  if (snapshots.length === 0) {
    return { records, detectionRecords, stages: stageTemplate, finalSolved: false };
  }

  const candidates = [...cfopDefinitions.values()]
    .map((definition) => analyzeCfopDefinition(definition, snapshots, finalSolvedByStatePacket));
  const selection = selectCfopBottom(candidates, solve.cfopBottomFace);
  const completions = selection.candidate;
  if (!completions) {
    return {
      records, detectionRecords, stages: stageTemplate,
      finalSolved: finalSolvedEvidence || candidates.some((candidate) => candidate.pll != null),
      bottomFace: '', bottomFaceStatus: selection.status, bottomFaceCandidates: selection.faces,
    };
  }
  const cfopDefinition = completions.definition;

  const pairSlots = cfopDefinition?.pairSlots || cfopFallbackPairSlots;
  const orderedPairs = pairSlots
    .map((slot) => ({
      ...slot,
      includedInCross: completions.crossPairs.has(slot.key),
      completedAt: completions.pairs.get(slot.key) ?? null,
      completionSnapshot: completions.pairSnapshots?.get(slot.key) || null,
    }))
    .sort((left, right) => {
      const leftStep = left.completedAt ?? Number.POSITIVE_INFINITY;
      const rightStep = right.completedAt ?? Number.POSITIVE_INFINITY;
      const leftSequence = left.completionSnapshot?.sequence ?? Number.POSITIVE_INFINITY;
      const rightSequence = right.completionSnapshot?.sequence ?? Number.POSITIVE_INFINITY;
      return leftStep - rightStep
        || leftSequence - rightSequence
        || pairSlots.findIndex((slot) => slot.key === left.key) - pairSlots.findIndex((slot) => slot.key === right.key);
    });
  const pairStages = orderedPairs.map((slot, index) => ({
    key: slot.key,
    label: `F${index + 1}`,
    name: slot.name,
    includedInCross: slot.includedInCross,
    completedAt: index === 3 && !slot.includedInCross ? completions.f2l : slot.completedAt,
    completionSnapshot: index === 3 && !slot.includedInCross ? completions.f2lSnapshot : slot.completionSnapshot,
  }));

  const boundaries = [
    {
      key: 'cross',
      label: 'C',
      name: cfopCrossStageName(completions.crossPairs.size),
      completedAt: completions.cross,
      completionSnapshot: completions.crossSnapshot || null,
    },
    ...pairStages,
    { key: 'oll', label: 'O', name: 'OLL', completedAt: completions.oll, completionSnapshot: completions.ollSnapshot || null },
    {
      key: 'pll',
      label: 'P',
      name: 'PLL',
      completedAt: completions.pll,
      completionSnapshot: completions.pllSnapshot || null,
      skipped: Boolean(completions.pllSkip),
      skipAdjustment: completions.pllSkip?.adjustment || '',
    },
  ];
  interpolateGapBoundaries(boundaries, solve);
  const ollBoundary = boundaries.find((boundary) => boundary.key === 'oll');
  if (ollBoundary) ollBoundary.skipped = !ollBoundary.timingInterpolated
    && cfopBoundarySnapshotsMatch(completions.f2lSnapshot, completions.ollSnapshot);
  if (ollBoundary?.timingInterpolated) boundaries.find((boundary) => boundary.key === 'pll').skipped = false;
  let previousBoundary = { elapsedMs: 0, physicalStep: 0, logicalStep: 0, snapshot: snapshots[0] || null };
  const stages = boundaries.map((boundary) => {
    const stage = cfopStageFromBoundary(boundary, detectionRecords, previousBoundary, solve, physicalStepToLogicalStep, snapshots, cubeOppositeFaces[completions.bottomFace]);
    if (boundary.completedAt != null) {
      previousBoundary = {
        elapsedMs: stage.completedAtElapsedMs,
        physicalStep: stage.physicalEndStep ?? previousBoundary.physicalStep,
        logicalStep: stage.endStep ?? previousBoundary.logicalStep,
        snapshot: boundary.completionSnapshot || previousBoundary.snapshot,
      };
    }
    return stage;
  });

  return {
    records,
    detectionRecords,
    stages,
    finalSolved: finalSolvedEvidence || completions.pll != null,
    bottomFace: completions.bottomFace,
    bottomFaceStatus: selection.status,
    bottomFaceCandidates: selection.faces,
  };
}

export function cfopStageTemplate() {
  return [
    { label: 'C', name: 'Cross', completed: false, turns: 0, durationMs: null, tps: null },
    ...cfopFallbackPairSlots.map((slot, index) => ({ label: `F${index + 1}`, name: slot.name, completed: false, turns: 0, durationMs: null, tps: null })),
    { label: 'O', name: 'OLL', completed: false, turns: 0, durationMs: null, tps: null },
    { label: 'P', name: 'PLL', completed: false, turns: 0, durationMs: null, tps: null },
  ];
}

export function cfopStagesForSave(solve, analysis = solveCfopAnalysis(solve)) {
  return analysis.stages.map((stage) => ({
    key: stage.key || '',
    label: stage.label,
    name: stage.name,
    completed: Boolean(stage.completed),
    completedAt: stage.completedAt ?? null,
    startStep: stage.startStep ?? null,
    endStep: stage.endStep ?? null,
    turns: stage.turns,
    physicalCompletedAt: stage.physicalCompletedAt ?? null,
    physicalStartStep: stage.physicalStartStep ?? null,
    physicalEndStep: stage.physicalEndStep ?? null,
    physicalTurns: stage.physicalTurns ?? null,
    stateTransitionObserved: stage.stateTransitionObserved === true,
    unobservedTurns: stage.unobservedTurns === true,
    completionSource: stage.completionSource || '',
    includedInCross: stage.includedInCross === true,
    timingInterpolated: stage.timingInterpolated === true,
    skipped: stage.skipped === true,
    skipAdjustment: stage.skipAdjustment || '',
    analysisVersion: cfopAnalysisVersion,
    durationMs: Number.isFinite(stage.durationMs) ? Math.round(stage.durationMs) : null,
    tps: Number.isFinite(stage.tps) ? stage.tps : null,
    startedAtElapsedMs: Number.isFinite(stage.startedAtElapsedMs) ? Math.round(stage.startedAtElapsedMs) : null,
    firstMoveElapsedMs: Number.isFinite(stage.firstMoveElapsedMs) ? Math.round(stage.firstMoveElapsedMs) : null,
    completedAtElapsedMs: Number.isFinite(stage.completedAtElapsedMs) ? Math.round(stage.completedAtElapsedMs) : null,
    observationMs: Number.isFinite(stage.observationMs) ? Math.round(stage.observationMs) : null,
    startedAtTimestampMs: Number.isFinite(stage.startedAtTimestampMs) ? Math.round(stage.startedAtTimestampMs) : null,
    firstMoveTimestampMs: Number.isFinite(stage.firstMoveTimestampMs) ? Math.round(stage.firstMoveTimestampMs) : null,
    completedAtTimestampMs: Number.isFinite(stage.completedAtTimestampMs) ? Math.round(stage.completedAtTimestampMs) : null,
    startedAtIsoTime: stage.startedAtIsoTime || '',
    firstMoveIsoTime: stage.firstMoveIsoTime || '',
    completedAtIsoTime: stage.completedAtIsoTime || '',
  }));
}

function logicalStepMapForPhysicalRecords(records) {
  const stepMap = new Map([[0, 0]]);
  const logicalRecords = [];
  for (let index = 0; index < records.length; index += 1) {
    const physicalStep = index + 1;
    const move = parseMoveToken(records[index]?.move);
    const previous = logicalRecords.at(-1);
    if (canMergePhysicalMoveIntoLogicalHalfTurn(previous, move)) {
      previous.move = `${move.face}2`;
      previous.suffix = '2';
      previous.rawPhysicalSteps.push(physicalStep);
      stepMap.set(physicalStep, previous.logicalStep);
      continue;
    }
    const logicalStep = logicalRecords.length + 1;
    logicalRecords.push({
      logicalStep,
      face: move.face,
      suffix: move.suffix || '',
      move: `${move.face}${move.suffix || ''}`,
      rawPhysicalSteps: [physicalStep],
    });
    stepMap.set(physicalStep, logicalStep);
  }
  return stepMap;
}

function canMergePhysicalMoveIntoLogicalHalfTurn(previous, move) {
  return previous
    && move
    && previous.face === move.face
    && previous.suffix !== '2'
    && move.suffix !== '2'
    && previous.suffix === (move.suffix || '');
}

function createCfopDefinitions() {
  const stickers = createSolvedCube();
  const cubies = new Map();
  for (const sticker of stickers) {
    const key = sticker.pos.join(',');
    if (!cubies.has(key)) cubies.set(key, []);
    cubies.get(key).push({
      color: sticker.face,
      cell: cfopSolvedStickerCell(sticker),
    });
  }

  const edgeCubies = [...cubies.values()].filter((cubie) => cubie.length === 2);
  const cornerCubies = [...cubies.values()].filter((cubie) => cubie.length === 3);
  const definitions = new Map();
  for (const bottomFace of cfopBottomFaceOrder) {
    const topFace = cubeOppositeFaces[bottomFace];
    const crossCells = edgeCubies
      .filter((cubie) => cubie.some((sticker) => sticker.color === bottomFace))
      .flatMap((cubie) => cubie.map((sticker) => sticker.cell));
    const pairSlots = cornerCubies
      .filter((corner) => corner.some((sticker) => sticker.color === bottomFace))
      .map((corner, index) => {
        const sideFaces = corner.map((sticker) => sticker.color).filter((face) => face !== bottomFace);
        const edge = edgeCubies.find((candidate) => (
          sideFaces.every((face) => candidate.some((sticker) => sticker.color === face))
        ));
        return {
          key: `${bottomFace}-${sideFaces.join('')}`,
          label: `F${index + 1}`,
          name: `F2L ${sideFaces.join('/')}`,
          cells: [
            ...corner.map((sticker) => sticker.cell),
            ...(edge ? edge.map((sticker) => sticker.cell) : []),
          ],
        };
      });
    const ollCells = Array.from({ length: 9 }, (_, index) => [topFace, Math.floor(index / 3), index % 3]);
    definitions.set(bottomFace, { bottomFace, topFace, crossCells, pairSlots, ollCells });
  }
  return definitions;
}

function cfopSolvedStickerCell(sticker) {
  const face = cfopFaceFromNormal(sticker.normal);
  const [row, col] = cfopFaceGridPosition(face, sticker.pos);
  return [face, row, col];
}

function cfopFaceFromNormal(normal) {
  for (const [face, candidate] of Object.entries(cubeFaceNormals)) {
    if (normal.every((value, index) => value === candidate[index])) return face;
  }
  throw new Error(`Invalid sticker normal: ${normal.join(',')}`);
}

function cfopFaceGridPosition(face, [x, y, z]) {
  if (face === 'U') return [z + 1, x + 1];
  if (face === 'D') return [1 - z, x + 1];
  if (face === 'F') return [1 - y, x + 1];
  if (face === 'B') return [1 - y, 1 - x];
  if (face === 'R') return [1 - y, 1 - z];
  if (face === 'L') return [1 - y, z + 1];
  throw new Error(`Unsupported face: ${face}`);
}

export function solveFaceletSnapshotsForAnalysis(solve, records = solvePhysicalMoveRecords(solve)) {
  try {
    const correctionByStep = stateCorrectionsByStep(analysisStateCorrectionsForSolve(solve), records.length);
    let facelets = faceletsFromScramble(solve.scramble);
    const initialCorrection = correctionByStep.get(0);
    if (initialCorrection) facelets = initialCorrection.facelets;
    const snapshots = [{ step: 0, facelets, correction: initialCorrection || null }];
    for (let index = 0; index < records.length; index += 1) {
      facelets = applyMoveToFacelets(facelets, records[index].move);
      const step = index + 1;
      const correction = correctionByStep.get(step);
      if (correction) facelets = correction.facelets;
      snapshots.push({ step, facelets, correction: correction || null });
    }
    return snapshots;
  } catch {
    return [];
  }
}

export function solveFaceletStateTimelineForAnalysis(solve, records = solvePhysicalMoveRecords(solve)) {
  try {
    const correctionsByStep = stateCorrectionEventsByStep(analysisStateCorrectionsForSolve(solve), records.length);
    let facelets = faceletsFromScramble(solve.scramble);
    const snapshots = [analysisTimelineSnapshot({
      step: 0,
      sequence: 0,
      facelets,
      source: 'initial',
      solve,
      records,
    })];
    let sequence = 1;

    for (const correction of correctionsByStep.get(0) || []) {
      const gapStart = facelets !== correction.facelets ? snapshots.at(-1) : null;
      facelets = correction.facelets;
      snapshots.push(analysisTimelineSnapshot({
        step: 0,
        sequence,
        facelets,
        correction,
        gapStart,
        source: 'state',
        solve,
        records,
      }));
      sequence += 1;
    }

    for (let index = 0; index < records.length; index += 1) {
      facelets = applyMoveToFacelets(facelets, records[index].move);
      const step = index + 1;
      const corrections = correctionsByStep.get(step) || [];
      if (corrections.length === 0) {
        snapshots.push(analysisTimelineSnapshot({
          step,
          sequence,
          facelets,
          record: records[index],
          source: 'move',
          solve,
          records,
        }));
        sequence += 1;
        continue;
      }

      // A confirming packet must not postpone an already known move boundary.
      if (corrections.some((correction) => correction.facelets === facelets)) {
        snapshots.push(analysisTimelineSnapshot({ step, sequence, facelets, record: records[index], source: 'move', solve, records }));
        sequence += 1;
      }
      for (const correction of corrections) {
        const gapStart = facelets !== correction.facelets ? snapshots.at(-1) : null;
        facelets = correction.facelets;
        snapshots.push(analysisTimelineSnapshot({
          step,
          sequence,
          facelets,
          correction,
          gapStart,
          record: records[index],
          source: 'state',
          solve,
          records,
        }));
        sequence += 1;
      }
    }
    return snapshots;
  } catch {
    return [];
  }
}

function analysisTimelineSnapshot(options) {
  const timing = options.correction || options.record || {};
  const elapsedMs = optionalFiniteNumber(timing.elapsedMs);
  const timestampMs = optionalFiniteNumber(timing.timestampMs);
  const fallbackTimestampMs = options.step === 0 ? solveStartTimestampMs(options.solve, options.records) : null;
  const resolvedTimestampMs = Number.isFinite(timestampMs) ? timestampMs : fallbackTimestampMs;
  const fallbackIsoTime = options.step === 0 ? solveStartIsoTime(options.solve, options.records) : '';
  return {
    step: options.step,
    sequence: options.sequence,
    facelets: options.facelets,
    correction: options.correction || null,
    gapStart: options.gapStart || null,
    timingInterpolated: timing.timingInterpolated === true,
    source: options.source,
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : (options.step === 0 ? 0 : null),
    timestampMs: Number.isFinite(resolvedTimestampMs) ? resolvedTimestampMs : null,
    isoTime: typeof timing.isoTime === 'string' && timing.isoTime ? timing.isoTime : fallbackIsoTime,
  };
}

function cfopSnapshotsForSolve(solve, records) {
  try {
    const faceletSnapshots = solveFaceletStateTimelineForAnalysis(solve, records);
    return faceletSnapshots.map((snapshot) => ({
      step: snapshot.step,
      sequence: snapshot.sequence,
      facelets: snapshot.facelets,
      faces: facesFromFacelets(snapshot.facelets),
      correction: snapshot.correction || null,
      gapStart: snapshot.gapStart || null,
      timingInterpolated: snapshot.timingInterpolated === true,
      source: snapshot.source || '',
      elapsedMs: snapshot.elapsedMs,
      timestampMs: snapshot.timestampMs,
      isoTime: snapshot.isoTime || '',
    }));
  } catch {
    return [];
  }
}

function analysisStateCorrectionsForSolve(solve) {
  return [
    ...bluetoothStateLogSnapshotCorrections(solve?.bluetoothStateLog),
    ...(Array.isArray(solve?.bluetoothStateCorrections) ? solve.bluetoothStateCorrections : []),
  ];
}

function stateCorrectionsByStep(corrections, maxStep) {
  const byStep = new Map();
  if (!Array.isArray(corrections)) return byStep;
  for (const correction of corrections) {
    const normalized = normalizeAnalysisStateCorrection(correction, maxStep);
    if (normalized) byStep.set(normalized.step, normalized);
  }
  return byStep;
}

function stateCorrectionEventsByStep(corrections, maxStep) {
  const byStep = new Map();
  if (!Array.isArray(corrections)) return byStep;
  const normalized = corrections
    .map((correction, order) => {
      const value = normalizeAnalysisStateCorrection(correction, maxStep);
      return value ? { ...value, order } : null;
    })
    .filter(Boolean)
    .sort(compareStateCorrectionEvents);

  for (const correction of normalized) {
    const bucket = byStep.get(correction.step) || [];
    const previous = bucket.at(-1);
    if (previous?.facelets === correction.facelets) {
      if (stateCorrectionEventPriority(correction) >= stateCorrectionEventPriority(previous)) {
        bucket[bucket.length - 1] = correction;
      }
    } else {
      bucket.push(correction);
    }
    byStep.set(correction.step, bucket);
  }
  return byStep;
}

function compareStateCorrectionEvents(left, right) {
  if (left.step !== right.step) return left.step - right.step;
  const leftTimestamp = optionalFiniteNumber(left.timestampMs);
  const rightTimestamp = optionalFiniteNumber(right.timestampMs);
  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  const leftElapsed = optionalFiniteNumber(left.elapsedMs);
  const rightElapsed = optionalFiniteNumber(right.elapsedMs);
  if (Number.isFinite(leftElapsed) && Number.isFinite(rightElapsed) && leftElapsed !== rightElapsed) {
    return leftElapsed - rightElapsed;
  }
  return left.order - right.order;
}

function stateCorrectionEventPriority(correction) {
  return correction?.reason === 'state-log' ? 0 : 1;
}

function normalizeAnalysisStateCorrection(correction, maxStep) {
  const step = Number(correction?.step);
  if (!Number.isInteger(step) || step < 0 || step > maxStep) return null;
  const facelets = String(correction?.facelets || '').trim().toUpperCase();
  if (!/^[URFDLB]{54}$/.test(facelets)) return null;
  try {
    facesFromFacelets(facelets);
  } catch {
    return null;
  }
  return {
    ...correction,
    step,
    facelets,
  };
}

function analyzeCfopDefinition(definition, snapshots, finalSolvedByStatePacket = false) {
  const completions = {
    definition, bottomFace: definition.bottomFace,
    cross: null, crossSnapshot: null, crossPairs: new Set(),
    pairs: new Map(), pairSnapshots: new Map(),
    f2l: null, f2lSnapshot: null, oll: null, ollSnapshot: null, pll: null, pllSnapshot: null,
  };

  for (const snapshot of snapshots) {
    const crossSolved = isFaceletSetSolved(snapshot.faces, definition.crossCells);
    const solvedSlots = definition.pairSlots.filter((slot) => isFaceletSetSolved(snapshot.faces, slot.cells));
    const solvedKeys = new Set(solvedSlots.map((slot) => slot.key));
    if (completions.cross == null && crossSolved) {
      completions.cross = snapshot.step;
      completions.crossSnapshot = snapshot;
      const priorFaces = snapshot.gapStart ? facesFromFacelets(snapshot.gapStart.facelets) : null;
      const includedSlots = priorFaces ? solvedSlots.filter((slot) => isFaceletSetSolved(priorFaces, slot.cells)) : solvedSlots;
      completions.crossPairs = new Set(includedSlots.map((slot) => slot.key));
      for (const slot of includedSlots) {
        completions.pairs.set(slot.key, snapshot.step);
        completions.pairSnapshots.set(slot.key, snapshot);
      }
    }
    if (completions.cross == null) continue;

    if (completions.f2l == null) {
      // Record each slot once for the sequential F rows. Temporary displacements
      // during later insertions do not add stages; only current full F2L ends F.
      for (const slot of definition.pairSlots) {
        if (completions.crossPairs.has(slot.key)) continue;
        if (solvedKeys.has(slot.key) && !completions.pairs.has(slot.key)) {
          completions.pairs.set(slot.key, snapshot.step);
          completions.pairSnapshots.set(slot.key, snapshot);
        }
      }
      if (crossSolved && solvedSlots.length === 4) {
        completions.f2l = snapshot.step;
        completions.f2lSnapshot = snapshot;
        const remaining = definition.pairSlots.filter((slot) => !completions.crossPairs.has(slot.key))
          .sort((a, b) => completions.pairSnapshots.get(a.key).sequence - completions.pairSnapshots.get(b.key).sequence);
        // Restoring Cross or an included pair still consumes F2L time.
        const last = remaining.at(-1);
        if (last) {
          completions.pairs.set(last.key, snapshot.step);
          completions.pairSnapshots.set(last.key, snapshot);
        }
      }
    }
    const fullF2l = crossSolved && solvedSlots.length === 4;
    if (completions.f2l == null || !fullF2l) continue;
    if (completions.oll == null && isFaceletSetSolved(snapshot.faces, definition.ollCells)) {
      completions.oll = snapshot.step;
      completions.ollSnapshot = snapshot;
    }
    if (completions.oll != null && completions.pll == null && isSolvedFaces(snapshot.faces)) {
      completions.pll = snapshot.step;
      completions.pllSnapshot = snapshot;
    }
  }
  if (finalSolvedByStatePacket && completions.oll != null && completions.pll == null) {
    completions.pllSnapshot = snapshots.at(-1);
    completions.pll = completions.pllSnapshot.step;
  }
  completions.pllSkip = cfopPllSkipAtOllCompletion(completions.ollSnapshot, definition);
  return completions;
}

function selectCfopBottom(candidates, requestedFace) {
  const requested = String(requestedFace || '').toUpperCase();
  const explicit = candidates.find((candidate) => candidate.bottomFace === requested);
  if (explicit) return { candidate: explicit, status: 'selected', faces: [requested] };
  const completed = candidates.filter((candidate) => candidate.f2lSnapshot);
  if (!completed.length) return { candidate: null, status: 'unavailable', faces: [] };
  const earliest = Math.min(...completed.map((candidate) => candidate.f2lSnapshot.sequence));
  const matches = completed.filter((candidate) => candidate.f2lSnapshot.sequence === earliest);
  return {
    candidate: matches.length === 1 ? matches[0] : null,
    status: matches.length === 1 ? 'automatic' : 'ambiguous',
    faces: matches.map((candidate) => candidate.bottomFace),
  };
}

function interpolateGapBoundaries(boundaries, solve) {
  const gaps = new Map();
  for (const boundary of boundaries) {
    const end = boundary.completionSnapshot;
    if (!end?.gapStart || boundary.includedInCross) continue;
    const group = gaps.get(end.sequence) || [];
    group.push(boundary);
    gaps.set(end.sequence, group);
  }
  for (const group of gaps.values()) {
    const end = group[0].completionSnapshot;
    const startMs = optionalFiniteNumber(end.gapStart.elapsedMs);
    const stopMs = optionalFiniteNumber(solve?.durationMs);
    const observedEndMs = optionalFiniteNumber(end.elapsedMs);
    const endMs = Number.isFinite(stopMs) && Number.isFinite(observedEndMs) ? Math.min(stopMs, observedEndMs) : observedEndMs;
    if (startMs == null || endMs == null || endMs < startMs) continue;
    const endsSolve = group.at(-1).key === 'pll';
    const denominator = group.length + (endsSolve ? 0 : 1);
    group.forEach((boundary, index) => {
      const elapsedMs = Math.round(startMs + (endMs - startMs) * (index + 1) / denominator);
      boundary.completionSnapshot = { ...end, elapsedMs, timingInterpolated: true };
      boundary.timingInterpolated = true;
      boundary.skipped = false;
      if (boundary.key === 'cross') {
        for (const pair of boundaries.filter((item) => item.includedInCross)) {
          pair.completionSnapshot = boundary.completionSnapshot;
          pair.timingInterpolated = true;
        }
      }
    });
  }
}

function cfopBoundarySnapshotsMatch(left, right) {
  if (!left || !right) return false;
  if (Number.isFinite(left.sequence) && Number.isFinite(right.sequence)) return left.sequence === right.sequence;
  return left.step === right.step && left.facelets === right.facelets;
}

function cfopPllSkipAtOllCompletion(snapshot, definition) {
  if (!snapshot?.facelets || !definition?.bottomFace) return null;
  const topFace = cubeOppositeFaces[definition.bottomFace];
  for (const suffix of [null, '', '2', "'"]) {
    const adjustment = suffix == null ? '' : `${topFace}${suffix}`;
    const facelets = adjustment ? applyMoveToFacelets(snapshot.facelets, adjustment) : snapshot.facelets;
    if (isSolvedFaces(facesFromFacelets(facelets))) return { adjustment };
  }
  return null;
}

function cfopCrossStageName(pairCount) {
  return pairCount > 0 ? `${'x'.repeat(pairCount)}cross` : 'Cross';
}

function cfopStageFromBoundary(boundary, records, previousBoundary, solve = null, physicalStepToLogicalStep = new Map([[0, 0]]), snapshots = [], topFace = 'U') {
  const previousPhysicalStep = Math.max(0, Number(previousBoundary?.physicalStep) || 0);
  const previousLogicalStep = Math.max(0, Number(previousBoundary?.logicalStep) || 0);
  const completed = boundary.completedAt != null;
  const physicalCompletedAt = completed ? Math.max(0, Math.round(Number(boundary.completedAt))) : null;
  const physicalEndStep = completed ? Math.max(previousPhysicalStep, physicalCompletedAt) : previousPhysicalStep;
  const endStep = completed ? logicalStepForPhysicalStep(physicalStepToLogicalStep, physicalEndStep) : previousLogicalStep;
  const stageSnapshots = snapshots.filter((snapshot) => snapshot.sequence >= (previousBoundary.snapshot?.sequence ?? 0)
    && snapshot.sequence <= (boundary.completionSnapshot?.sequence ?? -1));
  const effectiveRecords = effectiveStageMoveRecords(stageSnapshots, records);
  const turns = completed ? logicalMoveRecords(effectiveRecords).length : 0;
  const physicalTurns = completed ? Math.max(0, physicalEndStep - previousPhysicalStep) : 0;
  const physicalStartStep = completed && physicalTurns > 0 ? previousPhysicalStep + 1 : null;
  const startSnapshot = previousBoundary?.snapshot || null;
  const endSnapshot = boundary.completionSnapshot || null;
  const stopElapsed = optionalFiniteNumber(solve?.durationMs);
  const clampElapsed = (value) => Number.isFinite(value)
    ? Math.max(0, Number.isFinite(stopElapsed) ? Math.min(stopElapsed, value) : value) : null;
  const startElapsed = clampElapsed(previousBoundary.elapsedMs ?? timelineElapsedAtBoundary(startSnapshot, records, previousPhysicalStep));
  const endElapsed = completed && boundary.key === 'pll' && Number.isFinite(stopElapsed)
    ? Math.max(startElapsed ?? 0, stopElapsed)
    : clampElapsed(timelineElapsedAtBoundary(endSnapshot, records, physicalEndStep));
  const boundedEndElapsed = Number.isFinite(endElapsed) ? Math.max(startElapsed ?? 0, endElapsed) : null;
  const isOpStage = boundary.key === 'oll' || boundary.key === 'pll';
  // Before an O/P formula starts, top-layer AUF turns belong to observation.
  // Once the first effective non-top-layer turn starts, later U turns stay in execution.
  const firstExecutionRecord = isOpStage
    ? effectiveRecords.find((record) => parseMoveToken(record.move).face !== topFace)
    : effectiveRecords[0];
  const effectiveFirstStep = firstExecutionRecord?.step ?? null;
  const rawFirstMoveElapsed = effectiveFirstStep == null ? null : elapsedAtSolveStep(records, effectiveFirstStep);
  const firstMoveElapsed = Number.isFinite(rawFirstMoveElapsed) ? Math.max(startElapsed ?? 0, Math.min(boundedEndElapsed ?? Infinity, rawFirstMoveElapsed)) : null;
  const durationMs = completed && Number.isFinite(startElapsed) && Number.isFinite(boundedEndElapsed)
    ? Math.max(0, boundedEndElapsed - startElapsed)
    : null;
  const inSolveObservationMs = completed && Number.isFinite(startElapsed) && Number.isFinite(firstMoveElapsed)
    ? Math.min(durationMs, Math.max(0, firstMoveElapsed - startElapsed))
    : (completed && (turns === 0 || isOpStage) ? durationMs : null);
  const storedCross = solve?.cfopStages?.find((stage) => stage.key === 'cross' || stage.label === 'C');
  const inspectionDurationMs = optionalFiniteNumber(solve?.inspectionDurationMs)
    ?? (Number(storedCross?.analysisVersion) >= 6 ? optionalFiniteNumber(storedCross?.observationMs) : null);
  const observationMs = boundary.key === 'cross'
    ? (inspectionDurationMs != null ? Math.max(0, inspectionDurationMs) : (solve?.inspectionEnabled === false ? 0 : null))
    : inSolveObservationMs;
  const tps = durationMs > 0 ? Math.round((turns / (durationMs / 1000)) * 100) / 100 : null;
  const stateTransitionObserved = completed && Boolean(
    startSnapshot?.facelets
    && endSnapshot?.facelets
    && startSnapshot.facelets !== endSnapshot.facelets
  );
  const unobservedTurns = stateTransitionObserved && physicalTurns === 0;
  return {
    key: boundary.key,
    label: boundary.label,
    name: boundary.name,
    completed,
    completedAt: completed ? endStep : null,
    startStep: completed && turns > 0 ? previousLogicalStep + 1 : null,
    endStep: completed ? endStep : null,
    turns,
    physicalCompletedAt,
    physicalStartStep,
    physicalEndStep: completed ? physicalEndStep : null,
    physicalTurns,
    stateTransitionObserved,
    unobservedTurns,
    completionSource: endSnapshot?.source || '',
    includedInCross: boundary.includedInCross === true,
    timingInterpolated: boundary.timingInterpolated === true || endSnapshot?.timingInterpolated === true,
    skipped: boundary.skipped === true && !unobservedTurns,
    skipAdjustment: boundary.skipAdjustment || '',
    durationMs,
    executionMs: boundary.key === 'cross' ? durationMs
      : (Number.isFinite(durationMs) && Number.isFinite(observationMs) ? durationMs - observationMs : null),
    wastedPhysicalTurns: Math.max(0, physicalTurns - effectiveRecords.length),
    tps,
    startedAtElapsedMs: completed ? startElapsed : null,
    firstMoveElapsedMs: firstMoveElapsed,
    completedAtElapsedMs: completed ? boundedEndElapsed : null,
    observationMs,
    startedAtTimestampMs: completed ? stageBoundaryTimestamp(startElapsed, startSnapshot, records, previousPhysicalStep, solve) : null,
    firstMoveTimestampMs: effectiveFirstStep == null ? null : timestampAtSolveStep(records, effectiveFirstStep, solve),
    completedAtTimestampMs: completed ? stageBoundaryTimestamp(boundedEndElapsed, endSnapshot, records, physicalEndStep, solve) : null,
    startedAtIsoTime: completed ? stageBoundaryIsoTime(startElapsed, startSnapshot, records, previousPhysicalStep, solve) : '',
    firstMoveIsoTime: effectiveFirstStep == null ? '' : isoTimeAtSolveStep(records, effectiveFirstStep, solve),
    completedAtIsoTime: completed ? stageBoundaryIsoTime(boundedEndElapsed, endSnapshot, records, physicalEndStep, solve) : '',
  };
}

// Stage boundaries come from observed states. Loop detection replays physical
// moves independently: delayed correction packets must not break an identity loop.
export function effectiveStageMoveRecords(snapshots, records) {
  if (snapshots.length < 2) return [];
  const startStep = snapshots[0].step;
  const endStep = snapshots.at(-1).step;
  let facelets = snapshots[0].facelets;
  const path = [{ facelets, record: null }];
  const positions = new Map([[facelets, 0]]);
  for (const record of records) {
    if (record.step <= startStep || record.step > endStep) continue;
    facelets = applyMoveToFacelets(facelets, record.move);
    const previousIndex = positions.get(facelets);
    if (previousIndex != null) {
      for (const removed of path.splice(previousIndex + 1)) positions.delete(removed.facelets);
    } else {
      positions.set(facelets, path.length);
      path.push({ facelets, record });
    }
  }
  return path.slice(1).map((entry) => entry.record);
}

function stageBoundaryTimestamp(elapsed, snapshot, records, step, solve) {
  const start = solveStartTimestampMs(solve, records);
  return Number.isFinite(start) && Number.isFinite(elapsed)
    ? start + elapsed : timelineTimestampAtBoundary(snapshot, records, step, solve);
}

function stageBoundaryIsoTime(elapsed, snapshot, records, step, solve) {
  const timestamp = stageBoundaryTimestamp(elapsed, snapshot, records, step, solve);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : timelineIsoTimeAtBoundary(snapshot, records, step, solve);
}

function timelineElapsedAtBoundary(snapshot, records, step) {
  const elapsedMs = optionalFiniteNumber(snapshot?.elapsedMs);
  return Number.isFinite(elapsedMs) ? elapsedMs : elapsedAtSolveStep(records, step);
}

function timelineTimestampAtBoundary(snapshot, records, step, solve) {
  const timestampMs = optionalFiniteNumber(snapshot?.timestampMs);
  return Number.isFinite(timestampMs) ? timestampMs : timestampAtSolveStep(records, step, solve);
}

function timelineIsoTimeAtBoundary(snapshot, records, step, solve) {
  if (typeof snapshot?.isoTime === 'string' && snapshot.isoTime) return snapshot.isoTime;
  return isoTimeAtSolveStep(records, step, solve);
}

function logicalStepForPhysicalStep(stepMap, physicalStep) {
  if (stepMap.has(physicalStep)) return stepMap.get(physicalStep);
  let step = physicalStep;
  while (step > 0) {
    step -= 1;
    if (stepMap.has(step)) return stepMap.get(step);
  }
  return 0;
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
  const explicit = optionalFiniteNumber(solve?.timerStartedAtMs ?? solve?.solveStartedAtMs);
  if (Number.isFinite(explicit)) return explicit;
  const firstRecordStart = optionalFiniteNumber(records[0]?.solveStartedAtMs);
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

function isFaceletSetSolved(faces, cells) {
  return cells.every(([face, row, col]) => faces?.[face]?.[row]?.[col]?.face === face);
}

function solveFinalSolvedByStatePacket(solve) {
  return solve?.bluetoothSolvedByStatePacket === true || solve?.finalSolvedByStatePacket === true;
}

function solveFinalSolvedEvidence(solve) {
  return solveFinalSolvedByStatePacket(solve) || solve?.timerSource === 'bluetooth';
}
