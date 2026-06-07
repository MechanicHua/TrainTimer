import { opPdfAlgorithms } from './op-pdf-algorithms.js';
import { applyMoveToFacelets, faceletsFromScramble, parseScramble } from './cube-state.js';
import { evaluateOpFormulaCandidate, opEventsForSave, recognizeOpCase } from './op-analysis.js';
import { algorithmTrainerCases } from './algorithm-trainer-cases.js';

const supportedKinds = new Set(['oll', 'pll']);
const kindOrder = { oll: 0, pll: 1 };
const caseOrder = new Map(algorithmTrainerCases
  .filter((item) => supportedKinds.has(item.set))
  .map((item, index) => [`${item.set}:${item.id}`, index]));

export function buildOpFormulaLibrary(solves = []) {
  const formulas = [];
  const byKey = new Map();
  let pdfFormulaCount = 0;
  let userFormulaCount = 0;

  for (const item of opPdfAlgorithms) {
    const formula = formulaEntryFromPdf(item);
    if (!formula) continue;
    const key = formulaDedupKey(formula);
    if (byKey.has(key)) continue;
    byKey.set(key, formula);
    formulas.push(formula);
    pdfFormulaCount += 1;
  }

  for (const solve of Array.isArray(solves) ? solves : []) {
    for (const event of opEventsForFormulaLibrarySolve(solve)) {
      const formula = formulaEntryFromEvent(event, solve);
      if (!formula) continue;
      const key = formulaDedupKey(formula);
      const existing = byKey.get(key);
      if (existing) {
        addFormulaObservation(existing, formula);
        continue;
      }
      byKey.set(key, formula);
      formulas.push(formula);
      userFormulaCount += 1;
    }
  }

  return {
    formulas,
    cases: formulaCases(formulas),
    pdfFormulaCount,
    userFormulaCount,
    totalFormulaCount: formulas.length,
  };
}

export function formulasForOpCase(library, kind, caseId) {
  return (library?.formulas || [])
    .filter((formula) => formula.kind === kind && formula.caseId === caseId);
}

function formulaEntryFromPdf(item) {
  const moves = normalizeFormulaMoves(item.algorithm);
  if (!moves.length) return null;
  return {
    id: `pdf:${item.kind}:${item.caseId}:${item.pdfLabel}`,
    source: 'pdf',
    kind: item.kind,
    caseId: item.caseId,
    pdfLabel: item.pdfLabel,
    page: item.page,
    algorithm: moves.join(' '),
    moves,
    moveCount: moves.length,
    confidence: 'verified',
    occurrences: 1,
    userOccurrences: 0,
    durationSampleCount: 0,
    observationSampleCount: 0,
    tpsSampleCount: 0,
  };
}

function opEventsForFormulaLibrarySolve(solve) {
  if (Array.isArray(solve?.opEvents) && solve.opEvents.length > 0) return solve.opEvents;
  try {
    return opEventsForSave(solve);
  } catch {
    return [];
  }
}

function formulaEntryFromEvent(event, solve) {
  const kind = String(event?.kind || '').toLowerCase();
  const caseId = String(event?.caseId || '');
  if (!supportedKinds.has(kind) || !caseId || event?.formulaAccepted !== true) return null;
  const observedMoves = normalizeFormulaMoves(event.moves);
  if (!observedMoves.length) return null;
  const startFacelets = startFaceletsForEvent(event, solve);
  if (!startFacelets) return null;
  const validation = evaluateOpFormulaCandidate({
    kind,
    caseId,
    startFacelets,
    moves: observedMoves,
    maxMoves: kind === 'oll' ? 24 : 30,
    moveTimings: event.moveTimings,
  });
  if (!validation.accepted) return null;
  const pdfMoves = pdfCanonicalMovesForObservedFormula(kind, caseId, observedMoves);
  if (!pdfMoves && isCompositeOpFormula(kind, caseId, observedMoves, startFacelets)) return null;
  const moves = pdfMoves || observedMoves;

  return {
    id: `user:${kind}:${caseId}:${moves.join(' ')}`,
    source: 'user',
    kind,
    caseId,
    pdfLabel: '',
    page: null,
    algorithm: moves.join(' '),
    moves,
    moveCount: moves.length,
    confidence: event.confidence || 'verified',
    occurrences: 1,
    userOccurrences: 1,
    firstSeenAt: solve?.createdAt || event.completedAtIsoTime || '',
    lastSeenAt: solve?.createdAt || event.completedAtIsoTime || '',
    averageDurationMs: optionalNumber(event.durationMs),
    averageObservationMs: optionalNumber(event.observationMs),
    averageTps: optionalNumber(event.tps),
    durationSampleCount: optionalNumber(event.durationMs) == null ? 0 : 1,
    observationSampleCount: optionalNumber(event.observationMs) == null ? 0 : 1,
    tpsSampleCount: optionalNumber(event.tps) == null ? 0 : 1,
  };
}

