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
      scramblePuzzle: 'four',
      inspectionEnabled: true,
      timerSource: 'bluetooth',
      tags: ['PLL', '慢十字'],
      comment: 'PLL lockup',
      bluetoothMoves: ['R', 'U2', "F'"],
      bluetoothMoveCount: 3,
      bluetoothTps: 0.25,
      bluetoothDeviceName: 'GoCube',
      bluetoothProtocols: ['gocube-move'],
      bluetoothSources: ['0x0003'],
      cfopStages: [
        { label: 'C', name: 'Cross', completed: true, durationMs: 2500, turns: 8, tps: 3.2 },
        { label: 'P', name: 'PLL', completed: false, durationMs: null, turns: 0, tps: null },
      ],
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
  assert.match(text, /打乱类型: four/);
  assert.match(text, /打乱: R U R' U'/);
  assert.match(text, /标签: PLL, 慢十字/);
  assert.match(text, /备注: PLL lockup/);
  assert.match(text, /完整解法: R U2 F'/);
  assert.match(text, /转动数: 3/);
  assert.match(text, /CFOP 分段:/);
  assert.match(text, /C Cross: 2\.500 · 8 步 · 3\.20 TPS/);
  assert.match(text, /P PLL: 未完成 · 0 步 · TPS --/);
  assert.match(text, /TPS: 0\.250/);
  assert.match(text, /蓝牙设备: GoCube/);
  assert.match(text, /蓝牙协议: gocube-move/);
  assert.match(text, /蓝牙来源: 0x0003/);
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
  assert.match(text, /打乱类型: three/);
  assert.match(text, /打乱: -/);
  assert.doesNotMatch(text, /标签:/);
  assert.doesNotMatch(text, /完整解法:/);
});
