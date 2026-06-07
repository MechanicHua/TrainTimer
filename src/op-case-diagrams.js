import { opPdfAlgorithms } from './op-pdf-algorithms.js';
import { faceletsFromScramble, parseScramble } from './cube-state.js';
import { recognizeOpCase } from './op-analysis.js';
import { opPosterDiagramShapes } from './op-poster-diagram-shapes.js';

export const opCaseDiagrams = opPdfAlgorithms.map(opDiagramFromPdfAlgorithm);
const opCaseDiagramMap = new Map(opCaseDiagrams.map((diagram) => [opCaseDiagramKey(diagram.kind, diagram.caseId), diagram]));

export function opCaseDiagramForCase(kind, caseId) {
  return opCaseDiagramMap.get(opCaseDiagramKey(kind, caseId)) || null;
}

export function opCaseDiagramKey(kind, caseId) {
  return `${String(kind || '').toLowerCase()}:${String(caseId || '')}`;
}

function opDiagramFromPdfAlgorithm(item) {
  const setup = invertAlgorithm(item.algorithm);
  const facelets = faceletsFromScramble(setup);
  const recognition = recognizeOpCase(facelets, item.kind);
  return {
    kind: item.kind,
    caseId: item.caseId,
    name: recognition?.name || item.caseId,
    group: recognition?.group || '',
    pdfLabel: item.pdfLabel,
    page: item.page,
    algorithm: item.algorithm,
    setup,
    facelets,
    recognitionCaseId: recognition?.caseId || '',
    recognitionConfidence: recognition?.confidence || 'none',
    signature: recognition?.signature || '',
    poster: opPosterDiagramShapes[item.caseId] || null,
  };
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