function pdfCanonicalMovesForObservedFormula(kind, caseId, observedMoves) {
  const pdfFormula = opPdfAlgorithms.find((item) => item.kind === kind && item.caseId === caseId);
  if (!pdfFormula) return null;
  const pdfMoves = normalizeFormulaMoves(pdfFormula.algorithm);
  if (pdfMoves.length === 0) return null;
  if (movesEqual(observedMoves, pdfMoves)) return pdfMoves;
  for (const candidate of outerAufStrippedMoveCandidates(observedMoves)) {
    if (movesEqual(candidate, pdfMoves)) return pdfMoves;
  }
  return null;
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

function isCompositeOpFormula(kind, caseId, moves, startFacelets) {
  let facelets = startFacelets;
  for (let index = 0; index < moves.length - 1; index += 1) {
    try {
      facelets = applyMoveToFacelets(facelets, moves[index]);
    } catch {
      return false;
    }

    const intermediate = recognizeOpCase(facelets, kind);
    if (!intermediate || intermediate.confidence !== 'unique' || intermediate.caseId === caseId) continue;

    const suffix = moves.slice(index + 1);
    const suffixValidation = evaluateOpFormulaCandidate({
      kind,
      caseId: intermediate.caseId,
      startFacelets: facelets,
      moves: suffix,
      maxMoves: kind === 'oll' ? 24 : 30,
    });
    if (suffixValidation.accepted) return true;
  }

  return false;
}

function startFaceletsForEvent(event, solve) {
  const direct = String(event?.startFacelets || '').trim().toUpperCase();
  if (/^[URFDLB]{54}$/.test(direct)) return direct;

  const scramble = String(solve?.scramble || '').trim();
  if (!scramble || (solve?.scramblePuzzle || 'three') !== 'three') return '';

  const startStep = Number(event?.startStep);
  const movesBefore = solveMoves(solve).slice(0, Math.max(0, Number.isFinite(startStep) ? Math.round(startStep) - 1 : 0));
  try {
    let facelets = faceletsFromScramble(scramble);
    for (const move of movesBefore) facelets = applyMoveToFacelets(facelets, move);
    return facelets;
  } catch {
    return '';
  }
}

function solveMoves(solve) {
  const moveLog = Array.isArray(solve?.bluetoothMoveLog) ? solve.bluetoothMoveLog : [];
  if (moveLog.length > 0) return moveLog.map(moveFromEntry).filter(Boolean);
  if (Array.isArray(solve?.bluetoothMoves)) return solve.bluetoothMoves.map(moveFromEntry).filter(Boolean);
  return normalizeFormulaMoves(solve?.bluetoothMoves);
}

function moveFromEntry(entry) {
  const value = typeof entry === 'object' && entry ? entry.move : entry;
  return normalizeFormulaMoves([value])[0] || '';
}

function addFormulaObservation(target, observed) {
  target.userOccurrences = (target.userOccurrences || 0) + 1;
  target.occurrences = Math.max(target.occurrences || 0, 1) + 1;
  if (!target.firstSeenAt || (observed.firstSeenAt && observed.firstSeenAt < target.firstSeenAt)) target.firstSeenAt = observed.firstSeenAt;
  if (!target.lastSeenAt || (observed.lastSeenAt && observed.lastSeenAt > target.lastSeenAt)) target.lastSeenAt = observed.lastSeenAt;
  target.averageDurationMs = addAverageSample(target.averageDurationMs, target.durationSampleCount || 0, observed.averageDurationMs);
  if (observed.averageDurationMs != null) target.durationSampleCount = (target.durationSampleCount || 0) + 1;
  target.averageObservationMs = addAverageSample(target.averageObservationMs, target.observationSampleCount || 0, observed.averageObservationMs);
  if (observed.averageObservationMs != null) target.observationSampleCount = (target.observationSampleCount || 0) + 1;
  target.averageTps = addAverageSample(target.averageTps, target.tpsSampleCount || 0, observed.averageTps);
  if (observed.averageTps != null) target.tpsSampleCount = (target.tpsSampleCount || 0) + 1;
}

function formulaCases(formulas) {
  const cases = new Map();
  for (const formula of formulas) {
    const key = `${formula.kind}:${formula.caseId}`;
    const item = cases.get(key) || {
      kind: formula.kind,
      caseId: formula.caseId,
      pdfLabel: formula.pdfLabel || '',
      formulas: [],
      pdfFormulaCount: 0,
      userFormulaCount: 0,
    };
    item.formulas.push(formula);
    if (!item.pdfLabel && formula.pdfLabel) item.pdfLabel = formula.pdfLabel;
    if (formula.source === 'pdf') item.pdfFormulaCount += 1;
    if (formula.source === 'user') item.userFormulaCount += 1;
    cases.set(key, item);
  }

  return [...cases.values()].sort(compareFormulaCases);
}

function normalizeFormulaMoves(value) {
  try {
    const text = Array.isArray(value)
      ? value.join(' ')
      : String(value || '');
    return parseScramble(text).map((move) => `${move.face}${move.suffix || ''}`);
  } catch {
    return [];
  }
}

function formulaDedupKey(formula) {
  return `${formula.kind}:${formula.caseId}:${formula.moves.join(' ')}`;
}

function addAverageSample(currentAverage, currentCount, sample) {
  if (sample == null) return currentAverage ?? null;
  if (!Number.isFinite(currentAverage) || currentCount <= 0) return sample;
  return ((currentAverage * currentCount) + sample) / (currentCount + 1);
}

function compareFormulaCases(left, right) {
  return (kindOrder[left.kind] ?? 99) - (kindOrder[right.kind] ?? 99)
    || opCaseOrder(left) - opCaseOrder(right)
    || left.caseId.localeCompare(right.caseId);
}

function opCaseOrder(item) {
  return caseOrder.get(`${item.kind}:${item.caseId}`) ?? Number.POSITIVE_INFINITY;
}

function optionalNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
