export function ganBluetoothMovesFromDecoded(decoded = {}, previousMoveCounter = null) {
  const latestMoves = normalizedMoveList(decoded.moves);
  const historyMoves = normalizedMoveList(decoded.historyMoves);
  if (historyMoves.length <= latestMoves.length) return latestMoves;

  const delta = ganBluetoothMoveCounterDelta(
    decoded.moveCounter,
    previousMoveCounter,
    decoded.counterModulo,
  );
  if (!Number.isInteger(delta) || delta <= latestMoves.length) return latestMoves;

  const replayCount = Math.min(delta, historyMoves.length);
  if (replayCount <= latestMoves.length) return latestMoves;
  return historyMoves.slice(0, replayCount).reverse();
}

export function ganBluetoothDecodedMoveCount(decoded = {}) {
  return Math.max(
    normalizedMoveList(decoded.moves).length,
    normalizedMoveList(decoded.historyMoves).length,
  );
}

export function ganBluetoothIsDuplicateMovePacket(decoded = {}, previousMoveCounter = null) {
  return Number.isInteger(decoded.moveCounter)
    && ganBluetoothDecodedMoveCount(decoded) > 0
    && decoded.moveCounter === previousMoveCounter;
}

export function ganBluetoothNextMoveCounter(previousMoveCounter, decoded = {}, parsedMoves = []) {
  if (!Number.isInteger(decoded.moveCounter)) return previousMoveCounter;
  if (ganBluetoothDecodedMoveCount(decoded) === 0) return previousMoveCounter;
  if (normalizedMoveList(parsedMoves).length === 0) return previousMoveCounter;
  return decoded.moveCounter;
}

export function ganBluetoothMoveCounterDelta(currentCounter, previousCounter, counterModulo = 256) {
  if (!Number.isInteger(currentCounter) || !Number.isInteger(previousCounter)) return null;
  const modulo = Number.isInteger(counterModulo) && counterModulo > 1 ? counterModulo : 256;
  return (currentCounter - previousCounter + modulo) % modulo;
}

function normalizedMoveList(moves) {
  return Array.isArray(moves) ? moves.map((move) => String(move || '').trim()).filter(Boolean) : [];
}
