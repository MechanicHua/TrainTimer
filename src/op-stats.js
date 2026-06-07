import { opPdfAlgorithmForCase } from './op-pdf-algorithms.js';
import { opEventsForSave } from './op-analysis.js';
import { algorithmTrainerCases } from './algorithm-trainer-cases.js';

const kindOrder = { oll: 0, pll: 1 };
const caseOrder = new Map(algorithmTrainerCases
  .filter((item) => ['oll', 'pll'].includes(item.set))
  .map((item, index) => [`${item.set}:${item.id}`, index]));

export function summarizeOpStats(solves) {
  const buckets = new Map();
  let totalEvents = 0;
  const byKind = { oll: 0, pll: 0 };

  for (const solve of Array.isArray(solves) ? solves : []) {
    for (const event of opEventsForStatsSolve(solve)) {
      if (!['oll', 'pll'].includes(event?.kind) || !event.caseId) continue;
      totalEvents += 1;
      byKind[event.kind] += 1;
      const key = `${event.kind}:${event.caseId}`;
      const bucket = buckets.get(key) || createCaseBucket(event);
      addOpEventToBucket(bucket, event);
      buckets.set(key, bucket);
    }
  }

  const cases = [...buckets.values()]
    .map(finalizeCaseBucket)
    .sort(compareOpCaseStats);

  return {
    totalEvents,
    byKind,
    cases,
  };
}

export function opCaseSamplesForSolves(solves, kind, caseId) {
  const targetKind = String(kind || '').toLowerCase();
  const targetCaseId = String(caseId || '');
  if (!['oll', 'pll'].includes(targetKind) || !targetCaseId) return [];

  const samples = [];
  for (const solve of Array.isArray(solves) ? solves : []) {
    const solveId = String(solve?.id || '');
    for (const event of opEventsForStatsSolve(solve)) {
      if (event?.kind !== targetKind || String(event.caseId || '') !== targetCaseId) continue;
      samples.push(opCaseSampleFromEvent(solve, event, solveId));
    }
  }

  return samples.sort(compareOpCaseSamples);
}

function opEventsForStatsSolve(solve) {
  if (Array.isArray(solve?.opEvents) && solve.opEvents.length > 0) return solve.opEvents;
  try {
    return opEventsForSave(solve);
  } catch {
    return [];
  }
}

function createCaseBucket(event) {
  const pdfFormula = opPdfAlgorithmForCase(event.kind, event.caseId);
  return {
    kind: event.kind,
    caseId: event.caseId,
    name: event.name || event.caseId,
    group: event.group || '',
    pdfLabel: event.pdfLabel || pdfFormula?.pdfLabel || '',
    count: 0,
    durationValues: [],
    observationValues: [],
    tpsValues: [],
    turnValues: [],
    formulaCounts: new Map(),
    acceptedFormulaCounts: new Map(),
  };
}

function addOpEventToBucket(bucket, event) {
  bucket.count += 1;
  pushFinite(bucket.durationValues, event.durationMs);
  pushFinite(bucket.observationValues, event.observationMs);
  pushFinite(bucket.tpsValues, event.tps);
  pushFinite(bucket.turnValues, event.turns);
  const formula = Array.isArray(event.moves) ? event.moves.join(' ').trim() : '';
  if (formula) {
    bucket.formulaCounts.set(formula, (bucket.formulaCounts.get(formula) || 0) + 1);
    if (event.formulaAccepted === true) {
      bucket.acceptedFormulaCounts.set(formula, (bucket.acceptedFormulaCounts.get(formula) || 0) + 1);
    }
  }
}

function opCaseSampleFromEvent(solve, event, solveId) {
  const moves = Array.isArray(event?.moves)
    ? event.moves.map((move) => String(move || '').trim()).filter(Boolean)
    : [];
  const completedAtTimestampMs = optionalNumber(event?.completedAtTimestampMs)
    ?? optionalNumber(event?.moveTimings?.at?.(-1)?.timestampMs);
  return {
    solveId,
    createdAt: String(solve?.createdAt || ''),
    solveDurationMs: optionalNumber(solve?.durationMs),
    kind: event.kind,
    caseId: event.caseId,
    name: event.name || event.caseId,
    pdfLabel: event.pdfLabel || opPdfAlgorithmForCase(event.kind, event.caseId)?.pdfLabel || '',
    startStep: optionalNumber(event.startStep),
    endStep: optionalNumber(event.endStep),
    durationMs: optionalNumber(event.durationMs),
    observationMs: optionalNumber(event.observationMs),
    tps: optionalNumber(event.tps),
    turns: optionalNumber(event.turns),
    moves,
    algorithm: moves.join(' '),
    formulaAccepted: event.formulaAccepted === true,
    formulaReason: String(event.formulaReason || ''),
    completedAtTimestampMs,
  };
}

function finalizeCaseBucket(bucket) {
  return {
    kind: bucket.kind,
    caseId: bucket.caseId,
    name: bucket.name,
    group: bucket.group,
    pdfLabel: bucket.pdfLabel,
    count: bucket.count,
    averageDurationMs: averageOrNull(bucket.durationValues),
    bestDurationMs: bucket.durationValues.length > 0 ? Math.min(...bucket.durationValues) : null,
    worstDurationMs: bucket.durationValues.length > 0 ? Math.max(...bucket.durationValues) : null,
    averageObservationMs: averageOrNull(bucket.observationValues),
    averageTps: averageOrNull(bucket.tpsValues),
    averageTurns: averageOrNull(bucket.turnValues),
    formulaCount: bucket.formulaCounts.size,
    acceptedFormulaCount: bucket.acceptedFormulaCounts.size,
    mostUsedFormula: mostUsedEntry(bucket.formulaCounts),
    mostUsedAcceptedFormula: mostUsedEntry(bucket.acceptedFormulaCounts),
  };
}

function compareOpCaseStats(left, right) {
  return right.count - left.count
    || (kindOrder[left.kind] ?? 99) - (kindOrder[right.kind] ?? 99)
    || opCaseOrder(left) - opCaseOrder(right)
    || String(left.name).localeCompare(String(right.name), 'en');
}

function compareOpCaseSamples(left, right) {
  return sampleSortTime(right) - sampleSortTime(left)
    || Number(right.endStep ?? 0) - Number(left.endStep ?? 0)
    || String(right.solveId).localeCompare(String(left.solveId));
}

function sampleSortTime(sample) {
  const completed = optionalNumber(sample?.completedAtTimestampMs);
  if (completed != null) return completed;
  const created = new Date(sample?.createdAt || '').getTime();
  return Number.isFinite(created) ? created : 0;
}

function opCaseOrder(item) {
  return caseOrder.get(`${item.kind}:${item.caseId}`) ?? Number.POSITIVE_INFINITY;
}

function pushFinite(values, value) {
  const number = Number(value);
  if (Number.isFinite(number)) values.push(Math.max(0, number));
}

function averageOrNull(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function optionalNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mostUsedEntry(counts) {
  let best = null;
  for (const [algorithm, count] of counts.entries()) {
    if (!best || count > best.count || (count === best.count && algorithm.length < best.algorithm.length)) {
      best = { algorithm, count };
    }
  }
  return best;
}
