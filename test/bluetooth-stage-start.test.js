import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function declaration(name, nextName) {
  return source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${nextName}(`));
}

test('inspection first move starts the clock at receipt before UI work', () => {
  let now = 1000;
  const context = {
    performance: { now: () => now },
    Date,
    bluetoothMoves: [],
    activeInspectionUsed: true,
    inspectionStartedAt: 100,
    currentInspectionPenalty: () => 'ok',
    bluetoothCube3dMoveTargetsFromCurrentSolve: () => [],
    updateBluetoothSolvedFromMoves: () => false,
    renderTimer: () => { now += 80; },
  };
  for (const name of ['clearBluetoothNextSolveGestureCandidate', 'clearInspectionEntryAnimation',
    'clearInspectionTick', 'clearHoldTick', 'clearTimerTick', 'armBluetoothSolveTracking',
    'renderQuickActions', 'renderScramble', 'scheduleNextTimingTick', 'bumpBluetoothMovesVersion',
    'updateBluetooth3dMoves', 'scheduleBluetoothMovesRender']) context[name] = () => {};
  vm.runInNewContext(`${declaration('startTiming', 'tickTimer')}
    ${declaration('addBluetoothMoves', 'initializeBluetoothSolveCube')}
    startTiming({ receivedAt: 1000 });
    addBluetoothMoves(['R'], 'test', '', '', { receivedAt: 1000 });`, context);
  assert.equal(context.appState, 'timing');
  assert.equal(context.startedAt, 1000);
  assert.equal(context.activeInspectionDurationMs, 900);
  assert.equal(context.bluetoothMoves[0].elapsedMs, 0);
  assert.equal(now, 1080);
});
