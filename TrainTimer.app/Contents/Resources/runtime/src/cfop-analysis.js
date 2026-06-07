import { applyMove, createSolvedCube, facesFromCube, isSolvedFaces, parseMoveToken, parseScramble } from './cube-state.js';
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
    { key: 'cross', label: 'C', name: cfopCrossStageName(completions.crossSolvedPairCount), completedAt: completions.cross },
    ...pairStages,
    { key: 'oll', label: 'O', name: 'OLL', completedAt: completions.oll },
    { key: 'pll', label: 'P', name: 'PLL', completedAt: completions.pll },
  ];
  let previousStep = 0;
  const stages = boundaries.map((boundary) => {
    const stage = cfopStageFromBoundary(boundary, detectionRecords, previousStep, solve);
    if (boundary.completedAt != null) previousStep = Math.max(previousStep, boundary.completedAt);
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

function cfopSnapshotsForSolve(solve, records) {
  try {
    const cube = createSolvedCube();
    for (const move of parseScramble(solve.scramble)) applyMove(cube, move);
    const snapshots = [{ step: 0, faces: facesFromCube(cube) }];
    for (let index = 0; index < records.length; index += 1) {
      applyMove(cube, parseMoveToken(records[index].move));
      snapshots.push({ step: index + 1, faces: facesFromCube(cube) });
    }
    return snapshots;
  } catch {
    return [];
  }
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
  completions.score = cfopCandidateScore(completions, lastStep);
  completions.confidence = cfopCandidateConfidence(completions);
  return completions;
}

function cfopCrossSolvedPairCount(completions, definition) {
  if (completions.cross == null || !completions.crossSnapshotFaces) return 0;
  return definition.pairSlots.filter((slot) => isFaceletSetSolved(completions.crossSnapshotFaces, slot.cells)).length;
}

function cfopCrossStageName(pairCount) {
  if (!Number.isInteger(pairCount) || pairCount <= 0) return 'Cross';
  return `${'x'.repeat(pairCount)}cross`;
}

function cfopCandidateScore(candidate, lastStep) {
  const progression = cfopCandidateProgression(candidate, lastStep);
  let score = 0;
  if (candidate.cross != null) score += 1000 + Math.max(0, lastStep - candidate.cross);
  score += candidate.pairs.size * 520;
  score += candidate.crossSolvedPairCount * 140;
  if (candidate.f2l != null) score += 4200 + Math.max(0, lastStep - candidate.f2l) * 4;
  if (candidate.oll != null) score += 2600 + Math.max(0, lastStep - candidate.oll) * 2;
  if (candidate.pll != null) score += 2200;
  score += candidate.crossStableSnapshots * 8;
  score += progression.nonFinalBoundaryCount * 180;
  score += progression.distinctBoundaryCount * 90;
  score += Math.min(800, progression.phaseSpan * 8);
  score -= progression.finalCollapsedBoundaryCount * 260;
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

function cfopStageFromBoundary(boundary, records, previousStep, solve = null) {
  const completed = boundary.completedAt != null;
  const endStep = completed ? Math.max(previousStep, boundary.completedAt) : previousStep;
  const turns = completed ? Math.max(0, endStep - previousStep) : 0;
  const startElapsed = elapsedAtSolveStep(records, previousStep);
  const endElapsed = elapsedAtSolveStep(records, endStep);
  const firstMoveStep = completed && turns > 0 ? previousStep + 1 : null;
  const firstMoveElapsed = firstMoveStep == null ? null : elapsedAtSolveStep(records, firstMoveStep);
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
    completedAt: boundary.completedAt,
    startStep: completed && turns > 0 ? previousStep + 1 : null,
    endStep: completed ? endStep : null,
    turns,
    durationMs,
    tps,
    startedAtElapsedMs: completed ? startElapsed : null,
    firstMoveElapsedMs: firstMoveElapsed,
    completedAtElapsedMs: completed ? endElapsed : null,
    observationMs,
    startedAtTimestampMs: completed ? timestampAtSolveStep(records, previousStep, solve) : null,
    firstMoveTimestampMs: firstMoveStep == null ? null : timestampAtSolveStep(records, firstMoveStep, solve),
    completedAtTimestampMs: completed ? timestampAtSolveStep(records, endStep, solve) : null,
    startedAtIsoTime: completed ? isoTimeAtSolveStep(records, previousStep, solve) : '',
    firstMoveIsoTime: firstMoveStep == null ? '' : isoTimeAtSolveStep(records, firstMoveStep, solve),
    completedAtIsoTime: completed ? isoTimeAtSolveStep(records, endStep, solve) : '',
  };
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
