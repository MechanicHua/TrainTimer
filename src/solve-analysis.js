import { solveCfopAnalysis, cfopStagesForSave, cfopAnalysisVersion } from './cfop-analysis.js';
import { opEventsForSave, opAnalysisVersion } from './op-analysis.js';

export function analyzeSolve(solve) {
  const analysis = solveCfopAnalysis(solve);
  return {
    cfopStages: cfopStagesForSave(solve, analysis),
    opEvents: opEventsForSave(solve, analysis),
    cfopAnalysisVersion, opAnalysisVersion,
    analysisSummary: { bottomFace: analysis.bottomFace || '',
      bottomFaceStatus: analysis.bottomFaceStatus || '',
      bottomFaceCandidates: analysis.bottomFaceCandidates || [], finalSolved: analysis.finalSolved },
    analysisStatus: 'complete', analysisRawRevision: solve.rawRevision || 0,
  };
}
