import {
  applyMoveToFacelets,
  createSolvedCube,
  facesFromFacelets,
  faceletsFromScramble,
  isSolvedFaces,
  parseMoveToken,
} from './cube-state.js';
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
      elapsedMs: Number.isFinite(Number(entry.elapsedMs)) ? Number(entry.elapsedMs) : null,
      timestampMs: Number.isFinite(Number(entry.timestampMs)) ? Number(entry.timestampMs) : null,
      isoTime: typeof entry.isoTime === 'string' ? entry.isoTime : '',
      solveStartedAtMs: Number.isFinite(Number(entry.solveStartedAtMs)) ? Number(entry.solveStartedAtMs) : null,
      solveStartedAtIsoTime: typeof entry.solveStartedAtIsoTime === 'string' ? entry.solveStartedAtIsoTime : '',
    }))
    : moves.map((move, index) => ({ step: index + 1, move, elapsedMs: null }));
  return records
    .map(physicalMoveRecord)
    .filter(Boolean)
    .map((record, index) => ({ ...record, step: index + 1 }));
}

function physicalMoveRecord(record) {
  try {
    const move = parseMoveToken(record?.move);
    return { ...record, move: `${move.face}${move.suffix || ''}` };
  } catch {
    return null;
  }
}

export function solveCfopAnalysis(solve) {
  const records = solveMoveRecords(solve);
  const detectionRecords = solvePhysicalMoveRecords(solve);
  const physicalStepToLogicalStep = logicalStepMapForPhysicalRecords(detectionRecords);
  const stageTemplate = cfopStageTemplate();
  const finalSolvedByStatePacket = solveFinalSolvedByStatePacket(solve);
  if (!solve?.scramble || (detectionRecords.length === 0 && !finalSolvedByStatePacket) || (solve.scramblePuzzle || 'three') !== 'three') {
    return { records, detectionRecords, stages: stageTemplate, finalSolved: false };
  }

  const snapshots = cfopSnapshotsForSolve(solve, detectionRecords);
  if (snapshots.length === 0) {
    return { records, detectionRecords, stages: stageTemplate, finalSolved: false };
  }

  const candidates = [...cfopDefinitions.values()]
    .map((definition, index) => analyzeCfopDefinition(definition, snapshots, index, finalSolvedByStatePacket))
    .sort(compareCfopCandidates);
  const best = candidates[0];
  const completions = best || {
    cross: null,
    bottomFace: '',
    pairs: new Map(),
    crossSnapshotFaces: null,
    f2l: null,
    oll: null,
    pll: null,
    confidence: '',
    crossSolvedPairCount: 0,
    simultaneousCrossPairCount: 0,
  };
  const cfopDefinition = best?.definition || null;

  const pairSlots = cfopDefinition?.pairSlots || cfopFallbackPairSlots;
  const orderedPairs = pairSlots
    .map((slot) => ({ ...slot, completedAt: completions.pairs.get(slot.key) ?? null }))
    .sort((left, right) => {
      const leftStep = left.completedAt ?? Number.POSITIVE_INFINITY;
      const rightStep = right.completedAt ?? Number.POSITIVE_INFINITY;
      return leftStep - rightStep || pairSlots.findIndex((slot) => slot.key === left.key) - pairSlots.findIndex((slot) => slot.key === right.key);
    });
  const pairStages = orderedPairs.map((slot, index) => ({
    key: slot.key,
    label: `F${index + 1}`,
    name: slot.name,
    completedAt: slot.completedAt,
  }));

  const boundaries = [
    {
      key: 'cross',
      label: 'C',
      name: cfopCrossStageName(completions.crossSolvedPairCount, completions.cross, completions.simultaneousCrossPairCount),
      completedAt: completions.cross,
    },
    ...pairStages,
    { key: 'oll', label: 'O', name: 'OLL', completedAt: completions.oll },
    { key: 'pll', label: 'P', name: 'PLL', completedAt: completions.pll },
  ];
  let previousBoundary = { physicalStep: 0, logicalStep: 0 };
  const stages = boundaries.map((boundary) => {
    const stage = cfopStageFromBoundary(boundary, detectionRecords, previousBoundary, solve, physicalStepToLogicalStep);
    if (boundary.completedAt != null) {
      previousBoundary = {
        physicalStep: stage.physicalEndStep ?? previousBoundary.physicalStep,
        logicalStep: stage.endStep ?? previousBoundary.logicalStep,
      };
    }
    return stage;
  });

  return {
    records,
    detectionRecords,
    stages,
    finalSolved: finalSolvedByStatePacket || completions.pll != null,
    bottomFace: completions.cross != null ? completions.bottomFace : '',
    confidence: completions.confidence,
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

export function cfopStagesForSave(solve) {
  const analysis = solveCfopAnalysis(solve);
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
    const correctionByStep = stateCorrectionsByStep(solve?.bluetoothStateCorrections, records.length);
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

function cfopSnapshotsForSolve(solve, records) {
  try {
    const faceletSnapshots = solveFaceletSnapshotsForAnalysis(solve, records);
    return faceletSnapshots.map((snapshot) => ({
      step: snapshot.step,
      faces: facesFromFacelets(snapshot.facelets),
      correction: snapshot.correction || null,
    }));
  } catch {
    return [];
  }
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

function analyzeCfopDefinition(definition, snapshots, order, finalSolvedByStatePacket = false) {
  const completions = {
    definition,
    cross: null,
    bottomFace: definition.bottomFace,
    pairs: new Map(),
    crossSnapshotFaces: null,
    f2l: null,
    oll: null,
    pll: null,
    crossStableSnapshots: 0,
    crossSolvedPairCount: 0,
    simultaneousCrossPairCount: 0,
    order,
  };

  for (const snapshot of snapshots) {
    const faces = snapshot.faces;
    const crossSolved = isFaceletSetSolved(faces, definition.crossCells);
    if (completions.cross == null && crossSolved) {
      completions.cross = snapshot.step;
      completions.crossSnapshotFaces = faces;
    }
    if (completions.cross == null || !crossSolved) continue;

    completions.crossStableSnapshots += 1;
    for (const slot of definition.pairSlots) {
      if (!completions.pairs.has(slot.key) && isFaceletSetSolved(faces, slot.cells)) {
        completions.pairs.set(slot.key, snapshot.step);
      }
    }
    if (completions.f2l == null && completions.pairs.size === definition.pairSlots.length) completions.f2l = snapshot.step;
    if (completions.f2l == null) continue;

    if (completions.oll == null && isFaceletSetSolved(faces, definition.ollCells)) completions.oll = snapshot.step;
    if (completions.oll == null) continue;

    if (completions.pll == null && isSolvedFaces(faces)) completions.pll = snapshot.step;
  }

  const lastStep = snapshots[snapshots.length - 1]?.step || 0;
  if (finalSolvedByStatePacket && completions.oll != null && completions.pll == null) {
    completions.pll = Math.max(completions.oll, lastStep);
  }
  completions.crossSolvedPairCount = cfopCrossSolvedPairCount(completions, definition);
  completions.simultaneousCrossPairCount = cfopSimultaneousCrossPairCount(completions, definition);
  completions.score = cfopCandidateScore(completions, lastStep);
  completions.confidence = cfopCandidateConfidence(completions);
  return completions;
}

function cfopCrossSolvedPairCount(completions, definition) {
  if (completions.cross == null || !completions.crossSnapshotFaces) return 0;
  return definition.pairSlots.filter((slot) => isFaceletSetSolved(completions.crossSnapshotFaces, slot.cells)).length;
}

function cfopSimultaneousCrossPairCount(completions, definition) {
  if (completions.cross == null) return 0;
  return definition.pairSlots.filter((slot) => completions.pairs.get(slot.key) === completions.cross).length;
}

function cfopCrossStageName(pairCount, crossStep = null, simultaneousPairCount = pairCount) {
  if (!Number.isInteger(pairCount) || pairCount <= 0) return 'Cross';
  if (pairCount >= 2 && simultaneousPairCount >= 2 && Number.isFinite(crossStep) && crossStep > 20) return 'Cross';
  return `${'x'.repeat(pairCount)}cross`;
}

function cfopCandidateScore(candidate, lastStep) {
  const progression = cfopCandidateProgression(candidate, lastStep);
  const simultaneousPairPenalty = Math.max(0, (candidate.simultaneousCrossPairCount || 0) - 1)
    * Math.min(1800, Math.max(0, candidate.cross || 0) * 45);
  let score = 0;
  if (candidate.cross != null) score += 1000 + Math.max(0, lastStep - candidate.cross);
  score += candidate.pairs.size * 520;
  score += candidate.crossSolvedPairCount * 60;
  if (candidate.f2l != null) score += 4200 + Math.max(0, lastStep - candidate.f2l) * 4;
  if (candidate.oll != null) score += 2600 + Math.max(0, lastStep - candidate.oll) * 2;
  if (candidate.pll != null) score += 2200;
  score += candidate.crossStableSnapshots * 8;
  score += progression.nonFinalBoundaryCount * 180;
  score += progression.distinctBoundaryCount * 90;
  score += Math.min(800, progression.phaseSpan * 8);
  score -= progression.finalCollapsedBoundaryCount * 260;
  score -= simultaneousPairPenalty;
  return score;
}

function cfopCandidateProgression(candidate, lastStep) {
  const boundarySteps = [
    candidate.cross,
    ...candidate.definition.pairSlots.map((slot) => candidate.pairs.get(slot.key) ?? null),
    candidate.oll,
    candidate.pll,
  ].filter((step) => step != null);
  const nonFinalBoundaryCount = boundarySteps.filter((step) => step < lastStep).length;
  const finalCollapsedBoundaryCount = boundarySteps
    .slice(0, -1)
    .filter((step) => step === lastStep)
    .length;
  const phaseSpan = candidate.cross != null && candidate.pll != null
    ? Math.max(0, candidate.pll - candidate.cross)
    : 0;

  return {
    nonFinalBoundaryCount,
    finalCollapsedBoundaryCount,
    distinctBoundaryCount: new Set(boundarySteps).size,
    phaseSpan,
  };
}

function compareCfopCandidates(left, right) {
  return right.score - left.score
    || compareCfopStep(left.f2l, right.f2l)
    || compareCfopStep(left.oll, right.oll)
    || compareCfopStep(left.cross, right.cross)
    || left.order - right.order;
}

function compareCfopStep(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function cfopCandidateConfidence(candidate) {
  if (candidate.pll != null && candidate.oll != null && candidate.f2l != null) return '高';
  if (candidate.f2l != null) return '中';
  if (candidate.cross != null || candidate.pairs.size > 0) return '低';
  return '';
}

function cfopStageFromBoundary(boundary, records, previousBoundary, solve = null, physicalStepToLogicalStep = new Map([[0, 0]])) {
  const previousPhysicalStep = Math.max(0, Number(previousBoundary?.physicalStep) || 0);
  const previousLogicalStep = Math.max(0, Number(previousBoundary?.logicalStep) || 0);
  const completed = boundary.completedAt != null;
  const physicalCompletedAt = completed ? Math.max(0, Math.round(Number(boundary.completedAt))) : null;
  const physicalEndStep = completed ? Math.max(previousPhysicalStep, physicalCompletedAt) : previousPhysicalStep;
  const endStep = completed ? logicalStepForPhysicalStep(physicalStepToLogicalStep, physicalEndStep) : previousLogicalStep;
  const turns = completed ? Math.max(0, endStep - previousLogicalStep) : 0;
  const physicalTurns = completed ? Math.max(0, physicalEndStep - previousPhysicalStep) : 0;
  const physicalStartStep = completed && physicalTurns > 0 ? previousPhysicalStep + 1 : null;
  const startElapsed = elapsedAtSolveStep(records, previousPhysicalStep);
  const endElapsed = elapsedAtSolveStep(records, physicalEndStep);
  const firstMoveElapsed = physicalStartStep == null ? null : elapsedAtSolveStep(records, physicalStartStep);
  const durationMs = completed && Number.isFinite(startElapsed) && Number.isFinite(endElapsed)
    ? Math.max(0, endElapsed - startElapsed)
    : null;
  const observationMs = completed && Number.isFinite(startElapsed) && Number.isFinite(firstMoveElapsed)
    ? Math.max(0, firstMoveElapsed - startElapsed)
    : null;
  const tps = durationMs > 0 ? Math.round((turns / (durationMs / 1000)) * 100) / 100 : null;
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
    durationMs,
    tps,
    startedAtElapsedMs: completed ? startElapsed : null,
    firstMoveElapsedMs: firstMoveElapsed,
    completedAtElapsedMs: completed ? endElapsed : null,
    observationMs,
    startedAtTimestampMs: completed ? timestampAtSolveStep(records, previousPhysicalStep, solve) : null,
    firstMoveTimestampMs: physicalStartStep == null ? null : timestampAtSolveStep(records, physicalStartStep, solve),
    completedAtTimestampMs: completed ? timestampAtSolveStep(records, physicalEndStep, solve) : null,
    startedAtIsoTime: completed ? isoTimeAtSolveStep(records, previousPhysicalStep, solve) : '',
    firstMoveIsoTime: physicalStartStep == null ? '' : isoTimeAtSolveStep(records, physicalStartStep, solve),
    completedAtIsoTime: completed ? isoTimeAtSolveStep(records, physicalEndStep, solve) : '',
  };
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

function isFaceletSetSolved(faces, cells) {
  return cells.every(([face, row, col]) => faces?.[face]?.[row]?.[col]?.face === face);
}

function solveFinalSolvedByStatePacket(solve) {
  return solve?.bluetoothSolvedByStatePacket === true || solve?.finalSolvedByStatePacket === true;
}
