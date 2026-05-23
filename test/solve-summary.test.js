import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSolveSummary } from '../src/solve-summary.js';

test('builds copyable single-solve summary with metadata', () => {
  const text = buildSolveSummary(
    {
      createdAt: 'not-a-date',
      durationMs: 12000,
      duration: '12.000',
      penalty: '+2',
      scramble: "R U R' U'",
      inspectionEnabled: true,
      timerSource: 'bluetooth',
      tags: ['PLL', '慢十字'],
      comment: 'PLL lockup',
      bluetoothMoves: ['R', 'U2', "F'"],
      bluetoothMoveCount: 3,
      bluetoothTps: 0.25,
    },
    '默认',
  );

  assert.match(text, /TrainTimer Solve - 默认/);
  assert.match(text, /成绩: 14\.000\+/);
  assert.match(text, /原始: 12\.000/);
  assert.match(text, /罚时: \+2/);
  assert.match(text, /时间: -/);
  assert.match(text, /来源: 蓝牙停表/);
  assert.match(text, /观察: 开启/);
  assert.match(text, /打乱: R U R' U'/);
  assert.match(text, /标签: PLL, 慢十字/);
  assert.match(text, /备注: PLL lockup/);
  assert.match(text, /蓝牙转动: R U2 F'/);
  assert.match(text, /转动数: 3/);
  assert.match(text, /TPS: 0\.250/);
});

test('builds DNF summary without optional sections', () => {
  const text = buildSolveSummary({
    createdAt: 'not-a-date',
    durationMs: 9500,
    penalty: 'dnf',
    scramble: '',
    inspectionEnabled: false,
  });

  assert.match(text, /TrainTimer Solve/);
  assert.match(text, /成绩: DNF/);
  assert.match(text, /原始: 9\.500/);
  assert.match(text, /罚时: DNF/);
  assert.match(text, /来源: 手动停表/);
  assert.match(text, /观察: 关闭/);
  assert.match(text, /打乱: -/);
  assert.doesNotMatch(text, /标签:/);
  assert.doesNotMatch(text, /蓝牙转动:/);
});
