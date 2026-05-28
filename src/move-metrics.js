const faceTurnPattern = /^([UDRLFB])(2|')?$/;

export function countMoveSteps(moves) {
  return logicalMoveSequence(moves).length;
}

export function logicalMoveSequence(moves) {
  return logicalMoveRecordsFromMoves(moves).map((record) => record.move);
}

export function logicalMoveRecordsFromMoves(moves) {
  const entries = Array.isArray(moves)
    ? moves.map((move, index) => ({ step: index + 1, move }))
    : [];
  return logicalMoveRecords(entries);
}

export function logicalMoveRecords(entries) {
  const output = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const normalized = normalizedMove(entry?.move ?? entry);
    if (!normalized) continue;
    const previous = output.at(-1);
    if (canMergeAsHalfTurn(previous?.move, normalized)) {
      output[output.length - 1] = mergeMoveRecords(previous, entry, `${normalized.face}2`);
      continue;
    }
    output.push(moveRecordFromEntry(entry, normalized.token));
  }
  return output.map((record, index) => ({ ...record, step: index + 1 }));
}

function normalizedMove(value) {
  const token = String(value || '').trim();
  const match = token.match(faceTurnPattern);
  if (!match) return null;
  return {
    token,
    face: match[1],
    suffix: match[2] || '',
  };
}

function canMergeAsHalfTurn(leftMove, rightMove) {
  const left = normalizedMove(leftMove);
  if (!left || !rightMove) return false;
  return left.face === rightMove.face
    && left.suffix !== '2'
    && rightMove.suffix !== '2'
    && left.suffix === rightMove.suffix;
}

function moveRecordFromEntry(entry, move) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    ...base,
    move,
  };
}

function mergeMoveRecords(previous, entry, move) {
  const base = entry && typeof entry === 'object' ? entry : {};
  return {
    ...previous,
    ...base,
    move,
    rawMoves: [
      ...rawMovesForRecord(previous),
      String(entry?.move ?? '').trim(),
    ].filter(Boolean),
  };
}

function rawMovesForRecord(record) {
  return Array.isArray(record?.rawMoves) && record.rawMoves.length > 0
    ? record.rawMoves
    : [String(record?.move || '').trim()].filter(Boolean);
}
