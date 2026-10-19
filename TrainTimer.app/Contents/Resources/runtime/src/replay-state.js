import { solvePhysicalMoveRecords, solveFaceletSnapshotsForAnalysis } from './cfop-analysis.js';
import { logicalMoveRecords } from './move-metrics.js';

export function buildReplayFrames(solve) {
  const physical = solvePhysicalMoveRecords(solve);
  const records = logicalMoveRecords(physical.map((record, index) => ({ ...record, physicalStep: index + 1 })));
  const snapshots = solveFaceletSnapshotsForAnalysis(solve, physical);
  return { records, facelets: [snapshots[0]?.facelets || '',
    ...records.map((record) => snapshots[record.physicalStep]?.facelets || '')] };
}
