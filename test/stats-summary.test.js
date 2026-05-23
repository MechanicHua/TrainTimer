import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatsSummary } from '../src/stats-summary.js';

test('builds copyable session statistics summary', () => {
  const text = buildStatsSummary(
    '默认',
    {
      count: 6,
      validCount: 5,
      dnfCount: 1,
      plus2Count: 1,
      best: 10000,
      average: 12345.4,
      standardDeviation: 900.2,
      bluetoothSolveCount: 2,
      averageBluetoothMoveCount: 12.5,
      averageBluetoothTps: 3.4567,
      bestBluetoothTps: 4.25,
      mo3: 11900,
      ao5: 12000,
      ao12: null,
      bestMo3: 11200,
      bestAo5: 11500,
      bestAo12: null,
    },
    [
      { durationMs: 10000, duration: '10.000', penalty: 'ok' },
      { durationMs: 11000, duration: '11.000', penalty: '+2' },
      { durationMs: 12000, duration: '12.000', penalty: 'dnf' },
    ],
  );

  assert.match(text, /TrainTimer - 默认/);
  assert.match(text, /次数: 6/);
  assert.match(text, /平均: 12\.345/);
  assert.match(text, /蓝牙成绩: 2/);
  assert.match(text, /平均转动: 12\.5/);
  assert.match(text, /平均 TPS: 3\.457/);
  assert.match(text, /最佳 TPS: 4\.250/);
  assert.match(text, /mo3: 11\.900/);
  assert.match(text, /最佳 mo3: 11\.200/);
  assert.match(text, /最佳 ao5: 11\.500/);
  assert.match(text, /最近 3: 10\.000 \/ 13\.000\+ \/ DNF/);
});
