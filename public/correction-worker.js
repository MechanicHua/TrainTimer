import { shortCorrectionMovesForRelativeFacelets, warmShortCorrectionSearch } from './cube-state.js';

self.onmessage = ({ data }) => {
  const startedAt = performance.now();
  try {
    const result = data.kind === 'warmup'
      ? { warmed: warmShortCorrectionSearch({ maxDepth: 4, maxMs: 30, maxNodes: 50000 }) }
      : { moves: shortCorrectionMovesForRelativeFacelets(data.facelets, {
        maxDepth: 4, maxMs: 4, maxNodes: 50000,
      }) };
    self.postMessage({ id: data.id, result: { ...result, durationMs: performance.now() - startedAt } });
  } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
