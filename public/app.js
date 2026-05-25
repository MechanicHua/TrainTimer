import { applyMove, createSolvedCube, cubeStateFromScramble, facesFromCube, isSolvedFaces, parseScramble } from './cube-state.js';
import { bluetoothMovePacketSignature, decodeBatteryLevel, decodeBluetoothMoves } from './bluetooth-moves.js';
import { createExportPayload, exportHistoryForSolves, safeExportFilename, selectedExportHistory, solvesToCsv, solvesToCstimerCsv, solvesToCstimerJson, solvesToTextTable } from './solves-export.js';
import { ganGyroQuaternionToCube3dBasis, ganGyroVelocityToCube3dBasis } from './gyro-orientation.js';
import { parseSolveImport } from './solves-import.js';
import { buildStatsSummary } from './stats-summary.js';
import { buildSolveSummary } from './solve-summary.js';
import { bestAverageRecord, bestMeanRecord, bestSingleRecord, recordMarksAt, rollingAverageAt, rollingAverageDetailAt, rollingMeanAt, rollingMeanDetailAt } from './rolling-averages.js';
import * as THREE from './vendor/three.module.js';

const localApiOrigin = 'http://127.0.0.1:3211';
const localHttpHost = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
const apiOrigin = localHttpHost ? '' : localApiOrigin;
const inspectionSeconds = 15;
const inspectionDnfSeconds = 17;
const holdToStartMs = 500;
const reminderSeconds = new Set([8, 12]);
const compactHistoryLimit = 48;
const allSolvesRenderBatchSize = 180;
const bluetoothNextSolveGestureWindowMs = 700;
const historyBottomFadeRangePx = 180;
const cube3dActiveFrameMs = 0;
const cube3dIdleFrameMs = 1000 / 30;
const cube3dGyroActiveWindowMs = 900;
const cube3dGyroSmoothingMs = 6;
const cube3dGyroFastSmoothingMs = 3.5;
const cube3dPoseEpsilon = 0.000015;
const cube3dTelemetryFrameMs = 1000 / 15;
const cube3dTurnDurationMs = 96;
const cube3dDoubleTurnDurationMs = 136;
const cube3dMaxPixelRatio = 1;
const bluetoothGyroLogIntervalMs = 500;
const bluetoothGanStateLogIntervalMs = 500;
const statsChartModes = new Set(['single', 'mo3', 'ao5', 'ao12', 'ao50', 'ao100', 'tps']);
const statsChartLabels = {
  single: '单次',
  mo3: 'mo3',
  ao5: 'ao5',
  ao12: 'ao12',
  ao50: 'ao50',
  ao100: 'ao100',
  tps: 'TPS',
};
const algorithmTrainerSetLabels = {
  pll: 'PLL',
  oll2: '2-Look OLL',
  custom: 'Custom',
};
const algorithmTrainerFocusLabels = {
  all: '全部',
  review: '复习',
  new: '未练',
  weak: '薄弱',
  starred: '收藏',
};
const bluetoothUuidSuffix = '-0000-1000-8000-00805f9b34fb';
const bluetoothBatteryLevelUuid = `00002a19${bluetoothUuidSuffix}`;
const bluetoothGanV1MetaServiceUuid = `0000180a${bluetoothUuidSuffix}`;
const bluetoothGanV1VersionUuid = `00002a28${bluetoothUuidSuffix}`;
const bluetoothGanV1HardwareUuid = `00002a23${bluetoothUuidSuffix}`;
const bluetoothGanV1DataServiceUuid = `0000fff0${bluetoothUuidSuffix}`;
const bluetoothGanV1CubeStateUuid = `0000fff2${bluetoothUuidSuffix}`;
const bluetoothGanV1PreviousMovesUuid = `0000fff3${bluetoothUuidSuffix}`;
const bluetoothGanV1MoveStateUuid = `0000fff5${bluetoothUuidSuffix}`;
const bluetoothGanV1TimingUuid = `0000fff6${bluetoothUuidSuffix}`;
const bluetoothGanV1BatteryUuid = `0000fff7${bluetoothUuidSuffix}`;
const bluetoothGanV2ServiceUuid = '6e400001-b5a3-f393-e0a9-e50e24dc4179';
const bluetoothGanV2ReadUuid = '28be4cb6-cd67-11e9-a32f-2a2ae2dbcce4';
const bluetoothGanV2WriteUuid = '28be4a4a-cd67-11e9-a32f-2a2ae2dbcce4';
const bluetoothGanV3ServiceUuid = '8653000a-43e6-47b7-9cb0-5fc21d4ae340';
const bluetoothGanV3ReadUuid = '8653000b-43e6-47b7-9cb0-5fc21d4ae340';
const bluetoothGanV3WriteUuid = '8653000c-43e6-47b7-9cb0-5fc21d4ae340';
const bluetoothGanV4ServiceUuid = '00000010-0000-fff7-fff6-fff5fff4fff0';
const bluetoothGanV4ReadUuid = `0000fff6${bluetoothUuidSuffix}`;
const bluetoothGanV4WriteUuid = `0000fff5${bluetoothUuidSuffix}`;
const bluetoothGoCubeServiceUuid = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const bluetoothGoCubeWriteUuid = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const bluetoothGoCubeReadUuid = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const bluetoothGiikerDataServiceUuid = `0000ffe0${bluetoothUuidSuffix}`;
const bluetoothMiSmartDataServiceUuid = `0000aadb${bluetoothUuidSuffix}`;
const bluetoothGiikerBatteryServiceUuid = `0000aaaa${bluetoothUuidSuffix}`;
const bluetoothGiikerBatteryReadUuid = `0000aaab${bluetoothUuidSuffix}`;
const bluetoothGiikerBatteryWriteUuid = `0000aaac${bluetoothUuidSuffix}`;
const bluetoothGanManufacturerData = Array.from({ length: 256 }, (_, index) => (index << 8) | 0x01);
const bluetoothDeviceFilters = [
  { namePrefix: 'GAN' },
  { namePrefix: 'MG' },
  { namePrefix: 'AiCube' },
  { namePrefix: 'Gi' },
  { namePrefix: 'Giiker' },
  { namePrefix: 'Mi Smart' },
  { namePrefix: 'Hi-' },
  { namePrefix: 'GoCube' },
  { namePrefix: 'Rubik' },
  { namePrefix: 'Rubiks' },
  { namePrefix: 'Moyu' },
  { namePrefix: 'MoYu' },
  { namePrefix: 'Qiyi' },
  { namePrefix: 'QiYi' },
  { namePrefix: 'MHC' },
];
const bluetoothOptionalServices = [
  'battery_service',
  'device_information',
  bluetoothGanV1MetaServiceUuid,
  bluetoothGanV1DataServiceUuid,
  bluetoothGanV2ServiceUuid,
  bluetoothGanV3ServiceUuid,
  bluetoothGanV4ServiceUuid,
  bluetoothGiikerDataServiceUuid,
  bluetoothMiSmartDataServiceUuid,
  bluetoothGiikerBatteryServiceUuid,
  bluetoothGoCubeServiceUuid,
];
const bluetoothGanServiceLabels = new Map([
  [bluetoothGanV1MetaServiceUuid, 'GAN Gen1 信息服务'],
  [bluetoothGanV1DataServiceUuid, 'GAN Gen1 数据服务'],
  [bluetoothGanV2ServiceUuid, 'GAN Gen2 数据服务'],
  [bluetoothGanV3ServiceUuid, 'GAN Gen3 数据服务'],
  [bluetoothGanV4ServiceUuid, 'GAN Gen4 数据服务'],
]);
const bluetoothGanServiceUuids = new Set(bluetoothGanServiceLabels.keys());
const bluetoothGanCharacteristicUuids = new Set([
  bluetoothGanV1VersionUuid,
  bluetoothGanV1HardwareUuid,
  bluetoothGanV1CubeStateUuid,
  bluetoothGanV1PreviousMovesUuid,
  bluetoothGanV1MoveStateUuid,
  bluetoothGanV1TimingUuid,
  bluetoothGanV1BatteryUuid,
  bluetoothGanV2ReadUuid,
  bluetoothGanV2WriteUuid,
  bluetoothGanV3ReadUuid,
  bluetoothGanV3WriteUuid,
  bluetoothGanV4ReadUuid,
  bluetoothGanV4WriteUuid,
]);
const bluetoothUuidLabels = new Map([
  ['battery_service', '标准电量服务'],
  ['device_information', '设备信息服务'],
  [bluetoothBatteryLevelUuid, '标准电量特征'],
  [bluetoothGanV1MetaServiceUuid, 'GAN Gen1 信息服务'],
  [bluetoothGanV1VersionUuid, 'GAN Gen1 固件版本'],
  [bluetoothGanV1HardwareUuid, 'GAN Gen1 硬件 ID'],
  [bluetoothGanV1DataServiceUuid, 'GAN Gen1 数据服务'],
  [bluetoothGanV1CubeStateUuid, 'GAN Gen1 魔方状态'],
  [bluetoothGanV1PreviousMovesUuid, 'GAN Gen1 历史转动'],
  [bluetoothGanV1MoveStateUuid, 'GAN Gen1 转动状态 / Gen4 写请求'],
  [bluetoothGanV1TimingUuid, 'GAN Gen1 转动时间 / Gen4 读通知'],
  [bluetoothGanV1BatteryUuid, 'GAN Gen1 电量'],
  [bluetoothGanV2ServiceUuid, 'GAN Gen2 数据服务'],
  [bluetoothGanV2ReadUuid, 'GAN Gen2 读通知'],
  [bluetoothGanV2WriteUuid, 'GAN Gen2 写请求'],
  [bluetoothGanV3ServiceUuid, 'GAN Gen3 数据服务'],
  [bluetoothGanV3ReadUuid, 'GAN Gen3 读通知'],
  [bluetoothGanV3WriteUuid, 'GAN Gen3 写请求'],
  [bluetoothGanV4ServiceUuid, 'GAN Gen4 数据服务'],
  [bluetoothGoCubeServiceUuid, 'GoCube / Rubik 数据服务'],
  [bluetoothGoCubeReadUuid, 'GoCube / Rubik 读通知'],
  [bluetoothGoCubeWriteUuid, 'GoCube / Rubik 写请求'],
  [bluetoothGiikerDataServiceUuid, 'Giiker / Mi Smart 数据服务'],
  [bluetoothMiSmartDataServiceUuid, 'Mi Smart 数据服务'],
  [bluetoothGiikerBatteryServiceUuid, 'Giiker 电量服务'],
  [bluetoothGiikerBatteryReadUuid, 'Giiker 电量读特征'],
  [bluetoothGiikerBatteryWriteUuid, 'Giiker 电量写特征'],
].map(([uuid, label]) => [String(uuid).toLowerCase(), label]));
const bluetoothGanProtocols = new Map([
  [bluetoothGanV2ServiceUuid, {
    protocol: 'v2',
    label: 'GAN Gen2',
    readUuid: bluetoothGanV2ReadUuid,
    writeUuid: bluetoothGanV2WriteUuid,
    requestBytes: 20,
  }],
  [bluetoothGanV3ServiceUuid, {
    protocol: 'v3',
    label: 'GAN Gen3',
    readUuid: bluetoothGanV3ReadUuid,
    writeUuid: bluetoothGanV3WriteUuid,
    requestBytes: 16,
  }],
  [bluetoothGanV4ServiceUuid, {
    protocol: 'v4',
    label: 'GAN Gen4',
    readUuid: bluetoothGanV4ReadUuid,
    writeUuid: bluetoothGanV4WriteUuid,
    requestBytes: 20,
  }],
]);
const bluetoothGanCharacteristicProtocols = new Map(
  [...bluetoothGanProtocols.values()].flatMap((entry) => [
    [entry.readUuid, entry],
    [entry.writeUuid, entry],
  ]),
);
const facePositions = {
  U: [3, 0],
  L: [0, 3],
  F: [3, 3],
  R: [6, 3],
  B: [9, 3],
  D: [3, 6],
};
const cube3dFaces = ['U', 'R', 'F', 'D', 'L', 'B'];
const cube3dFallbackColors = {
  U: '#f8fafc',
  R: '#dc2626',
  F: '#16a34a',
  D: '#facc15',
  L: '#f97316',
  B: '#2563eb',
};
const previewStickerColors = new Map([
  ['#ffffff', '#d8dee7'],
  ['#ffff00', '#bfc267'],
  ['#ff0000', '#b45458'],
  ['#00ff00', '#45b86d'],
  ['#0000ff', '#3d56b6'],
  ['#ff8000', '#b8794c'],
  ['#f8fafc', '#d8dee7'],
  ['#facc15', '#bfc267'],
  ['#dc2626', '#b45458'],
  ['#16a34a', '#45b86d'],
  ['#2563eb', '#3d56b6'],
  ['#f97316', '#b8794c'],
]);
const cubeFaceNormals = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};
const cubeOppositeFaces = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
const cfopBottomFaceOrder = ['D', 'U', 'F', 'B', 'L', 'R'];
const cfopFallbackPairSlots = Array.from({ length: 4 }, (_, index) => ({
  key: `pair-${index + 1}`,
  label: `F${index + 1}`,
  name: `F2L Pair ${index + 1}`,
  cells: [],
}));
const cfopDefinitions = createCfopDefinitions();
const puzzleLabels = new Map([
  ['two', '2x2'],
  ['three', '3x3'],
  ['four', '4x4'],
  ['five', '5x5'],
  ['six', '6x6'],
  ['seven', '7x7'],
  ['clock', 'Clock'],
  ['skewb', 'Skewb'],
  ['sq1', 'Square-1'],
]);
const algorithmTrainerCases = [
  { id: 'pll-aa', set: 'pll', name: 'Aa Perm', group: 'Corners', algorithm: "x R' U R' D2 R U' R' D2 R2 x'", hint: '相邻角块顺时针换位' },
  { id: 'pll-ab', set: 'pll', name: 'Ab Perm', group: 'Corners', algorithm: "x R2 D2 R U R' D2 R U' R x'", hint: '相邻角块逆时针换位' },
  { id: 'pll-e', set: 'pll', name: 'E Perm', group: 'Corners', algorithm: "x' R U' R' D R U R' D' R U R' D R U' R' D' x", hint: '对角角块互换' },
  { id: 'pll-h', set: 'pll', name: 'H Perm', group: 'Edges', algorithm: 'M2 U M2 U2 M2 U M2', hint: '四棱对换' },
  { id: 'pll-ua', set: 'pll', name: 'Ua Perm', group: 'Edges', algorithm: "M2 U M U2 M' U M2", hint: '三棱顺时针轮换' },
  { id: 'pll-ub', set: 'pll', name: 'Ub Perm', group: 'Edges', algorithm: "M2 U' M U2 M' U' M2", hint: '三棱逆时针轮换' },
  { id: 'pll-z', set: 'pll', name: 'Z Perm', group: 'Edges', algorithm: "M' U M2 U M2 U M' U2 M2", hint: '相邻两组棱块互换' },
  { id: 'pll-ja', set: 'pll', name: 'Ja Perm', group: 'Adjacent', algorithm: "x R2 F R F' R U2 r' U r U2 x'", hint: '一组角棱块相邻换位' },
  { id: 'pll-jb', set: 'pll', name: 'Jb Perm', group: 'Adjacent', algorithm: "R U R' F' R U R' U' R' F R2 U' R'", hint: '最常用 J 形换位' },
  { id: 'pll-t', set: 'pll', name: 'T Perm', group: 'Adjacent', algorithm: "R U R' U' R' F R2 U' R' U' R U R' F'", hint: '一组角块和一组棱块互换' },
  { id: 'pll-f', set: 'pll', name: 'F Perm', group: 'Adjacent', algorithm: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R", hint: 'F 形相邻换位' },
  { id: 'pll-ra', set: 'pll', name: 'Ra Perm', group: 'Adjacent', algorithm: "R U' R' U' R U R D R' U' R D' R' U2 R'", hint: 'R 形换位之一' },
  { id: 'pll-rb', set: 'pll', name: 'Rb Perm', group: 'Adjacent', algorithm: "R2 F R U R U' R' F' R U2 R' U2 R", hint: 'R 形换位之二' },
  { id: 'pll-v', set: 'pll', name: 'V Perm', group: 'Diagonal', algorithm: "R' U R' U' y R' F' R2 U' R' U R' F R F", hint: '对角角棱换位' },
  { id: 'pll-y', set: 'pll', name: 'Y Perm', group: 'Diagonal', algorithm: "F R U' R' U' R U R' F' R U R' U' R' F R F'", hint: 'Y 形对角换位' },
  { id: 'pll-na', set: 'pll', name: 'Na Perm', group: 'Diagonal', algorithm: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'", hint: 'N 形对角换位之一' },
  { id: 'pll-nb', set: 'pll', name: 'Nb Perm', group: 'Diagonal', algorithm: "R' U R U' R' F' U' F R U R' F R' F' R U' R", hint: 'N 形对角换位之二' },
  { id: 'pll-ga', set: 'pll', name: 'Ga Perm', group: 'G Perms', algorithm: "R2 U R' U R' U' R U' R2 D U' R' U R D'", hint: 'G 形换位之一' },
  { id: 'pll-gb', set: 'pll', name: 'Gb Perm', group: 'G Perms', algorithm: "R' U' R U D' R2 U R' U R U' R U' R2 D", hint: 'G 形换位之二' },
  { id: 'pll-gc', set: 'pll', name: 'Gc Perm', group: 'G Perms', algorithm: "R2 U' R U' R U R' U R2 D' U R U' R' D", hint: 'G 形换位之三' },
  { id: 'pll-gd', set: 'pll', name: 'Gd Perm', group: 'G Perms', algorithm: "R U R' U' D R2 U' R U' R' U R' U R2 D'", hint: 'G 形换位之四' },
  { id: 'oll2-edge-line', set: 'oll2', name: 'Edge Line', group: 'Edges', algorithm: "F R U R' U' F'", hint: '顶层棱块成一条线' },
  { id: 'oll2-edge-l', set: 'oll2', name: 'Edge L', group: 'Edges', algorithm: "f R U R' U' f'", hint: '顶层棱块成 L 形' },
  { id: 'oll2-edge-dot', set: 'oll2', name: 'Edge Dot', group: 'Edges', algorithm: "F R U R' U' F' f R U R' U' f'", hint: '顶层没有已翻好的棱块' },
  { id: 'oll2-corner-sune', set: 'oll2', name: 'Sune', group: 'Corners', algorithm: "R U R' U R U2 R'", hint: '一个角块朝上，右手 Sune' },
  { id: 'oll2-corner-antisune', set: 'oll2', name: 'Anti-Sune', group: 'Corners', algorithm: "R U2 R' U' R U' R'", hint: '一个角块朝上，反 Sune' },
  { id: 'oll2-corner-pi', set: 'oll2', name: 'Pi', group: 'Corners', algorithm: "R U2 R2 U' R2 U' R2 U2 R", hint: '两个前角朝前，形状像 Pi' },
  { id: 'oll2-corner-h', set: 'oll2', name: 'H', group: 'Corners', algorithm: "R U R' U R U' R' U R U2 R'", hint: '没有角块朝上，左右对称' },
  { id: 'oll2-corner-l', set: 'oll2', name: 'L', group: 'Corners', algorithm: "F R' F' r U R U' r'", hint: '两个相邻角块形成 L 形' },
  { id: 'oll2-corner-t', set: 'oll2', name: 'T', group: 'Corners', algorithm: "r U R' U' r' F R F'", hint: '两个角块朝上，形状像 T' },
  { id: 'oll2-corner-u', set: 'oll2', name: 'U', group: 'Corners', algorithm: "R2 D R' U2 R D' R' U2 R'", hint: '两个角块朝上，形状像 U' },
];
const untaggedFilterValue = '__untagged';

const elements = {
  statusText: document.querySelector('#statusText'),
  inspectionToggle: document.querySelector('#inspectionToggle'),
  timerDisplay: document.querySelector('#timerDisplay'),
  timerHint: document.querySelector('#timerHint'),
  nextButton: document.querySelector('#nextButton'),
  scrambleButton: document.querySelector('#scrambleButton'),
  scrambleLockButton: document.querySelector('#scrambleLockButton'),
  lastOkButton: document.querySelector('#lastOkButton'),
  lastPlusTwoButton: document.querySelector('#lastPlusTwoButton'),
  lastDnfButton: document.querySelector('#lastDnfButton'),
  lastDeleteButton: document.querySelector('#lastDeleteButton'),
  timerSettingsButton: document.querySelector('#timerSettingsButton'),
  timerSettingsDialog: document.querySelector('#timerSettingsDialog'),
  timerSettingsMeta: document.querySelector('#timerSettingsMeta'),
  hideTimerToggle: document.querySelector('#hideTimerToggle'),
  timerFreezeSelect: document.querySelector('#timerFreezeSelect'),
  confirmDeleteToggle: document.querySelector('#confirmDeleteToggle'),
  sessionGoalButton: document.querySelector('#sessionGoalButton'),
  countStat: document.querySelector('#countStat'),
  sessionGoalStat: document.querySelector('#sessionGoalStat'),
  sessionGoalBar: document.querySelector('#sessionGoalBar'),
  bestStat: document.querySelector('#bestStat'),
  averageStat: document.querySelector('#averageStat'),
  mo3Stat: document.querySelector('#mo3Stat'),
  ao5Stat: document.querySelector('#ao5Stat'),
  ao12Stat: document.querySelector('#ao12Stat'),
  bestMo3Stat: document.querySelector('#bestMo3Stat'),
  bestAo5Stat: document.querySelector('#bestAo5Stat'),
  bestAo12Stat: document.querySelector('#bestAo12Stat'),
  latestStat: document.querySelector('#latestStat'),
  bluetoothButton: document.querySelector('#bluetoothButton'),
  bluetoothAnyButton: document.querySelector('#bluetoothAnyButton'),
  bluetoothReconnectButton: document.querySelector('#bluetoothReconnectButton'),
  bluetoothDisconnectButton: document.querySelector('#bluetoothDisconnectButton'),
  bluetoothLogButton: document.querySelector('#bluetoothLogButton'),
  bluetoothBattery: document.querySelector('#bluetoothBattery'),
  bluetoothStatus: document.querySelector('#bluetoothStatus'),
  bluetoothFeedMeta: document.querySelector('#bluetoothFeedMeta'),
  bluetoothFeedRows: document.querySelector('#bluetoothFeedRows'),
  sessionSelect: document.querySelector('#sessionSelect'),
  newSessionButton: document.querySelector('#newSessionButton'),
  duplicateSessionButton: document.querySelector('#duplicateSessionButton'),
  mergeSessionButton: document.querySelector('#mergeSessionButton'),
  renameSessionButton: document.querySelector('#renameSessionButton'),
  deleteSessionButton: document.querySelector('#deleteSessionButton'),
  algorithmTrainerButton: document.querySelector('#algorithmTrainerButton'),
  algorithmTrainerDialog: document.querySelector('#algorithmTrainerDialog'),
  algorithmTrainerMeta: document.querySelector('#algorithmTrainerMeta'),
  algorithmTrainerSet: document.querySelector('#algorithmTrainerSet'),
  algorithmTrainerFocus: document.querySelector('#algorithmTrainerFocus'),
  algorithmTrainerGroupFilter: document.querySelector('#algorithmTrainerGroupFilter'),
  algorithmTrainerSearch: document.querySelector('#algorithmTrainerSearch'),
  algorithmTrainerAddButton: document.querySelector('#algorithmTrainerAddButton'),
  algorithmTrainerEditButton: document.querySelector('#algorithmTrainerEditButton'),
  algorithmTrainerDeleteButton: document.querySelector('#algorithmTrainerDeleteButton'),
  algorithmTrainerExportButton: document.querySelector('#algorithmTrainerExportButton'),
  algorithmTrainerImportButton: document.querySelector('#algorithmTrainerImportButton'),
  algorithmTrainerImportFile: document.querySelector('#algorithmTrainerImportFile'),
  algorithmTrainerNextButton: document.querySelector('#algorithmTrainerNextButton'),
  algorithmTrainerResetButton: document.querySelector('#algorithmTrainerResetButton'),
  algorithmTrainerName: document.querySelector('#algorithmTrainerName'),
  algorithmTrainerGroup: document.querySelector('#algorithmTrainerGroup'),
  algorithmTrainerStarButton: document.querySelector('#algorithmTrainerStarButton'),
  algorithmTrainerScore: document.querySelector('#algorithmTrainerScore'),
  algorithmTrainerAlg: document.querySelector('#algorithmTrainerAlg'),
  algorithmTrainerHint: document.querySelector('#algorithmTrainerHint'),
  algorithmTrainerSetup: document.querySelector('#algorithmTrainerSetup'),
  algorithmTrainerCopySetupButton: document.querySelector('#algorithmTrainerCopySetupButton'),
  algorithmTrainerApplySetupButton: document.querySelector('#algorithmTrainerApplySetupButton'),
  algorithmTrainerTimerDisplay: document.querySelector('#algorithmTrainerTimerDisplay'),
  algorithmTrainerTimerStats: document.querySelector('#algorithmTrainerTimerStats'),
  algorithmTrainerTimerButton: document.querySelector('#algorithmTrainerTimerButton'),
  algorithmTrainerPassButton: document.querySelector('#algorithmTrainerPassButton'),
  algorithmTrainerFailButton: document.querySelector('#algorithmTrainerFailButton'),
  algorithmTrainerList: document.querySelector('#algorithmTrainerList'),
  scramblePuzzleSelect: document.querySelector('#scramblePuzzleSelect'),
  scrambleSource: document.querySelector('#scrambleSource'),
  scrambleText: document.querySelector('#scrambleText'),
  scrambleGuideMeta: document.querySelector('#scrambleGuideMeta'),
  previewTitle: document.querySelector('#previewTitle'),
  previewMeta: document.querySelector('#previewMeta'),
  cubeNet: document.querySelector('#cubeNet'),
  historyPath: document.querySelector('#historyPath'),
  historyRows: document.querySelector('#historyRows'),
  historySortButtons: [...document.querySelectorAll('[data-history-sort]')],
  historyActionsMenu: document.querySelector('#historyActionsMenu'),
  selectAllSolves: document.querySelector('#selectAllSolves'),
  manualEntryButton: document.querySelector('#manualEntryButton'),
  exportButton: document.querySelector('#exportButton'),
  importButton: document.querySelector('#importButton'),
  importFile: document.querySelector('#importFile'),
  statsDetailButton: document.querySelector('#statsDetailButton'),
  manageSolvesButton: document.querySelector('#manageSolvesButton'),
  selectedStatsButton: document.querySelector('#selectedStatsButton'),
  markSelectedButton: document.querySelector('#markSelectedButton'),
  puzzleSelectedButton: document.querySelector('#puzzleSelectedButton'),
  tagSelectedButton: document.querySelector('#tagSelectedButton'),
  commentSelectedButton: document.querySelector('#commentSelectedButton'),
  moveSelectedButton: document.querySelector('#moveSelectedButton'),
  deleteSelectedButton: document.querySelector('#deleteSelectedButton'),
  undoDeleteButton: document.querySelector('#undoDeleteButton'),
  clearAllButton: document.querySelector('#clearAllButton'),
  allSolvesDialog: document.querySelector('#allSolvesDialog'),
  allSolvesMeta: document.querySelector('#allSolvesMeta'),
  allSolvesTable: document.querySelector('.all-solves-table'),
  allSolvesRows: document.querySelector('#allSolvesRows'),
  allSolvesSearch: document.querySelector('#allSolvesSearch'),
  allSolvesFromDate: document.querySelector('#allSolvesFromDate'),
  allSolvesToDate: document.querySelector('#allSolvesToDate'),
  allDateTodayButton: document.querySelector('#allDateTodayButton'),
  allDateWeekButton: document.querySelector('#allDateWeekButton'),
  allDateMonthButton: document.querySelector('#allDateMonthButton'),
  allDateAllButton: document.querySelector('#allDateAllButton'),
  allSolvesRecordFilter: document.querySelector('#allSolvesRecordFilter'),
  allSolvesPuzzleFilter: document.querySelector('#allSolvesPuzzleFilter'),
  allSolvesPenaltyFilter: document.querySelector('#allSolvesPenaltyFilter'),
  allSolvesSourceFilter: document.querySelector('#allSolvesSourceFilter'),
  allSolvesTagFilter: document.querySelector('#allSolvesTagFilter'),
  allSessionsToggle: document.querySelector('#allSessionsToggle'),
  allSolvesSortBy: document.querySelector('#allSolvesSortBy'),
  allSolvesSortDirection: document.querySelector('#allSolvesSortDirection'),
  selectAllSessionSolves: document.querySelector('#selectAllSessionSolves'),
  clearAllSolvesFiltersButton: document.querySelector('#clearAllSolvesFiltersButton'),
  allCopyListButton: document.querySelector('#allCopyListButton'),
  allListedStatsButton: document.querySelector('#allListedStatsButton'),
  allSelectedStatsButton: document.querySelector('#allSelectedStatsButton'),
  allMarkSelectedButton: document.querySelector('#allMarkSelectedButton'),
  allPuzzleSelectedButton: document.querySelector('#allPuzzleSelectedButton'),
  allTagSelectedButton: document.querySelector('#allTagSelectedButton'),
  allCommentSelectedButton: document.querySelector('#allCommentSelectedButton'),
  allMoveSelectedButton: document.querySelector('#allMoveSelectedButton'),
  allDeleteSelectedButton: document.querySelector('#allDeleteSelectedButton'),
  allExportJsonButton: document.querySelector('#allExportJsonButton'),
  allExportCsvButton: document.querySelector('#allExportCsvButton'),
  allExportCstimerButton: document.querySelector('#allExportCstimerButton'),
  allExportCstimerJsonButton: document.querySelector('#allExportCstimerJsonButton'),
  statsDialog: document.querySelector('#statsDialog'),
  statsDialogMeta: document.querySelector('#statsDialogMeta'),
  statsRecordHint: document.querySelector('#statsRecordHint'),
  statsChartTitle: document.querySelector('#statsChartTitle'),
  statsChartModeButtons: [...document.querySelectorAll('[data-stats-chart-mode]')],
  statsTrendChart: document.querySelector('#statsTrendChart'),
  statsChartMeta: document.querySelector('#statsChartMeta'),
  statsDistributionChart: document.querySelector('#statsDistributionChart'),
  statsDistributionMeta: document.querySelector('#statsDistributionMeta'),
  statsInsights: document.querySelector('#statsInsights'),
  statsRecordList: document.querySelector('#statsRecordList'),
  statsDetailGrid: document.querySelector('#statsDetailGrid'),
  statsSessionOverviewPanel: document.querySelector('#statsSessionOverviewPanel'),
  sessionOverviewList: document.querySelector('#sessionOverviewList'),
  copyStatsSummaryButton: document.querySelector('#copyStatsSummaryButton'),
  exportDialog: document.querySelector('#exportDialog'),
  exportDialogMeta: document.querySelector('#exportDialogMeta'),
  exportSessionJsonButton: document.querySelector('#exportSessionJsonButton'),
  exportSessionCsvButton: document.querySelector('#exportSessionCsvButton'),
  exportSessionCstimerButton: document.querySelector('#exportSessionCstimerButton'),
  exportSessionCstimerJsonButton: document.querySelector('#exportSessionCstimerJsonButton'),
  exportSelectedJsonButton: document.querySelector('#exportSelectedJsonButton'),
  exportSelectedCsvButton: document.querySelector('#exportSelectedCsvButton'),
  exportSelectedCstimerButton: document.querySelector('#exportSelectedCstimerButton'),
  exportSelectedCstimerJsonButton: document.querySelector('#exportSelectedCstimerJsonButton'),
  exportAllJsonButton: document.querySelector('#exportAllJsonButton'),
  exportAllCsvButton: document.querySelector('#exportAllCsvButton'),
  exportAllCstimerButton: document.querySelector('#exportAllCstimerButton'),
  exportAllCstimerJsonButton: document.querySelector('#exportAllCstimerJsonButton'),
  importDialog: document.querySelector('#importDialog'),
  importDialogMeta: document.querySelector('#importDialogMeta'),
  importPreviewList: document.querySelector('#importPreviewList'),
  appendImportButton: document.querySelector('#appendImportButton'),
  replaceImportButton: document.querySelector('#replaceImportButton'),
  markPenaltyDialog: document.querySelector('#markPenaltyDialog'),
  markPenaltyMeta: document.querySelector('#markPenaltyMeta'),
  markPenaltySelect: document.querySelector('#markPenaltySelect'),
  confirmMarkPenaltyButton: document.querySelector('#confirmMarkPenaltyButton'),
  puzzleSolvesDialog: document.querySelector('#puzzleSolvesDialog'),
  puzzleSolvesMeta: document.querySelector('#puzzleSolvesMeta'),
  puzzleSolvesSelect: document.querySelector('#puzzleSolvesSelect'),
  confirmPuzzleButton: document.querySelector('#confirmPuzzleButton'),
  moveSolvesDialog: document.querySelector('#moveSolvesDialog'),
  moveSolvesMeta: document.querySelector('#moveSolvesMeta'),
  moveSessionSelect: document.querySelector('#moveSessionSelect'),
  confirmMoveButton: document.querySelector('#confirmMoveButton'),
  mergeSessionDialog: document.querySelector('#mergeSessionDialog'),
  mergeSessionMeta: document.querySelector('#mergeSessionMeta'),
  mergeSessionSelect: document.querySelector('#mergeSessionSelect'),
  confirmMergeSessionButton: document.querySelector('#confirmMergeSessionButton'),
  tagSolvesDialog: document.querySelector('#tagSolvesDialog'),
  tagSolvesMeta: document.querySelector('#tagSolvesMeta'),
  tagSolvesInput: document.querySelector('#tagSolvesInput'),
  commentSolvesDialog: document.querySelector('#commentSolvesDialog'),
  commentSolvesMeta: document.querySelector('#commentSolvesMeta'),
  commentSolvesInput: document.querySelector('#commentSolvesInput'),
  confirmTagButton: document.querySelector('#confirmTagButton'),
  confirmCommentButton: document.querySelector('#confirmCommentButton'),
  manualEntryDialog: document.querySelector('#manualEntryDialog'),
  manualEntryMeta: document.querySelector('#manualEntryMeta'),
  manualTimeInput: document.querySelector('#manualTimeInput'),
  manualPenaltySelect: document.querySelector('#manualPenaltySelect'),
  manualDateInput: document.querySelector('#manualDateInput'),
  manualScrambleInput: document.querySelector('#manualScrambleInput'),
  manualCommentInput: document.querySelector('#manualCommentInput'),
  manualTagsInput: document.querySelector('#manualTagsInput'),
  manualEntryError: document.querySelector('#manualEntryError'),
  saveManualEntryButton: document.querySelector('#saveManualEntryButton'),
  solveDialog: document.querySelector('#solveDialog'),
  solveDetailTitle: document.querySelector('#solveDetailTitle'),
  solveDetailMeta: document.querySelector('#solveDetailMeta'),
  solveDetailTimeInput: document.querySelector('#solveDetailTimeInput'),
  solveDetailError: document.querySelector('#solveDetailError'),
  solveDetailPenaltySelect: document.querySelector('#solveDetailPenaltySelect'),
  solveDetailPuzzleSelect: document.querySelector('#solveDetailPuzzleSelect'),
  solveDetailScramble: document.querySelector('#solveDetailScramble'),
  solveDetailComment: document.querySelector('#solveDetailComment'),
  solveDetailTagsInput: document.querySelector('#solveDetailTagsInput'),
  solveDetailBluetoothStats: document.querySelector('#solveDetailBluetoothStats'),
  solveDetailBluetoothMoves: document.querySelector('#solveDetailBluetoothMoves'),
  solveSolutionPanel: document.querySelector('#solveSolutionPanel'),
  solveBluetoothReplayMeta: document.querySelector('#solveBluetoothReplayMeta'),
  solveReplayButton: document.querySelector('#solveReplayButton'),
  solveCfopStages: document.querySelector('#solveCfopStages'),
  averageDialog: document.querySelector('#averageDialog'),
  averageDetailTitle: document.querySelector('#averageDetailTitle'),
  averageDetailMeta: document.querySelector('#averageDetailMeta'),
  averageDetailList: document.querySelector('#averageDetailList'),
  copyAverageSummaryButton: document.querySelector('#copyAverageSummaryButton'),
  prevSolveButton: document.querySelector('#prevSolveButton'),
  nextSolveDetailButton: document.querySelector('#nextSolveDetailButton'),
  copySolveSummaryButton: document.querySelector('#copySolveSummaryButton'),
  copyScrambleButton: document.querySelector('#copyScrambleButton'),
  saveTimeButton: document.querySelector('#saveTimeButton'),
  deleteSolveDetailButton: document.querySelector('#deleteSolveDetailButton'),
  bluetoothLogDialog: document.querySelector('#bluetoothLogDialog'),
  bluetoothLogMeta: document.querySelector('#bluetoothLogMeta'),
  bluetoothLogRows: document.querySelector('#bluetoothLogRows'),
  bluetoothMoveCount: document.querySelector('#bluetoothMoveCount'),
  bluetoothMoveRows: document.querySelector('#bluetoothMoveRows'),
  bluetoothSolveStatus: document.querySelector('#bluetoothSolveStatus'),
  bluetoothStateMeta: document.querySelector('#bluetoothStateMeta'),
  bluetoothStateNet: document.querySelector('#bluetoothStateNet'),
  bluetooth3dPanel: document.querySelector('#bluetooth3dPanel'),
  bluetooth3dCanvas: document.querySelector('#bluetooth3dCanvas'),
  bluetooth3dMeta: document.querySelector('#bluetooth3dMeta'),
  bluetooth3dMove: document.querySelector('#bluetooth3dMove'),
  bluetooth3dGyro: document.querySelector('#bluetooth3dGyro'),
  bluetooth3dVelocity: document.querySelector('#bluetooth3dVelocity'),
  clearBluetoothLogButton: document.querySelector('#clearBluetoothLogButton'),
  copyBluetoothLogButton: document.querySelector('#copyBluetoothLogButton'),
  exportBluetoothLogButton: document.querySelector('#exportBluetoothLogButton'),
  pbToast: document.querySelector('#pbToast'),
  pbToastTitle: document.querySelector('#pbToastTitle'),
  pbToastMeta: document.querySelector('#pbToastMeta'),
};

let appState = 'loading';
let scramble = null;
let solves = [];
let sessions = [];
let inspectionEnabled = localStorage.getItem('trainTimer.inspection') === '1';
let hideTimerWhileSolving = localStorage.getItem('trainTimer.hideTimerWhileSolving') === '1';
let timerFreezeMs = normalizeTimerFreezeMs(localStorage.getItem('trainTimer.timerFreezeMs'));
let confirmDeleteSolves = localStorage.getItem('trainTimer.confirmDeleteSolves') !== '0';
let currentSessionId = localStorage.getItem('trainTimer.session') || 'default';
let scramblePuzzle = localStorage.getItem('trainTimer.scramblePuzzle') || 'three';
let scrambleLocked = localStorage.getItem('trainTimer.scrambleLocked') === '1';
let allSessionsEnabled = localStorage.getItem('trainTimer.allSessions') === '1';
let allSolvesDatePreset = 'all';
let allSolvesVisibleLimit = allSolvesRenderBatchSize;
let statsChartMode = localStorage.getItem('trainTimer.statsChartMode') || 'single';
if (!statsChartModes.has(statsChartMode)) statsChartMode = 'single';
let historySortKey = localStorage.getItem('trainTimer.historySortKey') || '';
let historySortDirection = localStorage.getItem('trainTimer.historySortDirection') || '';
if (!['single', 'tps', 'ao5', 'ao12'].includes(historySortKey) || !['asc', 'desc'].includes(historySortDirection)) {
  historySortKey = '';
  historySortDirection = '';
}
let algorithmTrainerCustomCases = loadAlgorithmTrainerCustomCases();
let algorithmTrainerSet = localStorage.getItem('trainTimer.algorithmTrainerSet') || 'pll';
if (!algorithmTrainerAllCases().some((item) => item.set === algorithmTrainerSet)) algorithmTrainerSet = 'pll';
let algorithmTrainerFocus = localStorage.getItem('trainTimer.algorithmTrainerFocus') || 'all';
if (!Object.hasOwn(algorithmTrainerFocusLabels, algorithmTrainerFocus)) algorithmTrainerFocus = 'all';
let algorithmTrainerGroup = localStorage.getItem('trainTimer.algorithmTrainerGroup') || 'all';
let algorithmTrainerSearch = localStorage.getItem('trainTimer.algorithmTrainerSearch') || '';
let algorithmTrainerCurrentId = localStorage.getItem('trainTimer.algorithmTrainerCurrentId') || '';
let algorithmTrainerStats = loadAlgorithmTrainerStats();
let algorithmTrainerStarredIds = loadAlgorithmTrainerStarredIds();
let algorithmTrainerTimerStartedAt = 0;
let algorithmTrainerTimerFrame = 0;
let startedAt = 0;
let inspectionStartedAt = 0;
let activeInspectionUsed = false;
let inspectionBluetoothStartBlockedUntil = 0;
let holdStartedAt = 0;
let holdConfirmed = false;
let timerFrame = null;
let inspectionFrame = null;
let holdFrame = null;
let inspectionEntryTimer = 0;
let holdReturnState = 'ready';
let reminded = new Set();
let activePenalty = 'ok';
let finishSource = 'manual';
let selectedSolveIds = new Set();
let pendingDeletedSolves = [];
let pendingImportSnapshot = null;
let pendingImportPreview = null;
let currentDetailSolveId = null;
let currentAverageDetail = null;
let solveReplayTimer = 0;
let solveReplayStep = -1;
let solveReplayPlaying = false;
let solveReplayPreviewActive = false;
let solveReplayCube = null;
let solveReplayPreviewLabel = '';
let statsScope = 'session';
let pbToastTimer = 0;
let scrambleCopyHintTimer = 0;
let bluetoothDevice = null;
let bluetoothDeviceDisconnectHandler = null;
let bluetoothReconnectDevices = [];
let bluetoothSubscriptions = [];
let bluetoothLog = [];
let bluetoothMoves = [];
let bluetoothSolved = false;
let bluetoothSolvedByStatePacket = false;
let bluetoothSolveCube = null;
let bluetoothSolveCubeValid = false;
let bluetoothMoveDerivedFaces = null;
let bluetoothMoveDerivedStateTime = 0;
let bluetoothGyro = null;
let bluetoothGyroLastUpdateAt = 0;
let bluetoothGyroReferenceInverse = null;
let bluetoothGyroLastBasisQuaternion = null;
let bluetoothLastMoveText = '-';
let bluetoothPhysicalFacelets = '';
let bluetoothPhysicalFaces = null;
let bluetoothPhysicalStateTime = '';
let bluetoothPhysicalStateReceivedAt = 0;
let bluetoothMovesRenderKey = '';
let bluetoothStatePreviewRenderKey = '';
let bluetoothBatteryLevel = null;
let bluetoothGanMac = '';
let bluetoothGanSession = null;
let bluetoothGanMacReadPromise = null;
let bluetoothGanPendingInit = null;
let bluetoothGanLastMoveCounter = null;
let bluetoothGanPacketSequence = 0;
let bluetoothGanLatestAppliedGyroSequence = 0;
let bluetoothGanDecodeWarning = '';
let bluetoothGanMacPromptAllowed = true;
let bluetoothGanLastStateLogAt = 0;
let bluetoothGanLastStateLogSignature = '';
let lastBluetoothMovePacketSignature = '';
let scrambleGuideMoves = [];
let scrambleGuideInputMoves = [];
let scrambleGuideRoute = [];
let scrambleGuideCorrectPrefix = 0;
let scrambleGuidePartialIndex = null;
let scrambleGuideErrorIndex = null;
let scrambleGuideErrorMove = '';
let scrambleGuideLastMatchedInputLength = 0;
let scrambleGuideLastMatchedRemainingMoves = [];
let scrambleGuideCompleted = false;
let scrambleGuideSupported = false;
let bluetoothNextSolveGestureCandidate = null;
let bluetoothNextSolveGestureFlushTimer = 0;
let bluetoothNextSolveGestureLoading = false;
let previewScrambleText = '';
let previewRequestId = 0;
const previewCache = new Map();
let cube3d = null;
let cube3dLastFacesSignature = '';
let cube3dMovePulseTimer = 0;
let cube3dAnimationFrame = 0;
let cube3dAnimationTimer = 0;
let cube3dTelemetryFrame = 0;
let cube3dTelemetryTimer = 0;
let cube3dTelemetryLastRenderAt = 0;
let timerDisplayFitKey = '';
let timerDisplayTextKey = '';

elements.inspectionToggle.checked = inspectionEnabled;
elements.inspectionToggle.addEventListener('change', () => {
  setInspectionEnabled(elements.inspectionToggle.checked);
});
elements.nextButton.addEventListener('click', nextSolve);
elements.scrambleButton.addEventListener('click', loadScramble);
elements.lastOkButton.addEventListener('click', () => updateLatestSolvePenalty('ok'));
elements.lastPlusTwoButton.addEventListener('click', () => updateLatestSolvePenalty('+2'));
elements.lastDnfButton.addEventListener('click', () => updateLatestSolvePenalty('dnf'));
elements.lastDeleteButton.addEventListener('click', deleteLatestSolve);
elements.scrambleLockButton.addEventListener('click', toggleScrambleLock);
elements.timerSettingsButton.addEventListener('click', openTimerSettingsDialog);
elements.hideTimerToggle.addEventListener('change', updateTimerSettingsFromControls);
elements.timerFreezeSelect.addEventListener('change', updateTimerSettingsFromControls);
elements.confirmDeleteToggle.addEventListener('change', updateTimerSettingsFromControls);
elements.algorithmTrainerButton.addEventListener('click', openAlgorithmTrainerDialog);
elements.algorithmTrainerSet.addEventListener('change', () => {
  algorithmTrainerSet = elements.algorithmTrainerSet.value || 'pll';
  if (!Object.hasOwn(algorithmTrainerSetLabels, algorithmTrainerSet)) algorithmTrainerSet = 'pll';
  localStorage.setItem('trainTimer.algorithmTrainerSet', algorithmTrainerSet);
  chooseNextAlgorithmTrainerCase();
});
elements.algorithmTrainerFocus.addEventListener('change', () => {
  algorithmTrainerFocus = elements.algorithmTrainerFocus.value || 'all';
  if (!Object.hasOwn(algorithmTrainerFocusLabels, algorithmTrainerFocus)) algorithmTrainerFocus = 'all';
  localStorage.setItem('trainTimer.algorithmTrainerFocus', algorithmTrainerFocus);
  chooseNextAlgorithmTrainerCase();
});
elements.algorithmTrainerGroupFilter.addEventListener('change', () => {
  algorithmTrainerGroup = elements.algorithmTrainerGroupFilter.value || 'all';
  localStorage.setItem('trainTimer.algorithmTrainerGroup', algorithmTrainerGroup);
  chooseNextAlgorithmTrainerCase();
});
elements.algorithmTrainerSearch.addEventListener('input', () => {
  algorithmTrainerSearch = elements.algorithmTrainerSearch.value.trim();
  localStorage.setItem('trainTimer.algorithmTrainerSearch', algorithmTrainerSearch);
  chooseNextAlgorithmTrainerCase({ renderOnly: true });
});
elements.algorithmTrainerNextButton.addEventListener('click', chooseNextAlgorithmTrainerCase);
elements.algorithmTrainerPassButton.addEventListener('click', () => recordAlgorithmTrainerResult(true));
elements.algorithmTrainerFailButton.addEventListener('click', () => recordAlgorithmTrainerResult(false));
elements.algorithmTrainerTimerButton.addEventListener('click', toggleAlgorithmTrainerTimer);
elements.algorithmTrainerStarButton.addEventListener('click', toggleAlgorithmTrainerStarred);
elements.algorithmTrainerCopySetupButton.addEventListener('click', copyAlgorithmTrainerSetup);
elements.algorithmTrainerApplySetupButton.addEventListener('click', applyAlgorithmTrainerSetupToTimer);
elements.algorithmTrainerAddButton.addEventListener('click', addAlgorithmTrainerCustomCase);
elements.algorithmTrainerEditButton.addEventListener('click', editAlgorithmTrainerCustomCase);
elements.algorithmTrainerDeleteButton.addEventListener('click', deleteAlgorithmTrainerCustomCase);
elements.algorithmTrainerExportButton.addEventListener('click', exportAlgorithmTrainerCustomCases);
elements.algorithmTrainerImportButton.addEventListener('click', () => elements.algorithmTrainerImportFile.click());
elements.algorithmTrainerImportFile.addEventListener('change', importAlgorithmTrainerCustomCases);
elements.algorithmTrainerResetButton.addEventListener('click', resetAlgorithmTrainerStats);
elements.bluetoothButton.addEventListener('click', () => connectBluetoothCube());
elements.bluetoothAnyButton.addEventListener('click', () => connectBluetoothCube({ compatibilityMode: true }));
elements.bluetoothReconnectButton.addEventListener('click', reconnectBluetoothCube);
elements.bluetoothDisconnectButton.addEventListener('click', disconnectBluetoothDevice);
elements.bluetoothLogButton.addEventListener('click', openBluetoothLogDialog);
elements.sessionSelect.addEventListener('change', switchSession);
elements.newSessionButton.addEventListener('click', createSession);
elements.duplicateSessionButton.addEventListener('click', duplicateCurrentSession);
elements.mergeSessionButton.addEventListener('click', openMergeSessionDialog);
elements.renameSessionButton.addEventListener('click', renameSession);
elements.deleteSessionButton.addEventListener('click', deleteCurrentSession);
elements.scramblePuzzleSelect.addEventListener('change', changeScramblePuzzle);
elements.manualEntryButton.addEventListener('click', openManualEntryDialog);
elements.exportButton.addEventListener('click', openExportDialog);
elements.exportSessionJsonButton.addEventListener('click', () => exportSolves('json', 'session'));
elements.exportSessionCsvButton.addEventListener('click', () => exportSolves('csv', 'session'));
elements.exportSessionCstimerButton.addEventListener('click', () => exportSolves('cstimer', 'session'));
elements.exportSessionCstimerJsonButton.addEventListener('click', () => exportSolves('cstimer-json', 'session'));
elements.exportSelectedJsonButton.addEventListener('click', () => exportSelectedSolves('json'));
elements.exportSelectedCsvButton.addEventListener('click', () => exportSelectedSolves('csv'));
elements.exportSelectedCstimerButton.addEventListener('click', () => exportSelectedSolves('cstimer'));
elements.exportSelectedCstimerJsonButton.addEventListener('click', () => exportSelectedSolves('cstimer-json'));
elements.exportAllJsonButton.addEventListener('click', () => exportSolves('json', 'all'));
elements.exportAllCsvButton.addEventListener('click', () => exportSolves('csv', 'all'));
elements.exportAllCstimerButton.addEventListener('click', () => exportSolves('cstimer', 'all'));
elements.exportAllCstimerJsonButton.addEventListener('click', () => exportSolves('cstimer-json', 'all'));
elements.importButton.addEventListener('click', () => elements.importFile.click());
elements.importFile.addEventListener('change', importSolves);
elements.appendImportButton.addEventListener('click', () => confirmImport('append'));
elements.replaceImportButton.addEventListener('click', () => confirmImport('replace'));
elements.sessionGoalButton.addEventListener('click', openSessionGoalPrompt);
elements.sessionGoalButton.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.stopPropagation();
  openSessionGoalPrompt();
});
elements.statsDetailButton.addEventListener('click', openStatsDialog);
elements.statsChartModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.statsChartMode || 'single';
    if (!statsChartModes.has(mode) || mode === statsChartMode) return;
    statsChartMode = mode;
    localStorage.setItem('trainTimer.statsChartMode', statsChartMode);
    renderStatsDialog();
  });
});
elements.manageSolvesButton.addEventListener('click', openAllSolvesDialog);
elements.selectedStatsButton.addEventListener('click', openSelectedStatsDialog);
elements.markSelectedButton.addEventListener('click', openMarkPenaltyDialog);
elements.puzzleSelectedButton.addEventListener('click', openPuzzleSolvesDialog);
elements.tagSelectedButton.addEventListener('click', openTagSolvesDialog);
elements.commentSelectedButton.addEventListener('click', openCommentSolvesDialog);
elements.moveSelectedButton.addEventListener('click', openMoveSolvesDialog);
elements.deleteSelectedButton.addEventListener('click', deleteSelectedSolves);
elements.undoDeleteButton.addEventListener('click', undoLastDelete);
elements.clearAllButton.addEventListener('click', clearAllSolves);
elements.historyActionsMenu?.addEventListener('click', closeHistoryMenuAfterAction);
elements.allSelectedStatsButton.addEventListener('click', openSelectedStatsDialog);
elements.allMarkSelectedButton.addEventListener('click', openMarkPenaltyDialog);
elements.allPuzzleSelectedButton.addEventListener('click', openPuzzleSolvesDialog);
elements.allTagSelectedButton.addEventListener('click', openTagSolvesDialog);
elements.allCommentSelectedButton.addEventListener('click', openCommentSolvesDialog);
elements.allMoveSelectedButton.addEventListener('click', openMoveSolvesDialog);
elements.allDeleteSelectedButton.addEventListener('click', deleteSelectedSolves);
elements.allExportJsonButton.addEventListener('click', () => exportListedSolves('json'));
elements.allExportCsvButton.addEventListener('click', () => exportListedSolves('csv'));
elements.allExportCstimerButton.addEventListener('click', () => exportListedSolves('cstimer'));
elements.allExportCstimerJsonButton.addEventListener('click', () => exportListedSolves('cstimer-json'));
elements.confirmMarkPenaltyButton.addEventListener('click', markSelectedPenalty);
elements.confirmPuzzleButton.addEventListener('click', saveSelectedPuzzle);
elements.confirmMoveButton.addEventListener('click', moveSelectedSolves);
elements.confirmMergeSessionButton.addEventListener('click', mergeCurrentSession);
elements.confirmTagButton.addEventListener('click', saveSelectedTags);
elements.confirmCommentButton.addEventListener('click', saveSelectedComment);
elements.prevSolveButton.addEventListener('click', () => navigateSolveDetail(-1));
elements.nextSolveDetailButton.addEventListener('click', () => navigateSolveDetail(1));
elements.solveReplayButton.addEventListener('click', toggleSolveReplay);
elements.copySolveSummaryButton.addEventListener('click', copySelectedSolveSummary);
elements.copyScrambleButton.addEventListener('click', copySelectedScramble);
elements.copyStatsSummaryButton.addEventListener('click', copyStatsSummary);
elements.saveTimeButton.addEventListener('click', saveSolveDetails);
elements.deleteSolveDetailButton.addEventListener('click', deleteCurrentDetailSolve);
elements.saveManualEntryButton.addEventListener('click', saveManualEntry);
elements.copyAverageSummaryButton.addEventListener('click', copyAverageSummary);
elements.clearBluetoothLogButton.addEventListener('click', clearBluetoothLog);
elements.copyBluetoothLogButton.addEventListener('click', copyBluetoothLog);
elements.exportBluetoothLogButton.addEventListener('click', exportBluetoothLog);
elements.solveDialog.addEventListener('close', () => {
  currentDetailSolveId = null;
  stopSolveReplay();
});
elements.averageDialog.addEventListener('close', () => {
  currentAverageDetail = null;
});
elements.statsDialog.addEventListener('close', () => {
  statsScope = 'session';
});
elements.algorithmTrainerDialog.addEventListener('keydown', handleAlgorithmTrainerKeyDown);
elements.algorithmTrainerDialog.addEventListener('close', cancelAlgorithmTrainerTimer);
elements.allSolvesDialog.addEventListener('close', () => {
  selectedSolveIds.clear();
  render();
});
elements.importDialog.addEventListener('close', () => {
  pendingImportPreview = null;
});
elements.selectAllSolves?.addEventListener('change', toggleSelectAllSolves);
elements.selectAllSessionSolves.addEventListener('change', toggleSelectAllSessionSolves);
elements.allSolvesSearch.addEventListener('input', handleAllSolvesFilterChange);
elements.allSolvesFromDate.addEventListener('change', handleAllSolvesFilterChange);
elements.allSolvesToDate.addEventListener('change', handleAllSolvesFilterChange);
elements.allDateTodayButton.addEventListener('click', () => setAllSolvesDatePreset('today'));
elements.allDateWeekButton.addEventListener('click', () => setAllSolvesDatePreset('week'));
elements.allDateMonthButton.addEventListener('click', () => setAllSolvesDatePreset('month'));
elements.allDateAllButton.addEventListener('click', () => setAllSolvesDatePreset('all'));
elements.allSolvesRecordFilter.addEventListener('change', handleAllSolvesFilterChange);
elements.allSolvesPuzzleFilter.addEventListener('change', handleAllSolvesFilterChange);
elements.allSolvesPenaltyFilter.addEventListener('change', handleAllSolvesFilterChange);
elements.allSolvesSourceFilter.addEventListener('change', handleAllSolvesFilterChange);
elements.allSolvesTagFilter.addEventListener('change', handleAllSolvesFilterChange);
elements.allSessionsToggle.addEventListener('change', toggleAllSessions);
elements.allSolvesSortBy.addEventListener('change', () => {
  resetAllSolvesRenderWindow();
  renderAllSolvesDialog();
});
elements.allSolvesSortDirection.addEventListener('change', () => {
  resetAllSolvesRenderWindow();
  renderAllSolvesDialog();
});
elements.clearAllSolvesFiltersButton.addEventListener('click', clearAllSolvesFilters);
elements.allCopyListButton.addEventListener('click', copyListedSolves);
elements.allListedStatsButton.addEventListener('click', openListedStatsDialog);
elements.historyRows.addEventListener('change', handleHistoryChange);
elements.historyRows.addEventListener('click', handleHistoryClick);
elements.historyRows.addEventListener('scroll', updateHistoryRowsMask, { passive: true });
elements.historySortButtons.forEach((button) => {
  button.addEventListener('click', () => cycleHistorySort(button.dataset.historySort || ''));
});
elements.allSolvesRows.addEventListener('change', handleHistoryChange);
elements.allSolvesRows.addEventListener('click', handleAllSolvesRowsClick);
elements.allSolvesTable.addEventListener('scroll', handleAllSolvesTableScroll, { passive: true });
elements.statsRecordList.addEventListener('click', handleStatsRecordClick);
elements.sessionOverviewList.addEventListener('click', handleSessionOverviewClick);
window.addEventListener('resize', updateHistoryRowsMask);
window.addEventListener('resize', invalidateTimerDisplayFit);

window.__trainTimerDebug = {
  emitBluetoothText(text, uuid = '0000fff1-0000-1000-8000-00805f9b34fb') {
    const bytes = new TextEncoder().encode(text);
    processBluetoothPacket(uuid, new DataView(bytes.buffer), '模拟蓝牙魔方');
  },
  emitBatteryLevel(level) {
    const bytes = Uint8Array.from([Number(level)]);
    processBluetoothPacket(bluetoothBatteryLevelUuid, new DataView(bytes.buffer), '模拟蓝牙魔方');
  },
  emitBluetoothBytes(bytes, uuid = bluetoothGoCubeReadUuid) {
    const packet = Uint8Array.from(bytes);
    processBluetoothPacket(uuid, new DataView(packet.buffer), '模拟蓝牙魔方');
  },
  setBluetoothGyroForTest(quaternion = { x: 0.2, y: -0.35, z: 0.1, w: 0.91 }, velocity = { x: 1, y: -2, z: 0 }) {
    updateBluetoothGyro({ quaternion, velocity });
    return this.state();
  },
  setBluetoothFaceletsForTest(facelets = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB') {
    updateBluetoothPhysicalState({ facelets });
    return this.state();
  },
  addBluetoothMovesForTest(moves) {
    addBluetoothMoves(Array.isArray(moves) ? moves : String(moves || '').trim().split(/\s+/).filter(Boolean), 'debug', 'debug', '模拟蓝牙魔方');
    return this.state();
  },
  setScrambleForTest(text) {
    scramble = { scramble: String(text || ''), source: 'debug', puzzle: 'three' };
    resetBluetoothSolveTracking();
    resetScrambleGuide();
    resetBluetoothNextSolveGesture();
    renderScramble();
    renderTimer();
    return this.state();
  },
  setStateForTest(nextState) {
    appState = String(nextState || appState);
    render();
    return this.state();
  },
  setBluetoothDeviceForTest(name = '模拟蓝牙魔方') {
    bluetoothDevice = { name: String(name || '模拟蓝牙魔方'), id: 'debug-device', gatt: { connected: true } };
    setBluetoothDeviceNameStatus('已连接', 'debug');
    renderBluetoothFeed();
    return this.state();
  },
  state() {
    return {
      appState,
      bluetoothMoveCount: bluetoothMoves.length,
      bluetoothMoves: bluetoothMoveSequence(),
      bluetoothMetadata: bluetoothSolveMetadata(),
      bluetoothGyro,
      bluetoothPhysicalFacelets,
      bluetoothReconnectDevices: bluetoothReconnectDevices.length,
      bluetoothSolved,
      bluetoothState: elements.bluetoothStateMeta.textContent,
      scrambleGuide: {
        supported: scrambleGuideSupported,
        completed: scrambleGuideCompleted,
        moves: scrambleGuideMoves,
        inputMoves: scrambleGuideInputMoves,
        correctPrefix: scrambleGuideCorrectPrefix,
        partialIndex: scrambleGuidePartialIndex,
        errorIndex: scrambleGuideErrorIndex,
        errorMove: scrambleGuideErrorMove,
        correctionMoves: scrambleGuideCorrectionMoves(),
        correction: scrambleGuideCorrectionText(),
      },
      bluetoothGan: {
        mac: bluetoothGanMac,
        protocol: bluetoothGanSession?.protocol || '',
        label: bluetoothGanSession?.label || '',
        moveCounter: bluetoothGanLastMoveCounter,
      },
      bluetoothAvailability: bluetoothAvailability(),
      bluetoothRequest: bluetoothRequestSummary(bluetoothRequestOptions(false)),
      bluetoothOptionalServices,
      scrambleLocked,
    };
  },
};

document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
document.addEventListener('click', closeHistoryMenuOnOutsideClick);

initBluetoothCube3d();
await bootstrap();

async function bootstrap() {
  try {
    const data = await getJson(`/api/bootstrap?${new URLSearchParams({ puzzle: scramblePuzzle }).toString()}`);
    scramble = data.scramble;
    solves = data.solves;
    sessions = data.sessions;
    if (!sessions.some((session) => session.id === currentSessionId)) currentSessionId = 'default';
    applyCurrentSessionPuzzle(scramble?.puzzle || scramblePuzzle);
    if ((scramble?.puzzle || 'three') !== scramblePuzzle) {
      const nextScramble = await postJson('/api/scramble', { puzzle: scramblePuzzle });
      scramble = nextScramble.scramble;
    }
    resetScrambleGuide();
    elements.historyPath.textContent = data.historyPath;
    appState = 'ready';
    render();
    setBluetoothConnectedState(false);
    await refreshBluetoothReconnectDevices();
    void autoReconnectBluetoothCube();
  } catch (error) {
    appState = 'error';
    elements.statusText.textContent = '无法连接本地服务';
    elements.statusText.classList.add('error');
    elements.timerHint.textContent = error.message;
  }
}

function applyCurrentSessionPuzzle(fallback = scramblePuzzle || 'three') {
  scramblePuzzle = sessionPuzzleForId(currentSessionId, fallback);
  localStorage.setItem('trainTimer.scramblePuzzle', scramblePuzzle);
  return scramblePuzzle;
}

function sessionPuzzleForId(sessionId, fallback = 'three') {
  const session = sessions.find((item) => item.id === sessionId);
  return session?.scramblePuzzle || fallback || 'three';
}

function updateLocalSession(sessionId, updates) {
  sessions = sessions.map((session) => (session.id === sessionId ? { ...session, ...updates } : session));
}

function scrambleChangeLocked() {
  return scrambleLocked || appState === 'timing' || appState === 'inspection' || appState === 'hold' || appState === 'saving';
}

function handleKeyDown(event) {
  if (shouldIgnoreTimerKey(event)) return;

  if (appState === 'done' && handleDoneQuickAction(event)) return;

  if (event.code === 'KeyL' && canToggleScrambleLock()) {
    event.preventDefault();
    toggleScrambleLock();
    return;
  }

  if (handleGlobalShortcut(event)) return;

  if (event.code !== 'Space' && appState === 'timing') {
    event.preventDefault();
    finishTiming();
    return;
  }

  if (event.code !== 'Space') return;
  event.preventDefault();
  if (event.repeat) return;

  if (appState === 'ready') {
    if (inspectionEnabled) {
      startInspection();
    } else {
      startHold();
    }
  } else if (appState === 'inspection') {
    startHold();
  } else if (appState === 'done') {
    nextSolve();
  } else if (appState === 'timing') {
    finishTiming();
  }
}

function handleGlobalShortcut(event) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (['timing', 'inspection', 'hold', 'saving', 'loading', 'error'].includes(appState)) return false;

  if (event.code === 'KeyN') {
    event.preventDefault();
    void nextSolve();
    return true;
  }

  if (event.code === 'KeyR' && !scrambleChangeLocked()) {
    event.preventDefault();
    void loadScramble();
    return true;
  }

  if (event.code === 'KeyC' && scramble?.scramble) {
    event.preventDefault();
    void copyCurrentScramble();
    return true;
  }

  if (event.code === 'KeyT') {
    event.preventDefault();
    openAlgorithmTrainerDialog();
    return true;
  }

  if (event.code === 'KeyI' && !elements.inspectionToggle.disabled) {
    event.preventDefault();
    setInspectionEnabled(!inspectionEnabled);
    return true;
  }

  if (event.code === 'KeyS' && filteredSolves().length > 0) {
    event.preventDefault();
    openStatsDialog();
    return true;
  }

  if (event.code === 'KeyA' && solves.length > 0) {
    event.preventDefault();
    openAllSolvesDialog();
    return true;
  }

  if (event.code === 'KeyP') {
    event.preventDefault();
    openTimerSettingsDialog();
    return true;
  }

  return false;
}

function setInspectionEnabled(enabled) {
  inspectionEnabled = Boolean(enabled);
  elements.inspectionToggle.checked = inspectionEnabled;
  localStorage.setItem('trainTimer.inspection', inspectionEnabled ? '1' : '0');
  render();
}

function handleDoneQuickAction(event) {
  const actions = {
    KeyO: () => updateLatestSolvePenalty('ok'),
    Digit2: () => updateLatestSolvePenalty('+2'),
    Numpad2: () => updateLatestSolvePenalty('+2'),
    KeyD: () => updateLatestSolvePenalty('dnf'),
    Backspace: deleteLatestSolve,
    Delete: deleteLatestSolve,
  };
  const action = actions[event.code];
  if (!action) return false;
  event.preventDefault();
  action();
  return true;
}

function handleKeyUp(event) {
  if (shouldIgnoreTimerKey(event)) return;

  if (event.code !== 'Space') return;
  event.preventDefault();

  if (appState !== 'hold') return;
  if (performance.now() - holdStartedAt >= holdToStartMs) {
    startTiming();
  } else {
    cancelHold();
  }
}

function startInspection(options = {}) {
  appState = 'inspection';
  inspectionStartedAt = performance.now();
  activeInspectionUsed = true;
  inspectionBluetoothStartBlockedUntil = options.bluetoothGuardMs
    ? inspectionStartedAt + options.bluetoothGuardMs
    : 0;
  reminded = new Set();
  activePenalty = 'ok';
  triggerInspectionEntryAnimation();
  cancelAnimationFrame(inspectionFrame);
  inspectionTick();
}

function triggerInspectionEntryAnimation() {
  document.body.dataset.inspectionEnter = 'true';
  window.clearTimeout(inspectionEntryTimer);
  inspectionEntryTimer = window.setTimeout(() => {
    delete document.body.dataset.inspectionEnter;
    inspectionEntryTimer = 0;
  }, 520);
}

function inspectionTick() {
  if (appState !== 'inspection') return;

  const elapsed = (performance.now() - inspectionStartedAt) / 1000;
  const elapsedFloor = Math.floor(elapsed);
  if (reminderSeconds.has(elapsedFloor) && !reminded.has(elapsedFloor)) {
    reminded.add(elapsedFloor);
    beep();
  }

  renderTimer();
  inspectionFrame = requestAnimationFrame(inspectionTick);
}

function startHold() {
  holdReturnState = appState === 'inspection' ? 'inspection' : 'ready';
  cancelAnimationFrame(inspectionFrame);
  cancelAnimationFrame(holdFrame);
  appState = 'hold';
  holdStartedAt = performance.now();
  holdConfirmed = false;
  holdTick();
}

function holdTick() {
  if (appState !== 'hold') return;
  const nextConfirmed = performance.now() - holdStartedAt >= holdToStartMs;
  if (nextConfirmed !== holdConfirmed) {
    holdConfirmed = nextConfirmed;
    renderTimer();
  } else if (!holdConfirmed) {
    renderTimer();
  }
  holdFrame = requestAnimationFrame(holdTick);
}

function cancelHold() {
  cancelAnimationFrame(holdFrame);
  appState = holdReturnState;
  holdConfirmed = false;
  renderTimer();
  if (appState === 'inspection') inspectionTick();
}

function startTiming() {
  clearBluetoothNextSolveGestureCandidate();
  delete document.body.dataset.inspectionEnter;
  window.clearTimeout(inspectionEntryTimer);
  inspectionEntryTimer = 0;
  cancelAnimationFrame(inspectionFrame);
  cancelAnimationFrame(holdFrame);
  activePenalty = currentInspectionPenalty();
  finishSource = 'manual';
  appState = 'timing';
  startedAt = performance.now();
  armBluetoothSolveTracking();
  tickTimer();
}

function tickTimer() {
  if (appState !== 'timing') return;
  renderTimer();
  timerFrame = requestAnimationFrame(tickTimer);
}

async function finishTiming(options = {}) {
  if (appState !== 'timing') return;
  cancelAnimationFrame(timerFrame);
  const finishedAt = Number.isFinite(options.finishedAt) ? options.finishedAt : performance.now();
  const durationMs = Math.max(0, finishedAt - startedAt);
  appState = 'saving';
  setTimerDisplayText(formatTime(durationMs));
  elements.statusText.textContent = finishSource === 'bluetooth' ? '蓝牙复原' : '保存中';
  elements.timerHint.textContent = finishSource === 'bluetooth' ? '检测到已复原，正在写入成绩' : '正在写入成绩';
  await nextPaintOrTimeout();
  render();
  const bluetoothMetadata = bluetoothSolveMetadata();
  const bluetoothMovesForSave = bluetoothMoveSequence();
  const bluetoothMoveLogForSave = bluetoothMoveRecordSequence();
  const cfopStages = cfopStagesForSave({
    scramble: scramble.scramble,
    scramblePuzzle: scramble.puzzle || scramblePuzzle,
    bluetoothMoves: bluetoothMovesForSave,
    bluetoothMoveLog: bluetoothMoveLogForSave,
  });

  const data = await postJson('/api/solves', {
    durationMs,
    scramble: scramble.scramble,
    scrambleSource: scramble.source,
    scramblePuzzle: scramble.puzzle || scramblePuzzle,
    inspectionEnabled: activeInspectionUsed,
    sessionId: currentSessionId,
    penalty: activePenalty,
    timerSource: finishSource,
    bluetoothMoves: bluetoothMovesForSave,
    bluetoothMoveLog: bluetoothMoveLogForSave,
    cfopStages,
    bluetoothDeviceName: bluetoothMetadata.deviceName,
    bluetoothProtocols: bluetoothMetadata.protocols,
    bluetoothSources: bluetoothMetadata.sources,
  });

  solves = data.solves;
  selectedSolveIds.clear();
  finishSource = 'manual';
  appState = 'done';
  render();
  showPbToastForSolve(data.solve);
}

function nextPaintOrTimeout() {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(resolve, 35);
    requestAnimationFrame(() => {
      window.clearTimeout(timeoutId);
      resolve();
    });
  });
}

function showPbToastForSolve(savedSolve) {
  if (!savedSolve?.id || !elements.pbToast) return;
  const sessionSolves = solvesForSession(savedSolve.sessionId);
  const solveIndex = sessionSolves.findIndex((solve) => solve.id === savedSolve.id);
  if (solveIndex < 0) return;
  const marks = recordMarksAt(sessionSolves, solveIndex)
    .filter((mark) => ['single', 'mo3', 'ao5', 'ao12', 'ao50', 'ao100'].includes(mark.type));
  if (marks.length === 0) return;
  const title = marks.length === 1 ? marks[0].label : `${marks[0].label} +${marks.length - 1}`;
  const meta = marks.map((mark) => `${mark.label} ${timeOrDash(mark.value)}`).join(' · ');
  showPbToast(title, meta);
}

function showPbToast(title, meta) {
  if (!elements.pbToast) return;
  window.clearTimeout(pbToastTimer);
  elements.pbToastTitle.textContent = title;
  elements.pbToastMeta.textContent = meta;
  elements.pbToast.hidden = false;
  elements.pbToast.classList.remove('visible');
  requestAnimationFrame(() => elements.pbToast.classList.add('visible'));
  pbToastTimer = window.setTimeout(() => {
    elements.pbToast.classList.remove('visible');
    pbToastTimer = window.setTimeout(() => {
      elements.pbToast.hidden = true;
    }, 260);
  }, 3600);
}

async function nextSolve() {
  clearBluetoothNextSolveGestureCandidate();
  if (scrambleLocked && scramble?.scramble) {
    resetBluetoothSolveTracking();
    resetScrambleGuide();
  } else {
    await loadScramble();
  }
  activePenalty = 'ok';
  inspectionStartedAt = 0;
  activeInspectionUsed = false;
  inspectionBluetoothStartBlockedUntil = 0;
  appState = 'ready';
  render();
}

async function changeScramblePuzzle() {
  const nextPuzzle = elements.scramblePuzzleSelect.value || 'three';
  if (nextPuzzle === scramblePuzzle) return;
  const previousPuzzle = sessionPuzzleForId(currentSessionId, scramblePuzzle);
  scramblePuzzle = nextPuzzle;
  localStorage.setItem('trainTimer.scramblePuzzle', scramblePuzzle);
  updateLocalSession(currentSessionId, { scramblePuzzle });

  try {
    const data = await requestJson(`/api/sessions/${encodeURIComponent(currentSessionId)}`, {
      method: 'PATCH',
      body: { scramblePuzzle },
    });
    sessions = data.sessions;
  } catch (error) {
    scramblePuzzle = previousPuzzle;
    localStorage.setItem('trainTimer.scramblePuzzle', scramblePuzzle);
    updateLocalSession(currentSessionId, { scramblePuzzle });
    alert(`保存打乱类型失败：${error.message}`);
    render();
    return;
  }

  if (scrambleChangeLocked()) {
    render();
    return;
  }
  await loadScramble();
}

async function openSessionGoalPrompt() {
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  if (!currentSession) return;

  const currentTarget = sessionTargetCountForId(currentSessionId);
  const input = prompt(
    `设置“${currentSession.name}”的本会话目标次数。留空可清除目标。`,
    currentTarget == null ? '' : String(currentTarget),
  );
  if (input === null) return;

  const trimmed = input.trim();
  const nextTarget = trimmed === '' ? null : normalizeSessionTargetCount(trimmed);
  if (trimmed !== '' && nextTarget == null) {
    alert('请输入 1 到 9999 之间的整数。');
    return;
  }

  const previousTarget = currentTarget;
  updateLocalSession(currentSessionId, { targetCount: nextTarget });
  renderStats();

  try {
    const data = await requestJson(`/api/sessions/${encodeURIComponent(currentSessionId)}`, {
      method: 'PATCH',
      body: { targetCount: nextTarget },
    });
    sessions = data.sessions;
    render();
  } catch (error) {
    updateLocalSession(currentSessionId, { targetCount: previousTarget });
    renderStats();
    alert(`保存会话目标失败：${error.message}`);
  }
}

function sessionTargetCountForId(sessionId) {
  const session = sessions.find((item) => item.id === sessionId);
  return normalizeSessionTargetCount(session?.targetCount);
}

function normalizeSessionTargetCount(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 9999) return null;
  return number;
}

function canToggleScrambleLock() {
  return Boolean(scramble?.scramble) && !['timing', 'inspection', 'hold', 'saving'].includes(appState);
}

async function toggleScrambleLock() {
  if (!canToggleScrambleLock()) return;
  scrambleLocked = !scrambleLocked;
  localStorage.setItem('trainTimer.scrambleLocked', scrambleLocked ? '1' : '0');
  render();
  if (!scrambleLocked && scramble && (scramble.puzzle || 'three') !== scramblePuzzle) {
    await loadScramble();
  }
}

async function loadScramble(options = {}) {
  if (scrambleLocked && !options.force) {
    render();
    return;
  }
  applyCurrentSessionPuzzle();
  clearBluetoothNextSolveGestureCandidate();
  elements.scrambleButton.disabled = true;
  try {
    const data = await postJson('/api/scramble', { puzzle: scramblePuzzle });
    scramble = data.scramble;
    scramblePuzzle = scramble.puzzle || sessionPuzzleForId(currentSessionId, scramblePuzzle);
    localStorage.setItem('trainTimer.scramblePuzzle', scramblePuzzle);
    activeInspectionUsed = false;
    inspectionStartedAt = 0;
    inspectionBluetoothStartBlockedUntil = 0;
    resetBluetoothSolveTracking();
    resetScrambleGuide();
    render();
  } finally {
    elements.scrambleButton.disabled = scrambleLocked || ['timing', 'inspection', 'hold', 'saving'].includes(appState);
  }
}

async function copyCurrentScramble() {
  const scrambleText = String(scramble?.scramble || '').trim();
  if (!scrambleText) return;
  try {
    await navigator.clipboard.writeText(scrambleText);
    showTimerHintTemporarily('已复制当前打乱');
  } catch {
    showTimerHintTemporarily('复制打乱失败');
  }
}

function showTimerHintTemporarily(text, durationMs = 900) {
  const stateAtStart = appState;
  elements.timerHint.textContent = text;
  window.clearTimeout(scrambleCopyHintTimer);
  scrambleCopyHintTimer = window.setTimeout(() => {
    scrambleCopyHintTimer = 0;
    if (appState === stateAtStart) renderTimer();
  }, durationMs);
}

async function updateSolvePenalty(id, penalty) {
  const solve = solves.find((item) => item.id === id);
  const nextPenalty = ['ok', '+2', 'dnf'].includes(penalty) ? penalty : 'ok';
  if (!solve || solve.penalty === nextPenalty) {
    render();
    return;
  }

  const snapshot = createHistorySnapshot('mark-penalty', `成绩 ${displaySolveTime(solve)}`);
  try {
    const data = await requestJson(`/api/solves/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { penalty: nextPenalty },
    });
    solves = data.solves;
    if (data.sessions) sessions = data.sessions;
    pendingDeletedSolves = [];
    pendingImportSnapshot = snapshot;
    renderSolveDialog();
    render();
  } catch (error) {
    alert(`标记失败：${error.message}`);
    render();
  }
}

async function updateLatestSolvePenalty(penalty) {
  const solve = latestSessionSolve();
  if (!solve) return;
  await updateSolvePenalty(solve.id, penalty);
}

async function deleteSolve(id) {
  const solve = solves.find((item) => item.id === id);
  if (!solve || !confirmSolveDeletion(`删除成绩 ${displaySolveTime(solve)}？`)) return;
  const data = await requestJson(`/api/solves/${encodeURIComponent(id)}`, { method: 'DELETE' });
  stageDeletedSolves([solve]);
  solves = data.solves;
  selectedSolveIds.delete(id);
  if (currentDetailSolveId === id) elements.solveDialog.close();
  render();
}

async function deleteCurrentDetailSolve() {
  if (!currentDetailSolveId) return;
  await deleteSolve(currentDetailSolveId);
}

async function deleteLatestSolve() {
  const solve = latestSessionSolve();
  if (!solve || !confirmSolveDeletion(`删除上一把 ${displaySolveTime(solve)}？`)) return;
  const data = await requestJson(`/api/solves/${encodeURIComponent(solve.id)}`, { method: 'DELETE' });
  stageDeletedSolves([solve]);
  solves = data.solves;
  selectedSolveIds.delete(solve.id);
  if (currentDetailSolveId === solve.id) elements.solveDialog.close();
  if (appState === 'done') appState = 'ready';
  render();
}

async function deleteSelectedSolves() {
  const ids = [...selectedSolveIds];
  if (ids.length === 0) return;
  if (!confirmSolveDeletion(`删除选中的 ${ids.length} 条成绩？`)) return;
  const deleted = solves.filter((solve) => selectedSolveIds.has(solve.id));
  const data = await postJson('/api/solves/delete', { ids });
  stageDeletedSolves(deleted);
  solves = data.solves;
  selectedSolveIds.clear();
  if (ids.includes(currentDetailSolveId)) elements.solveDialog.close();
  render();
}

function openMarkPenaltyDialog() {
  if (selectedSolveIds.size === 0) return;
  if (!elements.markPenaltyDialog.open) elements.markPenaltyDialog.showModal();
  renderMarkPenaltyDialog();
}

async function markSelectedPenalty() {
  const ids = [...selectedSolveIds];
  const penalty = elements.markPenaltySelect.value;
  if (ids.length === 0) return;
  const snapshot = createHistorySnapshot('mark-penalty', `${ids.length} 条成绩`);

  elements.confirmMarkPenaltyButton.disabled = true;
  try {
    const data = await postJson('/api/solves/update', { ids, penalty });
    solves = data.solves;
    if (data.sessions) sessions = data.sessions;
    pendingDeletedSolves = [];
    pendingImportSnapshot = snapshot;
    selectedSolveIds.clear();
    renderSolveDialog();
    elements.markPenaltyDialog.close();
    render();
  } catch (error) {
    alert(`标记失败：${error.message}`);
    renderMarkPenaltyDialog();
  } finally {
    elements.confirmMarkPenaltyButton.disabled = false;
  }
}

function openPuzzleSolvesDialog() {
  if (selectedSolveIds.size === 0) return;
  if (!elements.puzzleSolvesDialog.open) elements.puzzleSolvesDialog.showModal();
  renderPuzzleSolvesDialog();
}

async function saveSelectedPuzzle() {
  const ids = [...selectedSolveIds];
  const scramblePuzzle = elements.puzzleSolvesSelect.value || 'three';
  if (ids.length === 0) return;
  const snapshot = createHistorySnapshot('puzzle-solves', `${ids.length} 条成绩`);

  elements.confirmPuzzleButton.disabled = true;
  try {
    const data = await postJson('/api/solves/update', { ids, scramblePuzzle });
    solves = data.solves;
    if (data.sessions) sessions = data.sessions;
    pendingDeletedSolves = [];
    pendingImportSnapshot = snapshot;
    selectedSolveIds.clear();
    renderSolveDialog();
    elements.puzzleSolvesDialog.close();
    render();
  } catch (error) {
    alert(`保存类型失败：${error.message}`);
    renderPuzzleSolvesDialog();
  } finally {
    elements.confirmPuzzleButton.disabled = false;
  }
}

function openTagSolvesDialog() {
  if (selectedSolveIds.size === 0) return;
  if (!elements.tagSolvesDialog.open) elements.tagSolvesDialog.showModal();
  renderTagSolvesDialog();
  elements.tagSolvesInput.focus();
}

async function saveSelectedTags() {
  const ids = [...selectedSolveIds];
  if (ids.length === 0) return;
  const snapshot = createHistorySnapshot('tag-solves', `${ids.length} 条成绩`);

  elements.confirmTagButton.disabled = true;
  try {
    const data = await postJson('/api/solves/update', {
      ids,
      tags: parseTagsInput(elements.tagSolvesInput.value),
    });
    solves = data.solves;
    if (data.sessions) sessions = data.sessions;
    pendingDeletedSolves = [];
    pendingImportSnapshot = snapshot;
    selectedSolveIds.clear();
    renderSolveDialog();
    elements.tagSolvesDialog.close();
    render();
  } catch (error) {
    alert(`保存标签失败：${error.message}`);
    renderTagSolvesDialog();
  } finally {
    elements.confirmTagButton.disabled = false;
  }
}

function openCommentSolvesDialog() {
  if (selectedSolveIds.size === 0) return;
  if (!elements.commentSolvesDialog.open) elements.commentSolvesDialog.showModal();
  renderCommentSolvesDialog();
  elements.commentSolvesInput.focus();
}

async function saveSelectedComment() {
  const ids = [...selectedSolveIds];
  if (ids.length === 0) return;
  const comment = elements.commentSolvesInput.value;
  const snapshot = createHistorySnapshot('comment-solves', `${ids.length} 条成绩`);

  elements.confirmCommentButton.disabled = true;
  try {
    const data = await postJson('/api/solves/update', { ids, comment });
    solves = data.solves;
    if (data.sessions) sessions = data.sessions;
    pendingDeletedSolves = [];
    pendingImportSnapshot = snapshot;
    selectedSolveIds.clear();
    renderSolveDialog();
    elements.commentSolvesDialog.close();
    render();
  } catch (error) {
    alert(`保存备注失败：${error.message}`);
    renderCommentSolvesDialog();
  } finally {
    elements.confirmCommentButton.disabled = false;
  }
}

function openMoveSolvesDialog() {
  if (selectedSolveIds.size === 0) return;
  if (!elements.moveSolvesDialog.open) elements.moveSolvesDialog.showModal();
  renderMoveSolvesDialog();
}

async function moveSelectedSolves() {
  const ids = [...selectedSolveIds];
  const sessionId = elements.moveSessionSelect.value;
  if (ids.length === 0 || !sessionId) return;
  const targetSession = sessions.find((session) => session.id === sessionId);
  const snapshot = createHistorySnapshot('move-solves', `${ids.length} 条成绩到 ${targetSession?.name || '目标会话'}`);

  elements.confirmMoveButton.disabled = true;
  try {
    const data = await postJson('/api/solves/move', { ids, sessionId });
    solves = data.solves;
    if (data.sessions) sessions = data.sessions;
    pendingDeletedSolves = [];
    pendingImportSnapshot = snapshot;
    selectedSolveIds.clear();
    if (currentDetailSolveId && !filteredSolves().some((solve) => solve.id === currentDetailSolveId)) elements.solveDialog.close();
    elements.moveSolvesDialog.close();
    render();
  } catch (error) {
    alert(`移动失败：${error.message}`);
    renderMoveSolvesDialog();
  } finally {
    elements.confirmMoveButton.disabled = false;
  }
}

async function clearAllSolves() {
  const ids = filteredSolves().map((solve) => solve.id);
  if (ids.length === 0 || !confirmSolveDeletion('清空当前会话的所有成绩？清空后可用撤销删除恢复本次操作。')) return;
  const deleted = solves.filter((solve) => ids.includes(solve.id));
  const data = await postJson('/api/solves/delete', { ids });
  stageDeletedSolves(deleted);
  solves = data.solves;
  selectedSolveIds.clear();
  if (ids.includes(currentDetailSolveId)) elements.solveDialog.close();
  render();
}

function confirmSolveDeletion(message) {
  return !confirmDeleteSolves || confirm(message);
}

async function undoLastDelete() {
  if (pendingImportSnapshot) {
    const snapshot = pendingImportSnapshot;
    const data = await postJson('/api/import', {
      mode: 'replace',
      sessions: snapshot.sessions,
      solves: snapshot.solves,
    });
    solves = data.solves;
    sessions = data.sessions;
    currentSessionId = sessions.some((session) => session.id === snapshot.currentSessionId)
      ? snapshot.currentSessionId
      : 'default';
    localStorage.setItem('trainTimer.session', currentSessionId);
    pendingImportSnapshot = null;
    pendingDeletedSolves = [];
    selectedSolveIds.clear();
    if (currentDetailSolveId && !solves.some((solve) => solve.id === currentDetailSolveId)) elements.solveDialog.close();
    render();
    return;
  }

  if (pendingDeletedSolves.length === 0) return;
  const restoredIds = new Set(pendingDeletedSolves.map((solve) => solve.id));
  const merged = [...solves.filter((solve) => !restoredIds.has(solve.id)), ...pendingDeletedSolves]
    .sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));
  const data = await postJson('/api/import', { mode: 'replace', sessions, solves: merged });
  solves = data.solves;
  sessions = data.sessions;
  pendingDeletedSolves = [];
  pendingImportSnapshot = null;
  selectedSolveIds.clear();
  render();
}

function openExportDialog() {
  if (!elements.exportDialog.open) elements.exportDialog.showModal();
  renderExportDialog();
}

function exportSolves(format, scope) {
  const params = new URLSearchParams({ format, scope });
  if (scope === 'session') params.set('sessionId', currentSessionId);
  window.location.href = `/api/export?${params.toString()}`;
}

function exportSelectedSolves(format) {
  const exportHistory = selectedExportHistory(solves, sessions, selectedSolveIds);
  if (exportHistory.solves.length === 0) return;

  const suffix = `selected-${exportHistory.solves.length}`;
  downloadSolvesExport(format, 'selected', suffix, exportHistory);
}

function exportListedSolves(format) {
  const listedSolves = filteredAllSolves();
  if (listedSolves.length === 0) return;

  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const scope = allSolvesFilterActive() ? 'filtered' : 'listed';
  const scopeName = allSessionsEnabled ? 'all-sessions' : (currentSession?.name || currentSessionId);
  const suffix = `${safeExportFilename(scopeName)}-${scope}-${listedSolves.length}`;
  downloadSolvesExport(format, scope, suffix, exportHistoryForSolves(listedSolves, sessions));
}

async function copyListedSolves() {
  const listedSolves = filteredAllSolves();
  if (listedSolves.length === 0) return;

  const baseSolves = allSolvesBaseSolves();
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const scopeName = allSessionsEnabled ? `全部会话 · ${sessions.length} 个会话` : (currentSession?.name || currentSessionId);
  const scope = allSolvesFilterActive()
    ? `${scopeName} · 筛选 ${listedSolves.length} / ${baseSolves.length} 条`
    : `${scopeName} · ${listedSolves.length} 条`;
  const text = solvesToTextTable(listedSolves, sessions, { scope });
  try {
    await navigator.clipboard.writeText(text);
    elements.allCopyListButton.textContent = '已复制';
    setTimeout(() => {
      elements.allCopyListButton.textContent = '复制列表';
    }, 900);
  } catch {
    alert(text);
  }
}

function downloadSolvesExport(format, scope, suffix, exportHistory) {
  if (format === 'csv') {
    downloadTextFile(
      `traintimer-solves-${suffix}.csv`,
      solvesToCsv(exportHistory.solves, exportHistory.sessions),
      'text/csv;charset=utf-8',
    );
    return;
  }

  if (format === 'cstimer') {
    downloadTextFile(
      `traintimer-cstimer-${suffix}.csv`,
      solvesToCstimerCsv(exportHistory.solves),
      'text/csv;charset=utf-8',
    );
    return;
  }

  if (format === 'cstimer-json') {
    downloadTextFile(
      `traintimer-cstimer-${suffix}.json`,
      solvesToCstimerJson(exportHistory.solves, exportHistory.sessions),
      'application/json;charset=utf-8',
    );
    return;
  }

  downloadTextFile(
    `traintimer-solves-${suffix}.json`,
    `${JSON.stringify(createExportPayload(scope, exportHistory.sessions, exportHistory.solves), null, 2)}\n`,
    'application/json;charset=utf-8',
  );
}

async function importSolves() {
  const [file] = elements.importFile.files;
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = parseSolveImport(file.name, text);
    pendingImportPreview = { fileName: file.name, parsed };
    if (!elements.importDialog.open) elements.importDialog.showModal();
    renderImportDialog();
  } catch (error) {
    alert(`导入失败：${error.message}`);
  } finally {
    elements.importFile.value = '';
  }
}

async function confirmImport(mode) {
  if (!pendingImportPreview) return;
  const { fileName, parsed } = pendingImportPreview;
  const snapshot = createHistorySnapshot(mode, fileName);

  elements.appendImportButton.disabled = true;
  elements.replaceImportButton.disabled = true;
  try {
    const data = await postJson('/api/import', { mode, sessions: parsed.sessions, solves: parsed.solves });
    solves = data.solves;
    sessions = data.sessions;
    pendingDeletedSolves = [];
    pendingImportSnapshot = snapshot;
    pendingImportPreview = null;
    if (!sessions.some((session) => session.id === currentSessionId)) currentSessionId = 'default';
    selectedSolveIds.clear();
    if (currentDetailSolveId && !solves.some((solve) => solve.id === currentDetailSolveId)) elements.solveDialog.close();
    if (elements.importDialog.open) elements.importDialog.close();
    render();
  } catch (error) {
    alert(`导入失败：${error.message}`);
    renderImportDialog();
  }
}

function toggleSelectAllSolves() {
  if (!elements.selectAllSolves) return;
  selectedSolveIds = elements.selectAllSolves.checked ? new Set(visibleSolves().map((solve) => solve.id)) : new Set();
  render();
}

function closeHistoryMenuAfterAction(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const button = target?.closest('button');
  if (!button || button.disabled) return;
  window.setTimeout(() => {
    elements.historyActionsMenu.open = false;
  }, 0);
}

function closeHistoryMenuOnOutsideClick(event) {
  if (!elements.historyActionsMenu?.open) return;
  const target = event.target instanceof Node ? event.target : null;
  if (target && elements.historyActionsMenu.contains(target)) return;
  elements.historyActionsMenu.open = false;
}

function toggleSelectAllSessionSolves() {
  selectedSolveIds = elements.selectAllSessionSolves.checked ? new Set(filteredAllSolves().map((solve) => solve.id)) : new Set();
  render();
}

function openAllSolvesDialog() {
  elements.allSolvesSearch.value = '';
  elements.allSolvesFromDate.value = '';
  elements.allSolvesToDate.value = '';
  allSolvesDatePreset = 'all';
  elements.allSolvesRecordFilter.value = 'all';
  elements.allSolvesPuzzleFilter.value = 'all';
  elements.allSolvesPenaltyFilter.value = 'all';
  elements.allSolvesSourceFilter.value = 'all';
  elements.allSolvesTagFilter.value = 'all';
  if (filteredSolves().length === 0 && solves.length > 0) {
    allSessionsEnabled = true;
    localStorage.setItem('trainTimer.allSessions', '1');
  }
  resetAllSolvesRenderWindow();
  if (!elements.allSolvesDialog.open) elements.allSolvesDialog.showModal();
  renderAllSolvesDialog();
  elements.allSolvesSearch.focus();
}

function handleAllSolvesFilterChange(event) {
  if ([elements.allSolvesFromDate, elements.allSolvesToDate].includes(event?.target)) {
    allSolvesDatePreset = inferredQuickDatePreset();
  }
  selectedSolveIds.clear();
  resetAllSolvesRenderWindow();
  render();
}

function setAllSolvesDatePreset(preset) {
  const range = quickDateRange(preset);
  elements.allSolvesFromDate.value = range.from;
  elements.allSolvesToDate.value = range.to;
  allSolvesDatePreset = preset;
  selectedSolveIds.clear();
  resetAllSolvesRenderWindow();
  render();
}

function clearAllSolvesFilters() {
  if (!allSolvesFilterActive()) return;
  elements.allSolvesSearch.value = '';
  elements.allSolvesFromDate.value = '';
  elements.allSolvesToDate.value = '';
  allSolvesDatePreset = 'all';
  elements.allSolvesRecordFilter.value = 'all';
  elements.allSolvesPuzzleFilter.value = 'all';
  elements.allSolvesPenaltyFilter.value = 'all';
  elements.allSolvesSourceFilter.value = 'all';
  elements.allSolvesTagFilter.value = 'all';
  selectedSolveIds.clear();
  resetAllSolvesRenderWindow();
  render();
}

function toggleAllSessions() {
  allSessionsEnabled = elements.allSessionsToggle.checked;
  localStorage.setItem('trainTimer.allSessions', allSessionsEnabled ? '1' : '0');
  selectedSolveIds.clear();
  resetAllSolvesRenderWindow();
  render();
}

function openStatsDialog() {
  statsScope = 'session';
  if (!elements.statsDialog.open) elements.statsDialog.showModal();
  renderStatsDialog();
  requestAnimationFrame(() => {
    if (elements.statsDialog.open) renderStatsDialog();
  });
  setTimeout(() => {
    if (elements.statsDialog.open) renderStatsDialog();
  }, 220);
}

function openSelectedStatsDialog() {
  if (selectedSolveIds.size === 0) return;
  statsScope = 'selected';
  if (!elements.statsDialog.open) elements.statsDialog.showModal();
  renderStatsDialog();
  requestAnimationFrame(() => {
    if (elements.statsDialog.open) renderStatsDialog();
  });
  setTimeout(() => {
    if (elements.statsDialog.open) renderStatsDialog();
  }, 220);
}

function openListedStatsDialog() {
  if (!elements.allSolvesDialog.open || filteredAllSolves().length === 0) return;
  statsScope = 'listed';
  if (!elements.statsDialog.open) elements.statsDialog.showModal();
  renderStatsDialog();
  requestAnimationFrame(() => {
    if (elements.statsDialog.open) renderStatsDialog();
  });
  setTimeout(() => {
    if (elements.statsDialog.open) renderStatsDialog();
  }, 220);
}

async function switchSession() {
  await selectSession(elements.sessionSelect.value);
}

async function selectSession(sessionId) {
  currentSessionId = sessionId;
  localStorage.setItem('trainTimer.session', currentSessionId);
  applyCurrentSessionPuzzle();
  selectedSolveIds.clear();
  if (currentDetailSolveId && !filteredSolves().some((solve) => solve.id === currentDetailSolveId)) elements.solveDialog.close();
  if (!scrambleChangeLocked() && (!scramble || (scramble.puzzle || 'three') !== scramblePuzzle)) {
    await loadScramble();
    return;
  }
  render();
}

async function createSession() {
  const name = prompt('新会话名称', `Session ${sessions.length + 1}`);
  if (!name) return;
  const data = await postJson('/api/sessions', { name, scramblePuzzle });
  sessions = data.sessions;
  solves = data.solves;
  currentSessionId = data.session.id;
  scramblePuzzle = data.session.scramblePuzzle || scramblePuzzle;
  localStorage.setItem('trainTimer.session', currentSessionId);
  localStorage.setItem('trainTimer.scramblePuzzle', scramblePuzzle);
  selectedSolveIds.clear();
  if (elements.solveDialog.open) elements.solveDialog.close();
  render();
}

async function duplicateCurrentSession() {
  const current = sessions.find((session) => session.id === currentSessionId);
  if (!current) return;

  const name = prompt('复制会话名称', `${current.name} 副本`);
  if (!name) return;

  const data = await postJson(`/api/sessions/${encodeURIComponent(currentSessionId)}/duplicate`, { name });
  sessions = data.sessions;
  solves = data.solves;
  currentSessionId = data.session.id;
  scramblePuzzle = data.session.scramblePuzzle || scramblePuzzle;
  localStorage.setItem('trainTimer.session', currentSessionId);
  localStorage.setItem('trainTimer.scramblePuzzle', scramblePuzzle);
  selectedSolveIds.clear();
  if (elements.solveDialog.open) elements.solveDialog.close();
  render();
}

function openMergeSessionDialog() {
  if (currentSessionId === 'default' || sessions.length < 2) return;
  if (!elements.mergeSessionDialog.open) elements.mergeSessionDialog.showModal();
  renderMergeSessionDialog();
}

async function mergeCurrentSession() {
  const current = sessions.find((session) => session.id === currentSessionId);
  const targetSessionId = elements.mergeSessionSelect.value;
  const target = sessions.find((session) => session.id === targetSessionId);
  if (!current || !target || current.id === 'default' || current.id === target.id) return;

  const sourceCount = solvesForSession(current.id).length;
  if (!confirm(`把会话“${current.name}”的 ${sourceCount} 条成绩合并到“${target.name}”？源会话会被删除，可用撤销恢复。`)) return;

  const snapshot = createHistorySnapshot('merge-session', `${current.name} 到 ${target.name}`);
  elements.confirmMergeSessionButton.disabled = true;
  try {
    const data = await postJson(`/api/sessions/${encodeURIComponent(current.id)}/merge`, {
      targetSessionId: target.id,
    });
    sessions = data.sessions;
    solves = data.solves;
    currentSessionId = target.id;
    applyCurrentSessionPuzzle();
    localStorage.setItem('trainTimer.session', currentSessionId);
    pendingDeletedSolves = [];
    pendingImportSnapshot = snapshot;
    selectedSolveIds.clear();
    if (currentDetailSolveId && !solves.some((solve) => solve.id === currentDetailSolveId)) elements.solveDialog.close();
    elements.mergeSessionDialog.close();
    if (!scrambleChangeLocked() && (!scramble || (scramble.puzzle || 'three') !== scramblePuzzle)) {
      await loadScramble();
      return;
    }
    render();
  } catch (error) {
    alert(`合并失败：${error.message}`);
    renderMergeSessionDialog();
  } finally {
    elements.confirmMergeSessionButton.disabled = false;
  }
}

async function renameSession() {
  const current = sessions.find((session) => session.id === currentSessionId);
  if (!current) return;
  const name = prompt('会话名称', current.name);
  if (!name) return;
  const data = await requestJson(`/api/sessions/${encodeURIComponent(currentSessionId)}`, {
    method: 'PATCH',
    body: { name },
  });
  sessions = data.sessions;
  solves = data.solves;
  render();
}

async function deleteCurrentSession() {
  if (currentSessionId === 'default') return;
  const current = sessions.find((session) => session.id === currentSessionId);
  if (!current || !confirm(`删除会话“${current.name}”及其中所有成绩？`)) return;
  const snapshot = createHistorySnapshot('delete-session', current.name);
  const data = await requestJson(`/api/sessions/${encodeURIComponent(currentSessionId)}`, { method: 'DELETE' });
  sessions = data.sessions;
  solves = data.solves;
  currentSessionId = 'default';
  localStorage.setItem('trainTimer.session', currentSessionId);
  pendingDeletedSolves = [];
  pendingImportSnapshot = snapshot;
  selectedSolveIds.clear();
  if (currentDetailSolveId && !filteredSolves().some((solve) => solve.id === currentDetailSolveId)) elements.solveDialog.close();
  render();
}

function handleHistoryChange(event) {
  const id = event.target.dataset.id;
  if (!id) return;

  if (event.target.matches('.solve-check')) {
    if (event.target.checked) selectedSolveIds.add(id);
    else selectedSolveIds.delete(id);
    renderSelectionControls();
    return;
  }

  if (event.target.matches('.penalty-select')) {
    updateSolvePenalty(id, event.target.value);
  }
}

function handleHistoryClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const averageButton = target?.closest('[data-average-id]');
  if (averageButton) {
    if (elements.allSolvesDialog.open) elements.allSolvesDialog.close();
    openAverageDialog(
      averageButton.dataset.averageId,
      Number(averageButton.dataset.averageSize),
      averageButton.dataset.averageKind || 'average',
    );
    return;
  }

  const detailButton = target?.closest('[data-detail-id]');
  const detailId = detailButton?.dataset.detailId;
  if (detailId) {
    if (elements.allSolvesDialog.open) elements.allSolvesDialog.close();
    openSolveDialog(detailId);
    return;
  }

  const deleteButton = target?.closest('[data-delete-id]');
  const id = deleteButton?.dataset.deleteId;
  if (id) deleteSolve(id);
}

function handleAllSolvesRowsClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest('[data-load-more-solves]')) {
    loadMoreAllSolvesRows();
    return;
  }
  handleHistoryClick(event);
}

function handleAllSolvesTableScroll() {
  if (!elements.allSolvesDialog.open || !elements.allSolvesTable) return;
  const remaining = elements.allSolvesTable.scrollHeight
    - elements.allSolvesTable.scrollTop
    - elements.allSolvesTable.clientHeight;
  if (remaining < 180) loadMoreAllSolvesRows();
}

function resetAllSolvesRenderWindow() {
  allSolvesVisibleLimit = allSolvesRenderBatchSize;
  if (elements.allSolvesTable) elements.allSolvesTable.scrollTop = 0;
}

function loadMoreAllSolvesRows() {
  if (!elements.allSolvesDialog.open) return;
  const total = filteredAllSolves().length;
  if (allSolvesVisibleLimit >= total) return;
  allSolvesVisibleLimit = Math.min(total, allSolvesVisibleLimit + allSolvesRenderBatchSize);
  renderAllSolvesDialog();
}

function openSolveDialog(id) {
  currentDetailSolveId = id;
  renderSolveDialog();
  if (!elements.solveDialog.open) elements.solveDialog.showModal();
}

function renderSolveDialog() {
  if (!elements.solveDialog.open && !currentDetailSolveId) return;
  const solve = solves.find((item) => item.id === currentDetailSolveId);
  if (!solve) {
    if (elements.solveDialog.open) elements.solveDialog.close();
    return;
  }

  const sessionSolves = solvesForSession(solve.sessionId);
  const solveIndex = sessionSolves.findIndex((item) => item.id === solve.id);
  const solveNumber = solveIndex + 1;
  elements.solveDetailTitle.textContent = `成绩 ${displaySolveTime(solve)}`;
  const timerSource = solve.timerSource === 'bluetooth' ? '蓝牙停表' : '手动停表';
  const bluetoothMoves = Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves : [];
  const bluetoothMoveCount = solve.bluetoothMoveCount ?? (Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves.length : 0);
  const bluetoothTps = Number.isFinite(solve.bluetoothTps) ? `${solve.bluetoothTps.toFixed(3)} TPS` : 'TPS -';
  const bluetoothDevice = solve.bluetoothDeviceName || '';
  const bluetoothProtocols = formatList(solve.bluetoothProtocols);
  const bluetoothSources = formatList(solve.bluetoothSources);
  const bluetoothDetail = [bluetoothDevice, bluetoothProtocols].filter(Boolean).join(' · ');
  const positionText = solveIndex >= 0 ? `第 ${solveNumber} / ${sessionSolves.length} 条` : '未知位置';
  elements.solveDetailMeta.textContent = `${sessionNameForSolve(solve)} · ${positionText} · ${new Date(solve.createdAt).toLocaleString()} · ${timerSource} · ${puzzleLabel(solve.scramblePuzzle || 'three')} · ${solve.inspectionEnabled ? '开启观察' : '无观察'} · ${bluetoothMoveCount} 手 · ${bluetoothTps}${bluetoothDetail ? ` · ${bluetoothDetail}` : ''} · ${solve.scrambleSource || 'unknown'}`;
  elements.prevSolveButton.disabled = solveIndex <= 0;
  elements.nextSolveDetailButton.disabled = solveIndex < 0 || solveIndex >= sessionSolves.length - 1;
  elements.solveDetailTimeInput.value = solve.duration || formatTime(solve.durationMs);
  elements.solveDetailError.textContent = '';
  elements.solveDetailPenaltySelect.value = solve.penalty || 'ok';
  elements.solveDetailPuzzleSelect.value = solve.scramblePuzzle || 'three';
  elements.solveDetailScramble.value = solve.scramble || '';
  elements.solveDetailComment.value = solve.comment || '';
  elements.solveDetailTagsInput.value = formatTags(solve.tags);
  renderSolveSolutionPanel(solve);
}

function renderSolveSolutionPanel(solve) {
  const analysis = solveCfopAnalysis(solve);
  const records = analysis.records;
  const hasMoves = records.length > 0;
  elements.solveSolutionPanel.hidden = !hasMoves;
  elements.solveReplayButton.disabled = !hasMoves;
  elements.solveReplayButton.textContent = solveReplayPlaying ? '暂停' : '播放';
  if (!hasMoves) {
    stopSolveReplay();
    elements.solveDetailBluetoothStats.textContent = '完整解法';
    elements.solveBluetoothReplayMeta.textContent = '-';
    elements.solveDetailBluetoothMoves.replaceChildren();
    elements.solveCfopStages.replaceChildren();
    return;
  }

  const stageText = analysis.finalSolved ? '已复原' : '未复原';
  const sourceText = solve.bluetoothDeviceName || (solve.timerSource === 'bluetooth' ? '蓝牙魔方' : '');
  elements.solveDetailBluetoothStats.textContent = '完整解法';
  elements.solveBluetoothReplayMeta.textContent = [
    `${records.length} 步`,
    Number.isFinite(solve.bluetoothTps) ? `${solve.bluetoothTps.toFixed(3)} TPS` : '',
    stageText,
    sourceText,
  ].filter(Boolean).join(' · ');

  elements.solveCfopStages.replaceChildren(
    ...analysis.stages.map((stage) => renderCfopStageCard(stage)),
  );
  elements.solveDetailBluetoothMoves.replaceChildren(
    ...records.map((record, index) => renderSolveMoveChip(record, index)),
  );
  updateSolveReplayHighlight();
}

function renderCfopStageCard(stage) {
  const card = document.createElement('div');
  card.className = `solve-cfop-card ${stage.completed ? 'completed' : 'pending'}`;
  const timeText = Number.isFinite(stage.durationMs) ? formatTime(stage.durationMs) : '--';
  const tpsText = Number.isFinite(stage.tps) ? `${stage.tps.toFixed(2)} TPS` : 'TPS --';
  card.innerHTML = `
    <strong>${escapeHtml(stage.label)}</strong>
    <span>${escapeHtml(stage.name)}</span>
    <em>${stage.completed ? escapeHtml(timeText) : '未完成'}</em>
    <small>${stage.turns} 手 · ${escapeHtml(tpsText)}</small>
  `;
  return card;
}

function renderSolveMoveChip(record, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'solve-move-chip';
  button.dataset.replayStep = String(index);
  const elapsed = Number.isFinite(record.elapsedMs) ? formatTime(record.elapsedMs) : '--';
  button.title = `第 ${index + 1} 步 · ${record.move} · ${elapsed}`;
  button.innerHTML = `<span>${index + 1}</span><strong>${escapeHtml(record.move)}</strong>`;
  button.addEventListener('click', () => {
    const solve = solves.find((item) => item.id === currentDetailSolveId);
    stopSolveReplay({ keepStep: true });
    solveReplayStep = index;
    showSolveReplayPreview(solve, index + 1);
    updateSolveReplayHighlight();
  });
  return button;
}

function toggleSolveReplay() {
  if (solveReplayPlaying) {
    stopSolveReplay({ keepStep: true });
    return;
  }
  startSolveReplay();
}

function startSolveReplay() {
  const solve = solves.find((item) => item.id === currentDetailSolveId);
  const records = solveMoveRecords(solve);
  if (records.length === 0) return;
  clearTimeout(solveReplayTimer);
  completeBluetoothCube3dTurnAnimation(false);
  solveReplayPlaying = true;
  solveReplayStep = solveReplayStep >= 0 && solveReplayStep < records.length ? solveReplayStep : -1;
  elements.solveReplayButton.textContent = '暂停';
  showSolveReplayPreview(solve, Math.max(0, solveReplayStep + 1));
  solveReplayTimer = window.setTimeout(() => advanceSolveReplay(solve, records), 120);
}

function advanceSolveReplay(solve, records) {
  if (!solveReplayPlaying) return;
  solveReplayStep += 1;
  if (solveReplayStep >= records.length) {
    stopSolveReplay({ keepStep: true });
    return;
  }
  updateSolveReplayHighlight();
  const current = records[solveReplayStep];
  const stepToApply = solveReplayStep + 1;
  const animationDelay = current.move.endsWith('2') ? 470 : 330;
  triggerBluetoothCube3dTurnAnimation(current.move, {
    onComplete: () => showSolveReplayPreview(solve, stepToApply),
  });
  window.setTimeout(() => {
    if (solveReplayPreviewActive && solveReplayStep >= stepToApply - 1) showSolveReplayPreview(solve, stepToApply);
  }, animationDelay);
  const currentElapsed = Number.isFinite(current.elapsedMs) ? current.elapsedMs : null;
  const nextElapsed = Number.isFinite(records[solveReplayStep + 1]?.elapsedMs) ? records[solveReplayStep + 1].elapsedMs : null;
  const delay = currentElapsed != null && nextElapsed != null
    ? Math.min(900, Math.max(animationDelay, nextElapsed - currentElapsed))
    : animationDelay;
  solveReplayTimer = window.setTimeout(() => advanceSolveReplay(solve, records), delay);
}

function stopSolveReplay(options = {}) {
  clearTimeout(solveReplayTimer);
  solveReplayTimer = 0;
  solveReplayPlaying = false;
  if (!options.keepStep) solveReplayStep = -1;
  if (elements.solveReplayButton) elements.solveReplayButton.textContent = '播放';
  if (!options.keepStep) clearSolveReplayPreview();
  updateSolveReplayHighlight();
}

function showSolveReplayPreview(solve, stepCount = 0) {
  const records = solveMoveRecords(solve);
  try {
    const cube = createSolvedCube();
    for (const move of parseScramble(solve?.scramble || '')) applyMove(cube, move);
    for (const record of records.slice(0, Math.max(0, stepCount))) {
      applyMove(cube, parseScramble(record.move)[0]);
    }
    solveReplayCube = cube;
    solveReplayPreviewActive = true;
    solveReplayPreviewLabel = stepCount <= 0
      ? '打乱状态'
      : `回放 ${Math.min(stepCount, records.length)} / ${records.length} · ${records[Math.min(stepCount, records.length) - 1]?.move || ''}`;
    renderPreviewMode();
  } catch (error) {
    addBluetoothLog('警告', '复原回放无法渲染', error.message || String(error));
  }
}

function clearSolveReplayPreview() {
  solveReplayPreviewActive = false;
  solveReplayCube = null;
  solveReplayPreviewLabel = '';
  renderPreviewMode();
}

function updateSolveReplayHighlight() {
  if (!elements.solveDetailBluetoothMoves) return;
  const chips = elements.solveDetailBluetoothMoves.querySelectorAll('.solve-move-chip');
  chips.forEach((chip, index) => {
    const active = index === solveReplayStep;
    chip.classList.toggle('active', active);
    if (active) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
}

function solveMoveRecords(solve) {
  if (!solve) return [];
  const moveLog = Array.isArray(solve.bluetoothMoveLog) ? solve.bluetoothMoveLog : [];
  const moves = Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves : [];
  const records = moveLog.length > 0
    ? moveLog.map((entry, index) => ({
      step: Number.isFinite(Number(entry.step)) ? Number(entry.step) : index + 1,
      move: String(entry.move || '').trim(),
      elapsedMs: Number.isFinite(Number(entry.elapsedMs)) ? Number(entry.elapsedMs) : null,
    }))
    : moves.map((move, index) => ({ step: index + 1, move, elapsedMs: null }));
  return records.filter((record) => /^[UDRLFB](2|')?$/.test(record.move));
}

function createCfopDefinitions() {
  const stickers = createSolvedCube();
  const cubies = new Map();
  for (const sticker of stickers) {
    const key = sticker.pos.join(',');
    if (!cubies.has(key)) cubies.set(key, []);
    cubies.get(key).push({
      color: sticker.face,
      cell: cfopSolvedStickerCell(sticker),
    });
  }

  const edgeCubies = [...cubies.values()].filter((cubie) => cubie.length === 2);
  const cornerCubies = [...cubies.values()].filter((cubie) => cubie.length === 3);
  const definitions = new Map();
  for (const bottomFace of cube3dFaces) {
    const topFace = cubeOppositeFaces[bottomFace];
    const crossCells = edgeCubies
      .filter((cubie) => cubie.some((sticker) => sticker.color === bottomFace))
      .flatMap((cubie) => cubie.map((sticker) => sticker.cell));
    const pairSlots = cornerCubies
      .filter((corner) => corner.some((sticker) => sticker.color === bottomFace))
      .map((corner, index) => {
        const sideFaces = corner.map((sticker) => sticker.color).filter((face) => face !== bottomFace);
        const edge = edgeCubies.find((candidate) => (
          sideFaces.every((face) => candidate.some((sticker) => sticker.color === face))
        ));
        return {
          key: `${bottomFace}-${sideFaces.join('')}`,
          label: `F${index + 1}`,
          name: `F2L ${sideFaces.join('/')}`,
          cells: [
            ...corner.map((sticker) => sticker.cell),
            ...(edge ? edge.map((sticker) => sticker.cell) : []),
          ],
        };
      });
    const ollCells = Array.from({ length: 9 }, (_, index) => [topFace, Math.floor(index / 3), index % 3]);
    definitions.set(bottomFace, { bottomFace, topFace, crossCells, pairSlots, ollCells });
  }
  return definitions;
}

function cfopSolvedStickerCell(sticker) {
  const face = cfopFaceFromNormal(sticker.normal);
  const [row, col] = cfopFaceGridPosition(face, sticker.pos);
  return [face, row, col];
}

function cfopFaceFromNormal(normal) {
  for (const [face, candidate] of Object.entries(cubeFaceNormals)) {
    if (normal.every((value, index) => value === candidate[index])) return face;
  }
  throw new Error(`Invalid sticker normal: ${normal.join(',')}`);
}

function cfopFaceGridPosition(face, [x, y, z]) {
  if (face === 'U') return [z + 1, x + 1];
  if (face === 'D') return [1 - z, x + 1];
  if (face === 'F') return [1 - y, x + 1];
  if (face === 'B') return [1 - y, 1 - x];
  if (face === 'R') return [1 - y, 1 - z];
  if (face === 'L') return [1 - y, z + 1];
  throw new Error(`Unsupported face: ${face}`);
}

function detectCfopCrossDefinition(faces) {
  for (const face of cfopBottomFaceOrder) {
    const definition = cfopDefinitions.get(face);
    if (definition && isFaceletSetSolved(faces, definition.crossCells)) return definition;
  }
  return null;
}

function solveCfopAnalysis(solve) {
  const records = solveMoveRecords(solve);
  const stageTemplate = cfopStageTemplate();
  if (!solve?.scramble || records.length === 0 || (solve.scramblePuzzle || 'three') !== 'three') {
    return { records, stages: stageTemplate, finalSolved: false };
  }

  const completions = {
    cross: null,
    bottomFace: '',
    pairs: new Map(),
    f2l: null,
    oll: null,
    pll: null,
  };
  let cfopDefinition = null;
  let cube;
  try {
    cube = createSolvedCube();
    for (const move of parseScramble(solve.scramble)) applyMove(cube, move);
  } catch {
    return { records, stages: stageTemplate, finalSolved: false };
  }

  const recordCompletion = (stepIndex) => {
    const faces = facesFromCube(cube);
    if (completions.cross == null) {
      cfopDefinition = detectCfopCrossDefinition(faces);
      if (cfopDefinition) {
        completions.cross = stepIndex;
        completions.bottomFace = cfopDefinition.bottomFace;
      }
      else return;
    }

    if (completions.f2l == null) {
      for (const slot of cfopDefinition.pairSlots) {
        if (!completions.pairs.has(slot.key) && isFaceletSetSolved(faces, slot.cells)) {
          completions.pairs.set(slot.key, stepIndex);
        }
      }
      if (completions.pairs.size === cfopDefinition.pairSlots.length) completions.f2l = stepIndex;
      else return;
    }

    if (completions.oll == null) {
      if (isFaceletSetSolved(faces, cfopDefinition.ollCells)) completions.oll = stepIndex;
      else return;
    }

    if (completions.pll == null && isSolvedFaces(faces)) completions.pll = stepIndex;
  };

  for (let index = 0; index < records.length; index += 1) {
    try {
      applyMove(cube, parseScramble(records[index].move)[0]);
      recordCompletion(index + 1);
    } catch {
      break;
    }
  }

  const pairSlots = cfopDefinition?.pairSlots || cfopFallbackPairSlots;
  const orderedPairs = pairSlots
    .map((slot) => ({ ...slot, completedAt: completions.pairs.get(slot.key) ?? null }))
    .sort((left, right) => {
      const leftStep = left.completedAt ?? Number.POSITIVE_INFINITY;
      const rightStep = right.completedAt ?? Number.POSITIVE_INFINITY;
      return leftStep - rightStep || pairSlots.findIndex((slot) => slot.key === left.key) - pairSlots.findIndex((slot) => slot.key === right.key);
    });
  const pairStages = orderedPairs.map((slot, index) => ({
    key: slot.key,
    label: `F${index + 1}`,
    name: slot.name,
    completedAt: slot.completedAt,
  }));

  const boundaries = [
    { key: 'cross', label: 'C', name: 'Cross', completedAt: completions.cross },
    ...pairStages,
    { key: 'oll', label: 'O', name: 'OLL', completedAt: completions.oll },
    { key: 'pll', label: 'P', name: 'PLL', completedAt: completions.pll },
  ];
  let previousStep = 0;
  const stages = boundaries.map((boundary) => {
    const stage = cfopStageFromBoundary(boundary, records, previousStep);
    if (boundary.completedAt != null) previousStep = Math.max(previousStep, boundary.completedAt);
    return stage;
  });

  return {
    records,
    stages,
    finalSolved: completions.pll != null,
    bottomFace: completions.bottomFace,
  };
}

function cfopStageTemplate() {
  return [
    { label: 'C', name: 'Cross', completed: false, turns: 0, durationMs: null, tps: null },
    ...cfopFallbackPairSlots.map((slot, index) => ({ label: `F${index + 1}`, name: slot.name, completed: false, turns: 0, durationMs: null, tps: null })),
    { label: 'O', name: 'OLL', completed: false, turns: 0, durationMs: null, tps: null },
    { label: 'P', name: 'PLL', completed: false, turns: 0, durationMs: null, tps: null },
  ];
}

function cfopStageFromBoundary(boundary, records, previousStep) {
  const completed = boundary.completedAt != null;
  const endStep = completed ? Math.max(previousStep, boundary.completedAt) : previousStep;
  const turns = completed ? Math.max(0, endStep - previousStep) : 0;
  const startElapsed = elapsedAtSolveStep(records, previousStep);
  const endElapsed = elapsedAtSolveStep(records, endStep);
  const durationMs = completed && Number.isFinite(startElapsed) && Number.isFinite(endElapsed)
    ? Math.max(0, endElapsed - startElapsed)
    : null;
  const tps = durationMs > 0 ? Math.round((turns / (durationMs / 1000)) * 100) / 100 : null;
  return {
    key: boundary.key,
    label: boundary.label,
    name: boundary.name,
    completed,
    completedAt: boundary.completedAt,
    turns,
    durationMs,
    tps,
  };
}

function elapsedAtSolveStep(records, step) {
  if (step <= 0) return 0;
  const record = records[step - 1];
  return Number.isFinite(record?.elapsedMs) ? record.elapsedMs : null;
}

function isFaceletSetSolved(faces, cells) {
  return cells.every(([face, row, col]) => faces?.[face]?.[row]?.[col]?.face === face);
}

function cfopStagesForSave(solve) {
  const analysis = solveCfopAnalysis(solve);
  return analysis.stages.map((stage) => ({
    key: stage.key || '',
    label: stage.label,
    name: stage.name,
    completed: Boolean(stage.completed),
    completedAt: stage.completedAt ?? null,
    turns: stage.turns,
    durationMs: Number.isFinite(stage.durationMs) ? Math.round(stage.durationMs) : null,
    tps: Number.isFinite(stage.tps) ? stage.tps : null,
  }));
}

function solveWithDerivedCfop(solve) {
  if (!solve) return solve;
  const stages = cfopStagesForSave(solve);
  return { ...solve, cfopStages: stages.length > 0 ? stages : (solve.cfopStages || []) };
}

function openAverageDialog(solveId, size, kind = 'average') {
  currentAverageDetail = { solveId, size, kind };
  if (!currentAverageDetailData()) {
    currentAverageDetail = null;
    return;
  }
  elements.copyAverageSummaryButton.textContent = '复制平均';
  if (!elements.averageDialog.open) elements.averageDialog.showModal();
  renderAverageDialog();
}

function renderAverageDialog() {
  if (!elements.averageDialog.open) return;
  const detail = currentAverageDetailData();
  if (!detail) {
    elements.averageDialog.close();
    return;
  }

  const endSolve = detail.entries.at(-1)?.solve;
  elements.averageDetailTitle.textContent = `${detail.type} ${formatTime(detail.value)}`;
  elements.averageDetailMeta.textContent = `${sessionNameForSolve(endSolve)} · #${detail.startIndex + 1}-#${detail.endIndex + 1} · ${detail.entries.length} 把`;
  elements.copyAverageSummaryButton.disabled = false;
  elements.averageDetailList.replaceChildren(
    ...detail.entries.map((entry) => averageDetailRow(entry)),
  );
}

function currentAverageDetailData() {
  if (!currentAverageDetail) return null;
  const solve = solves.find((item) => item.id === currentAverageDetail.solveId);
  if (!solve || ![3, 5, 12, 50, 100].includes(currentAverageDetail.size)) return null;
  const sessionSolves = solvesForSession(solve.sessionId);
  const solveIndex = sessionSolves.findIndex((item) => item.id === solve.id);
  if (currentAverageDetail.kind === 'mean') {
    return rollingMeanDetailAt(sessionSolves, solveIndex, currentAverageDetail.size);
  }
  return rollingAverageDetailAt(sessionSolves, solveIndex, currentAverageDetail.size);
}

function averageDetailRow(entry) {
  const row = document.createElement('div');
  row.className = `average-detail-row ${entry.role}`;
  row.innerHTML = `
    <span>#${entry.index + 1}</span>
    <strong>${escapeHtml(displaySolveTime(entry.solve))}</strong>
    <em>${escapeHtml(new Date(entry.solve.createdAt).toLocaleString())}</em>
    <span class="trim-label">${escapeHtml(averageRoleLabel(entry.role))}</span>
  `;
  return row;
}

async function copyAverageSummary() {
  const detail = currentAverageDetailData();
  if (!detail) return;
  const endSolve = detail.entries.at(-1)?.solve;
  const lines = [
    `TrainTimer ${detail.type}`,
    `成绩: ${formatTime(detail.value)}`,
    `会话: ${sessionNameForSolve(endSolve)}`,
    `范围: #${detail.startIndex + 1}-#${detail.endIndex + 1}`,
    '明细:',
    ...detail.entries.map((entry) => (
      `#${entry.index + 1} ${displaySolveTime(entry.solve)} ${averageRoleLabel(entry.role)}`
    )),
  ];
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    elements.copyAverageSummaryButton.textContent = '已复制';
    setTimeout(() => {
      elements.copyAverageSummaryButton.textContent = '复制平均';
    }, 900);
  } catch {
    alert(text);
  }
}

function averageRoleLabel(role) {
  if (role === 'trimmed-best') return '去最快';
  if (role === 'trimmed-worst') return '去最慢';
  return '计入';
}

function navigateSolveDetail(offset) {
  const solve = solves.find((item) => item.id === currentDetailSolveId);
  if (!solve) return;
  const sessionSolves = solvesForSession(solve.sessionId);
  const solveIndex = sessionSolves.findIndex((item) => item.id === solve.id);
  const nextSolve = sessionSolves[solveIndex + offset];
  if (!nextSolve) return;
  stopSolveReplay();
  currentDetailSolveId = nextSolve.id;
  renderSolveDialog();
}

async function saveSolveDetails() {
  const solve = solves.find((item) => item.id === currentDetailSolveId);
  if (!solve) return;
  let durationMs;
  try {
    durationMs = parseTimeInput(elements.solveDetailTimeInput.value);
  } catch (error) {
    elements.solveDetailError.textContent = error.message;
    elements.solveDetailTimeInput.focus();
    return;
  }

  const duration = formatTime(durationMs);
  const penalty = ['ok', '+2', 'dnf'].includes(elements.solveDetailPenaltySelect.value)
    ? elements.solveDetailPenaltySelect.value
    : 'ok';
  const scramblePuzzle = elements.solveDetailPuzzleSelect.value || 'three';
  const scrambleText = elements.solveDetailScramble.value.trim();
  const scrambleSource = scrambleText ? ((solve.scramble || '') === scrambleText ? (solve.scrambleSource || '') : 'manual-edit') : '';
  const comment = elements.solveDetailComment.value;
  const tags = parseTagsInput(elements.solveDetailTagsInput.value);
  const updates = {
    durationMs,
    duration,
    penalty,
    scramblePuzzle,
    scramble: scrambleText,
    scrambleSource,
    comment,
    tags,
  };
  const unchanged = Math.round(Number(solve.durationMs) || 0) === durationMs
    && (solve.duration || formatTime(solve.durationMs)) === duration
    && (solve.penalty || 'ok') === penalty
    && (solve.scramblePuzzle || 'three') === scramblePuzzle
    && (solve.scramble || '') === scrambleText
    && (solve.scrambleSource || '') === scrambleSource
    && (solve.comment || '') === comment
    && sameStringArray(solve.tags, tags);
  if (unchanged) return;
  await saveSolveDetailUpdates(
    updates,
    `成绩详情 ${displaySolveTime(solve)}`,
    '保存失败',
    elements.saveTimeButton,
  );
}

async function saveSolveDetailUpdates(updates, snapshotLabel, errorPrefix, button) {
  if (!currentDetailSolveId) return;
  const snapshot = createHistorySnapshot('edit-solve', snapshotLabel);
  if (button) button.disabled = true;
  elements.solveDetailError.textContent = '';
  try {
    const data = await requestJson(`/api/solves/${encodeURIComponent(currentDetailSolveId)}`, {
      method: 'PATCH',
      body: updates,
    });
    solves = data.solves;
    if (data.sessions) sessions = data.sessions;
    pendingDeletedSolves = [];
    pendingImportSnapshot = snapshot;
    renderSolveDialog();
    render();
  } catch (error) {
    elements.solveDetailError.textContent = `${errorPrefix}：${error.message}`;
  } finally {
    if (button) button.disabled = false;
  }
}

async function copySelectedScramble() {
  const solve = solves.find((item) => item.id === currentDetailSolveId);
  const scrambleText = elements.solveDetailScramble.value.trim() || solve?.scramble || '';
  if (!scrambleText) return;
  try {
    await navigator.clipboard.writeText(scrambleText);
    elements.copyScrambleButton.textContent = '已复制';
    setTimeout(() => {
      elements.copyScrambleButton.textContent = '复制打乱';
    }, 900);
  } catch {
    elements.solveDetailScramble.focus();
  }
}

async function copySelectedSolveSummary() {
  const solve = solves.find((item) => item.id === currentDetailSolveId);
  if (!solve) return;
  const session = sessions.find((item) => item.id === solve.sessionId);
  const text = buildSolveSummary(solveWithDerivedCfop(solve), session?.name || solve.sessionId);
  try {
    await navigator.clipboard.writeText(text);
    elements.copySolveSummaryButton.textContent = '已复制';
    setTimeout(() => {
      elements.copySolveSummaryButton.textContent = '复制详情';
    }, 900);
  } catch {
    alert(text);
  }
}

async function connectBluetoothCube(options = {}) {
  const compatibilityMode = Boolean(options.compatibilityMode);
  const availability = bluetoothAvailability();
  if (!availability.canRequest) {
    setBluetoothStatusText(availability.label, availability.detail);
    setBluetoothConnectedState(false);
    addBluetoothLog('错误', availability.label, availability.detail);
    return;
  }

  try {
    if (bluetoothDevice?.gatt?.connected) {
      setBluetoothDeviceNameStatus('已连接');
      return;
    }

    setBluetoothScanningState(true, compatibilityMode);
    resetBluetoothBattery();
    resetBluetoothGyro();
    const device = await requestBluetoothDevice(compatibilityMode);
    await connectBluetoothDevice(device, { reconnect: false });
    void refreshBluetoothReconnectDevices();
  } catch (error) {
    handleBluetoothConnectionError(error);
  }
}

async function reconnectBluetoothCube() {
  const availability = bluetoothAvailability();
  if (!availability.canRequest) {
    setBluetoothStatusText(availability.label, availability.detail);
    setBluetoothConnectedState(false);
    addBluetoothLog('错误', availability.label, availability.detail);
    return;
  }

  try {
    if (bluetoothDevice?.gatt?.connected) {
      setBluetoothDeviceNameStatus('已连接');
      return;
    }

    setBluetoothScanningState(true, false, '重连中...');
    resetBluetoothBattery();
    resetBluetoothGyro();
    const device = await bluetoothReconnectCandidate();
    if (!device) {
      setBluetoothStatusText('无已授权设备', '先用连接或兼容扫描授权一次');
      addBluetoothLog('连接', '无可重连设备', '先用连接或兼容扫描授权一次');
      setBluetoothConnectedState(false);
      return;
    }

    addBluetoothLog('连接', '重连已授权设备', device.name || device.id || '');
    await connectBluetoothDevice(device, { reconnect: true });
    void refreshBluetoothReconnectDevices();
  } catch (error) {
    handleBluetoothConnectionError(error);
  }
}

async function autoReconnectBluetoothCube() {
  const availability = bluetoothAvailability();
  if (!availability.canReconnect || bluetoothDevice?.gatt?.connected) return;
  const device = bluetoothReconnectDevices.find((candidate) => candidate?.gatt && !candidate.gatt.connected && isLikelyGanDevice(candidate))
    || bluetoothReconnectDevices.find((candidate) => candidate?.gatt && !candidate.gatt.connected);
  if (!device) return;

  try {
    addBluetoothLog('连接', '自动重连已授权设备', device.name || device.id || '');
    await connectBluetoothDevice(device, { reconnect: true, auto: true, allowMacPrompt: false });
  } catch (error) {
    setBluetoothStatusText('自动重连失败', error.message || String(error));
    setBluetoothConnectedState(false);
    addBluetoothLog('警告', '自动重连失败', error.message || String(error));
  }
}

async function connectBluetoothDevice(device, options = {}) {
  cleanupBluetoothSubscriptions();
  setActiveBluetoothDevice(device);
  addBluetoothLog('设备', bluetoothDevice.name || '未命名设备', bluetoothDevice.id || '');
  bluetoothGanMacPromptAllowed = false;
  const quickMacTimeout = options.auto ? 2400 : 1800;
  await startBluetoothGanMacBackgroundRead(bluetoothDevice, quickMacTimeout);
  addBluetoothLog('连接', options.reconnect ? '正在重连 GATT' : '正在连接 GATT');
  const server = await bluetoothDevice.gatt.connect();
  setBluetoothConnectedState(true);
  setBluetoothDeviceNameStatus('读取服务...');
  addBluetoothLog('连接', 'GATT 已连接', bluetoothDevice.name || '');

  const discovery = await discoverBluetoothServices(server);
  const initDetail = discovery.writeCount > 0 ? ` · ${discovery.writeCount} 次初始化` : '';
  setBluetoothDeviceNameStatus(
    '已连接',
    discovery.notifyCount > 0
      ? `${discovery.notifyCount} 路通知${initDetail} · ${discovery.detail || ''}`
      : `未发现通知 · ${discovery.detail || '未发现可订阅特征'}`,
  );
  addBluetoothLog('服务', `发现 ${discovery.serviceCount} 个服务`, `${discovery.notifyCount} 路通知 · ${discovery.writeCount} 次初始化 · ${discovery.detail}`);
  bluetoothGanMacPromptAllowed = false;
}

function disconnectBluetoothDevice() {
  if (!bluetoothDevice?.gatt?.connected) {
    setBluetoothConnectedState(false);
    return;
  }

  addBluetoothLog('连接', '请求断开设备', bluetoothDevice.name || bluetoothDevice.id || '');
  bluetoothDevice.gatt.disconnect();
}

function setActiveBluetoothDevice(device) {
  if (bluetoothDevice && bluetoothDeviceDisconnectHandler) {
    bluetoothDevice.removeEventListener('gattserverdisconnected', bluetoothDeviceDisconnectHandler);
  }
  bluetoothDevice = device;
  lastBluetoothMovePacketSignature = '';
  bluetoothPhysicalFacelets = '';
  bluetoothPhysicalFaces = null;
  bluetoothPhysicalStateTime = '';
  bluetoothGanMac = cachedBluetoothGanMac(device, { includeLast: false });
  bluetoothGanSession = null;
  bluetoothGanMacReadPromise = null;
  bluetoothGanPendingInit = null;
  bluetoothGanLastMoveCounter = null;
  bluetoothGanDecodeWarning = '';
  bluetoothGanLastStateLogAt = 0;
  bluetoothGanLastStateLogSignature = '';
  bluetoothDeviceDisconnectHandler = handleBluetoothDisconnected;
  bluetoothDevice.addEventListener('gattserverdisconnected', bluetoothDeviceDisconnectHandler);
  if (bluetoothGanMac) addBluetoothLog('GAN', '已载入已保存 MAC', bluetoothGanMac);
}

function handleBluetoothDisconnected() {
  cleanupBluetoothSubscriptions();
  resetBluetoothPhysicalState();
  resetBluetoothBattery();
  resetBluetoothGyro();
  setBluetoothStatusText('已断开');
  setBluetoothConnectedState(false);
  void refreshBluetoothReconnectDevices();
  addBluetoothLog('连接', '设备已断开', bluetoothDevice?.name || '');
}

function handleBluetoothConnectionError(error) {
  cleanupBluetoothSubscriptions();
  bluetoothGanMacPromptAllowed = true;
  resetBluetoothPhysicalState();
  resetBluetoothBattery();
  resetBluetoothGyro();
  if (bluetoothDevice?.gatt?.connected) bluetoothDevice.gatt.disconnect();
  setBluetoothStatusText(error.name === 'NotFoundError' ? '已取消' : '连接失败');
  setBluetoothConnectedState(false);
  void refreshBluetoothReconnectDevices();
  addBluetoothLog('错误', error.name || 'BluetoothError', error.message || String(error));
  console.error(error);
}

function isBluetoothAvailable() {
  return bluetoothAvailability().canRequest;
}

function bluetoothAvailability() {
  const secureContext = window.isSecureContext;
  const bluetooth = navigator.bluetooth;
  const hasBluetooth = Boolean(bluetooth);
  const hasRequestDevice = hasBluetooth && typeof bluetooth.requestDevice === 'function';
  const hasGetDevices = hasBluetooth && typeof bluetooth.getDevices === 'function';

  if (!secureContext) {
    return {
      canRequest: false,
      canReconnect: false,
      label: '需要安全环境',
      detail: 'Web Bluetooth 需要 HTTPS、localhost 或 127.0.0.1，当前页面不能打开设备选择器。',
    };
  }

  if (!hasBluetooth) {
    return {
      canRequest: false,
      canReconnect: false,
      label: '浏览器不支持',
      detail: '当前浏览器没有 Web Bluetooth。请使用支持 Web Bluetooth 的 Chrome 或 Edge，并从本地服务地址打开页面。',
    };
  }

  if (!hasRequestDevice) {
    return {
      canRequest: false,
      canReconnect: false,
      label: '设备选择不可用',
      detail: '当前浏览器暴露了 Web Bluetooth，但缺少 requestDevice，不能打开蓝牙设备选择器。',
    };
  }

  return {
    canRequest: true,
    canReconnect: hasGetDevices,
    label: '未连接',
    detail: `Web Bluetooth 可用 · ${bluetoothDeviceFilters.length} 个名称筛选 · 支持 GoCube / Rubik's Connected / Giiker / Mi Smart 解析 · 已授权 GAN 服务诊断`,
  };
}

async function requestBluetoothDevice(compatibilityMode) {
  const requestOptions = bluetoothRequestOptions(compatibilityMode);
  addBluetoothLog(
    '扫描',
    compatibilityMode ? '打开兼容设备选择器' : '打开设备选择器',
    bluetoothRequestSummary(requestOptions),
  );

  try {
    return await navigator.bluetooth.requestDevice(requestOptions);
  } catch (error) {
    if (!isManufacturerDataOptionError(error)) throw error;
    const fallbackOptions = bluetoothRequestOptions(compatibilityMode, { includeManufacturerData: false });
    addBluetoothLog('警告', 'GAN manufacturer data 授权不可用', '已退回基础服务扫描');
    return navigator.bluetooth.requestDevice(fallbackOptions);
  }
}

function bluetoothRequestOptions(compatibilityMode, options = {}) {
  const requestOptions = compatibilityMode
    ? { acceptAllDevices: true, optionalServices: bluetoothOptionalServices }
    : { filters: bluetoothDeviceFilters, optionalServices: bluetoothOptionalServices };
  if (options.includeManufacturerData !== false) {
    requestOptions.optionalManufacturerData = bluetoothGanManufacturerData;
  }
  return requestOptions;
}

function bluetoothRequestSummary(options) {
  const selector = options.acceptAllDevices ? '兼容扫描' : `${options.filters?.length || 0} 个名称筛选`;
  const serviceCount = Array.isArray(options.optionalServices) ? options.optionalServices.length : 0;
  const manufacturerCount = Array.isArray(options.optionalManufacturerData) ? options.optionalManufacturerData.length : 0;
  return [
    selector,
    `${serviceCount} 个服务授权`,
    manufacturerCount > 0 ? `${manufacturerCount} 个 GAN manufacturer data 授权` : '',
  ].filter(Boolean).join(' · ');
}

function isManufacturerDataOptionError(error) {
  return error instanceof TypeError || error?.name === 'TypeError';
}

function setBluetoothScanningState(scanning, compatibilityMode, label = '') {
  elements.bluetoothButton.disabled = scanning;
  elements.bluetoothAnyButton.disabled = scanning;
  elements.bluetoothReconnectButton.disabled = scanning;
  elements.bluetoothDisconnectButton.disabled = true;
  setBluetoothStatusText(label || (compatibilityMode ? '兼容扫描中...' : '扫描中...'));
}

function setBluetoothConnectedState(connected) {
  const availability = bluetoothAvailability();
  elements.bluetoothButton.disabled = connected;
  elements.bluetoothButton.textContent = '连接蓝牙魔方';
  elements.bluetoothAnyButton.disabled = connected;
  elements.bluetoothDisconnectButton.disabled = !connected;
  elements.bluetoothDisconnectButton.title = connected ? '断开当前蓝牙魔方' : '当前没有已连接设备';
  if (!connected && !availability.canRequest) {
    elements.bluetoothButton.disabled = true;
    elements.bluetoothAnyButton.disabled = true;
    setBluetoothStatusText(availability.label, availability.detail);
  } else if (!connected) {
    elements.bluetoothButton.disabled = false;
    elements.bluetoothAnyButton.disabled = false;
    if (
      elements.bluetoothStatus.textContent === '浏览器不支持'
      || elements.bluetoothStatus.textContent === '需要安全环境'
      || elements.bluetoothStatus.textContent === '设备选择不可用'
    ) {
      setBluetoothStatusText(availability.label, availability.detail);
    }
    if (!elements.bluetoothStatus.title) elements.bluetoothStatus.title = availability.detail;
  } else {
    setBluetoothDeviceNameStatus('已连接');
  }
  renderBluetoothReconnectButton();
  renderPreviewMode();
}

function setBluetoothStatusText(text, title = '') {
  elements.bluetoothStatus.textContent = text;
  elements.bluetoothStatus.title = title;
}

function setBluetoothDeviceNameStatus(fallback = '已连接', title = '') {
  const name = bluetoothDevice?.name || bluetoothDevice?.id || fallback;
  elements.bluetoothStatus.textContent = name;
  elements.bluetoothStatus.title = title || name;
}

async function bluetoothReconnectCandidate() {
  const devices = await refreshBluetoothReconnectDevices();
  return devices.find((device) => device?.gatt && !device.gatt.connected) || null;
}

async function refreshBluetoothReconnectDevices() {
  const devices = [];
  const availability = bluetoothAvailability();
  if (availability.canReconnect) {
    try {
      devices.push(...await navigator.bluetooth.getDevices());
    } catch (error) {
      console.warn('Bluetooth granted device lookup failed', error);
    }
  }
  if (bluetoothDevice && !devices.some((device) => isSameBluetoothDevice(device, bluetoothDevice))) {
    devices.unshift(bluetoothDevice);
  }

  bluetoothReconnectDevices = devices.filter((device) => device?.gatt);
  renderBluetoothReconnectButton();
  return bluetoothReconnectDevices;
}

function renderBluetoothReconnectButton() {
  const connected = Boolean(bluetoothDevice?.gatt?.connected);
  const availability = bluetoothAvailability();
  const count = bluetoothReconnectDevices.length;
  elements.bluetoothReconnectButton.disabled = !availability.canReconnect || connected || count === 0;
  if (!availability.canRequest) {
    elements.bluetoothReconnectButton.title = availability.detail;
  } else if (connected) {
    elements.bluetoothReconnectButton.title = '当前已连接蓝牙魔方';
  } else if (count > 0) {
    const names = bluetoothReconnectDevices.map((device) => device.name || device.id || '未命名设备').join(', ');
    elements.bluetoothReconnectButton.title = `重连：${names}`;
  } else if (availability.canReconnect) {
    elements.bluetoothReconnectButton.title = '没有已授权设备';
  } else {
    elements.bluetoothReconnectButton.title = '当前浏览器不支持读取已授权设备';
  }
}

function isSameBluetoothDevice(left, right) {
  if (left === right) return true;
  return Boolean(left?.id && right?.id && left.id === right.id);
}

async function resolveBluetoothGanMacFromAdvertisements(device, timeoutMs = 3200) {
  if (!isLikelyGanDevice(device) || bluetoothGanMac) return bluetoothGanMac;
  if (typeof device.watchAdvertisements !== 'function') {
    addBluetoothLog('GAN', '浏览器不能读取广播 MAC', '已跳过手动输入，仅使用已缓存 MAC 或等待后续广播');
    return '';
  }

  setBluetoothDeviceNameStatus('读取 GAN 广播...', '读取 GAN 广播 MAC，用于解密 GAN 加密包');
  addBluetoothLog('GAN', '读取广播 MAC', '用于解密 GAN 加密包');
  return new Promise((resolve) => {
    let done = false;
    const finish = (mac = '') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      device.removeEventListener('advertisementreceived', handleAdvertisement);
      if (mac) {
        if (device === bluetoothDevice) {
          setBluetoothGanMac(mac, device);
          addBluetoothLog('GAN', '已自动读取广播 MAC', mac);
        } else {
          addBluetoothLog('GAN', '忽略旧设备广播 MAC', mac);
        }
      } else {
        addBluetoothLog('GAN', '未读取到广播 MAC', '后台会继续尝试；不会弹出手动输入');
      }
      resolve(mac);
    };
    const handleAdvertisement = (event) => {
      const mac = ganMacFromManufacturerData(event.manufacturerData);
      if (mac) finish(mac);
    };
    const timer = setTimeout(() => finish(''), timeoutMs);
    device.addEventListener('advertisementreceived', handleAdvertisement);
    Promise.resolve(device.watchAdvertisements()).catch((error) => {
      addBluetoothLog('GAN', '广播读取失败', error.message || String(error));
      finish('');
    });
  });
}

function startBluetoothGanMacBackgroundRead(device, timeoutMs = 9000) {
  if (!isLikelyGanDevice(device) || bluetoothGanMac) return Promise.resolve(bluetoothGanMac);
  if (bluetoothGanMacReadPromise) return bluetoothGanMacReadPromise;
  bluetoothGanMacReadPromise = resolveBluetoothGanMacFromAdvertisements(device, timeoutMs)
    .then((mac) => {
      if (mac) void primePendingGanBluetoothInitialization();
      return mac;
    })
    .finally(() => {
      bluetoothGanMacReadPromise = null;
    });
  return bluetoothGanMacReadPromise;
}

function ganMacFromManufacturerData(manufacturerData) {
  if (!manufacturerData) return '';
  if (manufacturerData instanceof DataView) return ganMacFromAdvertisementData(dataViewBytes(manufacturerData).slice(2, 11));
  for (const id of bluetoothGanManufacturerData) {
    if (typeof manufacturerData.has === 'function' && manufacturerData.has(id)) {
      return ganMacFromAdvertisementData(manufacturerData.get(id));
    }
  }
  return '';
}

function ganMacFromAdvertisementData(value) {
  const bytes = value instanceof DataView ? dataViewBytes(value) : Uint8Array.from(value || []);
  if (bytes.length < 6) return '';
  return [...bytes.slice(-6)].reverse().map((byte) => byte.toString(16).padStart(2, '0')).join(':');
}

async function ensureBluetoothGanMac(options = {}) {
  if (bluetoothGanMac) return bluetoothGanMac;
  const cached = cachedBluetoothGanMac(bluetoothDevice);
  if (cached) {
    setBluetoothGanMac(cached, bluetoothDevice);
    return bluetoothGanMac;
  }
  if (options.waitForAdvertisement) {
    const mac = await startBluetoothGanMacBackgroundRead(bluetoothDevice, options.timeoutMs || 2200);
    if (mac) return mac;
  } else if (options.background !== false) {
    void startBluetoothGanMacBackgroundRead(bluetoothDevice, options.timeoutMs || 9000);
  }
  if (options.allowPrompt && bluetoothGanMacPromptAllowed) {
    addBluetoothLog('GAN', '已禁用手动 MAC 输入', '正在后台读取广播 MAC');
  }
  return '';
}

function setBluetoothGanMac(mac, device) {
  bluetoothGanMac = normalizeBluetoothMac(mac);
  if (!bluetoothGanMac) return;
  const key = bluetoothGanStorageKey(device);
  if (key) localStorage.setItem(key, bluetoothGanMac);
  const nameKey = bluetoothGanNameStorageKey(device);
  if (nameKey) localStorage.setItem(nameKey, bluetoothGanMac);
  localStorage.setItem('trainTimer.ganMac.last', bluetoothGanMac);
}

function cachedBluetoothGanMac(device, options = {}) {
  const key = bluetoothGanStorageKey(device);
  const nameKey = bluetoothGanNameStorageKey(device);
  return normalizeBluetoothMac(
    (key ? localStorage.getItem(key) : '')
      || (nameKey ? localStorage.getItem(nameKey) : '')
      || (options.includeLast === false ? '' : localStorage.getItem('trainTimer.ganMac.last')),
  );
}

function bluetoothGanStorageKey(device) {
  const identity = device?.id || device?.name || '';
  return identity ? `trainTimer.ganMac.${identity}` : '';
}

function bluetoothGanNameStorageKey(device) {
  const name = String(device?.name || '').trim();
  return name ? `trainTimer.ganMac.name.${name}` : '';
}

function normalizeBluetoothMac(mac) {
  const pairs = String(mac || '').match(/[0-9a-f]{2}/gi);
  return pairs && pairs.length === 6 ? pairs.map((pair) => pair.toLowerCase()).join(':') : '';
}

async function discoverBluetoothServices(server) {
  const services = await server.getPrimaryServices();
  const detail = [];
  let notifyCount = 0;
  let writeCount = 0;

  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const serviceLabel = bluetoothUuidLabel(service.uuid);
    detail.push(`${serviceLabel}:${characteristics.length}`);
    addBluetoothLog('服务', serviceLabel, `${characteristics.length} 个特征`);
    if (isGanServiceUuid(service.uuid)) {
      addBluetoothLog('GAN', `${bluetoothGanServiceLabel(service.uuid)} 已发现`, '服务已授权，正在检查可订阅特征');
    }

    for (const characteristic of characteristics) {
      const properties = characteristic.properties;
      const propertyText = characteristicProperties(properties).join(', ') || '无属性';
      addBluetoothLog('特征', bluetoothUuidLabel(characteristic.uuid), `${serviceLabel} · ${propertyText}`);
      if (isBatteryLevelCharacteristic(characteristic.uuid)) {
        await readBluetoothBatteryLevel(characteristic);
      }

      if (!properties.notify && !properties.indicate) continue;
      if (await subscribeBluetoothCharacteristic(characteristic)) notifyCount += 1;
    }

    writeCount += await primeBluetoothService(service, characteristics);
  }

  return {
    serviceCount: services.length,
    notifyCount,
    writeCount,
    detail: detail.join(' · '),
  };
}

async function readBluetoothBatteryLevel(characteristic) {
  if (!characteristic.properties.read) return;

  try {
    const value = await characteristic.readValue();
    if (!updateBluetoothBattery(decodeBatteryLevel(value), bluetoothUuidLabel(characteristic.uuid))) {
      addBluetoothLog('警告', '电量数据无效', dataViewToHex(value));
    }
  } catch (error) {
    addBluetoothLog('警告', '读取电量失败', error.message || String(error));
  }
}

async function subscribeBluetoothCharacteristic(characteristic) {
  try {
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleBluetoothNotification);
    bluetoothSubscriptions.push(characteristic);
    addBluetoothLog('通知', bluetoothUuidLabel(characteristic.uuid), characteristicProperties(characteristic.properties).join(', '));
    return true;
  } catch (error) {
    addBluetoothLog('警告', `订阅失败 ${bluetoothUuidLabel(characteristic.uuid)}`, error.message || String(error));
    console.warn('Bluetooth notification subscription failed', characteristic.uuid, error);
    return false;
  }
}

async function primeBluetoothService(service, characteristics) {
  const serviceUuid = String(service.uuid).toLowerCase();
  if (isGanServiceUuid(serviceUuid)) {
    return primeGanBluetoothService(service, characteristics);
  }
  if (serviceUuid === bluetoothGiikerBatteryServiceUuid) {
    return primeGiikerBatteryService(service, characteristics);
  }
  if (serviceUuid !== bluetoothGoCubeServiceUuid) return 0;

  const writeCharacteristic = characteristics.find((characteristic) => {
    const uuid = String(characteristic.uuid).toLowerCase();
    return uuid === bluetoothGoCubeWriteUuid
      && (characteristic.properties.write || characteristic.properties.writeWithoutResponse);
  });

  if (!writeCharacteristic) {
    addBluetoothLog('警告', 'GoCube 写特征未找到', bluetoothUuidLabel(service.uuid));
    return 0;
  }

  let count = 0;
  count += await writeBluetoothValue(writeCharacteristic, [51], 'GoCube 状态请求');
  count += await writeBluetoothValue(writeCharacteristic, [50], 'GoCube 电量请求');
  return count;
}

async function primeGanBluetoothService(service, characteristics) {
  const protocol = bluetoothGanProtocolForService(service.uuid);
  if (!protocol) {
    addBluetoothLog('GAN', '暂未支持的 GAN 协议', bluetoothUuidLabel(service.uuid));
    return 0;
  }

  const readCharacteristic = characteristics.find((characteristic) => (
    normalizeBluetoothUuid(characteristic.uuid) === protocol.readUuid
  ));
  const writeCharacteristic = characteristics.find((characteristic) => (
    normalizeBluetoothUuid(characteristic.uuid) === protocol.writeUuid
    && (characteristic.properties.write || characteristic.properties.writeWithoutResponse)
  ));
  bluetoothGanSession = {
    ...protocol,
    keyVersion: String(bluetoothDevice?.name || '').startsWith('AiCube') && protocol.protocol === 'v2' ? 1 : 0,
    readUuid: protocol.readUuid,
    writeUuid: protocol.writeUuid,
  };
  bluetoothGanLastMoveCounter = null;
  bluetoothGanDecodeWarning = '';
  bluetoothGanLastStateLogAt = 0;
  bluetoothGanLastStateLogSignature = '';

  if (!readCharacteristic) {
    addBluetoothLog('警告', `${protocol.label} 读特征未找到`, bluetoothUuidLabel(service.uuid));
  }
  if (!writeCharacteristic) {
    addBluetoothLog('警告', `${protocol.label} 写特征未找到`, bluetoothUuidLabel(service.uuid));
    return 0;
  }

  const mac = await ensureBluetoothGanMac({ waitForAdvertisement: true, timeoutMs: 2200 });
  if (!mac) {
    bluetoothGanPendingInit = { protocol: bluetoothGanSession, writeCharacteristic };
    setBluetoothDeviceNameStatus('GAN', '正在后台读取 GAN 广播 MAC，用于解析状态、转动和电量');
    addBluetoothLog('GAN', `${protocol.label} 等待后台 MAC`, '不会弹出手动输入；读到广播 MAC 后会自动初始化');
    void startBluetoothGanMacBackgroundRead(bluetoothDevice, 15000);
    return 0;
  }

  return writeGanBluetoothInitialization(writeCharacteristic, bluetoothGanSession);
}

async function primePendingGanBluetoothInitialization() {
  if (!bluetoothGanPendingInit || !bluetoothGanMac || !bluetoothDevice?.gatt?.connected) return 0;
  const pending = bluetoothGanPendingInit;
  bluetoothGanPendingInit = null;
  const count = await writeGanBluetoothInitialization(pending.writeCharacteristic, pending.protocol);
  if (count > 0) {
    setBluetoothDeviceNameStatus('已连接', `${pending.protocol.label} 已用后台 MAC 自动初始化`);
    addBluetoothLog('GAN', '后台 MAC 初始化完成', `${pending.protocol.label} · ${count} 次请求`);
  }
  return count;
}

async function writeGanBluetoothInitialization(writeCharacteristic, protocol) {
  const mac = bluetoothGanMac;
  if (!mac) return 0;
  try {
    const data = await postJson('/api/bluetooth/gan/requests', {
      protocol: protocol.protocol,
      mac,
      keyVersion: protocol.keyVersion,
    });
    let count = 0;
    for (const request of data.requests || []) {
      count += await writeBluetoothValue(writeCharacteristic, request.bytes, `${protocol.label} ${request.label}`);
    }
    return count;
  } catch (error) {
    addBluetoothLog('错误', `${protocol.label} 初始化失败`, error.message || String(error));
    return 0;
  }
}

async function primeGiikerBatteryService(service, characteristics) {
  const writeCharacteristic = characteristics.find((characteristic) => {
    const uuid = String(characteristic.uuid).toLowerCase();
    return uuid === bluetoothGiikerBatteryWriteUuid
      && (characteristic.properties.write || characteristic.properties.writeWithoutResponse);
  });

  if (!writeCharacteristic) {
    addBluetoothLog('警告', 'Giiker 电量写特征未找到', bluetoothUuidLabel(service.uuid));
    return 0;
  }

  return writeBluetoothValue(writeCharacteristic, [0xb5], 'Giiker 电量请求');
}

async function writeBluetoothValue(characteristic, bytes, label) {
  try {
    const payload = Uint8Array.from(bytes);
    if (characteristic.properties.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function') {
      await characteristic.writeValueWithoutResponse(payload);
    } else {
      await characteristic.writeValue(payload);
    }
    addBluetoothLog('写入', label, `${bluetoothUuidLabel(characteristic.uuid)} ${bytesToHex(payload)}`);
    return 1;
  } catch (error) {
    addBluetoothLog('警告', `${label} 写入失败`, error.message || String(error));
    return 0;
  }
}

function handleBluetoothNotification(event) {
  const characteristic = event.target;
  void processBluetoothPacket(characteristic.uuid, characteristic.value, bluetoothDevice?.name || '蓝牙魔方');
}

async function processBluetoothPacket(uuid, value, deviceName) {
  const hex = dataViewToHex(value);
  const label = bluetoothUuidLabel(uuid);
  const ganPacket = isGanPacketSource(uuid, deviceName);
  if (isBatteryLevelCharacteristic(uuid)) {
    const batteryLevel = decodeBatteryLevel(value);
    if (updateBluetoothBattery(batteryLevel, label)) {
      elements.bluetoothStatus.title = `${uuid} ${hex}`;
      return;
    }
  }

  if (ganPacket) {
    await processGanBluetoothPacket(uuid, value, deviceName, hex, label);
    return;
  }

  if (isGiikerBatteryCharacteristic(uuid)) {
    const batteryLevel = decodeGiikerBatteryLevel(value);
    if (updateBluetoothBattery(batteryLevel, label)) {
      elements.bluetoothStatus.title = `${uuid} ${hex}`;
      addBluetoothLog('数据/电量', label, `${hex} · battery=${batteryLevel}%`);
      return;
    }
  }

  const decoded = decodeBluetoothMoves(value);
  if (decoded.batteryLevel != null) {
    updateBluetoothBattery(decoded.batteryLevel, decoded.protocol || label);
  }
  const packetSignature = bluetoothMovePacketSignature(decoded);
  const duplicateMovePacket = Boolean(packetSignature && packetSignature === lastBluetoothMovePacketSignature);
  if (packetSignature) lastBluetoothMovePacketSignature = packetSignature;
  const parsedMoves = duplicateMovePacket ? [] : decoded.moves;
  const moveHandling = handleBluetoothMovesForCurrentState(parsedMoves, label, decoded.protocol || '', deviceName);
  const trackingMoves = moveHandling.trackingMoves;
  elements.bluetoothStatus.title = `${uuid} ${hex}`;
  const rawGanPacket = ganPacket && parsedMoves.length === 0 && decoded.protocol === 'raw';
  const statusDetail = parsedMoves.length > 0
    ? `${parsedMoves.join(' ')} · ${moveHandling.statusLabel || (trackingMoves ? (bluetoothSolved ? '已复原' : '未复原') : '等待计时')}`
    : (rawGanPacket
      ? `GAN 原始数据 ${shortUuid(uuid)} ${hex.slice(0, 23)}`
      : (duplicateMovePacket
      ? `${decoded.moves.join(' ')} · 重复状态包`
      : (decoded.batteryLevel != null ? `电量 ${decoded.batteryLevel}%` : `${label} ${hex.slice(0, 17)}`)));
  const ignoredReason = duplicateMovePacket
    ? '重复状态包'
    : (moveHandling.ignoredReason || (parsedMoves.length > 0 && !trackingMoves ? '等待计时' : ''));
  elements.bluetoothStatus.title = `${deviceName} · ${statusDetail} · ${uuid} ${hex}`;
  const logDetail = logBluetoothPacket(hex, decoded, ignoredReason);
  addBluetoothLog(
    moveHandling.logKind || (parsedMoves.length > 0
      ? (trackingMoves ? '数据/转动' : '数据/预备转动')
      : (rawGanPacket ? '数据/GAN原始' : (duplicateMovePacket ? '数据/重复' : '数据'))),
    label,
    rawGanPacket ? `${logDetail} · GAN 加密包暂未解析为转动` : logDetail,
  );
  console.info('Bluetooth cube notification', {
    characteristic: uuid,
    value: hex,
    moves: parsedMoves,
    duplicate: duplicateMovePacket,
    tracked: trackingMoves,
  });
}

async function processGanBluetoothPacket(uuid, value, deviceName, hex, label) {
  const packetSequence = ++bluetoothGanPacketSequence;
  const packetReceivedAt = performance.now();
  const protocol = bluetoothGanSession || bluetoothGanProtocolForCharacteristic(uuid) || bluetoothGanProtocolForDevice(deviceName);
  if (!protocol) {
    elements.bluetoothStatus.title = `${deviceName} · GAN 协议未知`;
    addBluetoothLog('数据/GAN原始', label, `${hex} · 未识别 GAN 协议，已跳过通用 Giiker 解码`);
    return;
  }

  const mac = await ensureBluetoothGanMac({ allowPrompt: false });
  if (!mac) {
    elements.bluetoothStatus.title = '缺少 MAC，不能解密 GAN 状态、转动和电量';
    if (bluetoothGanDecodeWarning !== 'missing-mac') {
      bluetoothGanDecodeWarning = 'missing-mac';
      addBluetoothLog('GAN', `${protocol.label} 等待后台 MAC`, '已跳过通用 Giiker 解码，避免把加密字节误判成转动');
    }
    void startBluetoothGanMacBackgroundRead(bluetoothDevice, 15000);
    addBluetoothLog('数据/GAN原始', label, `${hex} · 等待后台 MAC，未解析`);
    return;
  }

  let decoded;
  try {
    decoded = await postJson('/api/bluetooth/gan/decode', {
      protocol: protocol.protocol,
      mac,
      keyVersion: protocol.keyVersion || 0,
      bytes: [...dataViewBytes(value)],
    });
  } catch (error) {
    elements.bluetoothStatus.title = error.message || String(error);
    addBluetoothLog('错误', `${protocol.label} 解码失败`, `${label} · ${error.message || String(error)}`);
    return;
  }

  const physicalFaces = decoded.facelets ? facesFromFacelets(decoded.facelets) : null;
  const statePacketSolved = decoded.stateSolved === true || Boolean(physicalFaces && isSolvedFaces(physicalFaces));
  if (statePacketSolved && decoded.stateSolved !== true) decoded = { ...decoded, stateSolved: true };
  const stoppedFromStatePacket = statePacketSolved
    && stopTimingFromBluetoothSolved(packetReceivedAt, { byStatePacket: true });
  const hasMoveCounter = Number.isInteger(decoded.moveCounter);
  const duplicateMovePacket = hasMoveCounter
    && decoded.moves?.length > 0
    && decoded.moveCounter === bluetoothGanLastMoveCounter;
  const parsedMoves = duplicateMovePacket ? [] : (Array.isArray(decoded.moves) ? decoded.moves : []);
  if (hasMoveCounter && (decoded.mode === 'state' || decoded.mode === 'move' || parsedMoves.length > 0)) {
    bluetoothGanLastMoveCounter = decoded.moveCounter;
  }

  const wasTimingBeforeMoves = appState === 'timing';
  const moveHandling = handleBluetoothMovesForCurrentState(parsedMoves, label, decoded.protocol || protocol.label, deviceName);
  const trackingMoves = moveHandling.trackingMoves;
  const stoppedFromMoves = wasTimingBeforeMoves && appState !== 'timing' && bluetoothSolved;
  const solvedByStatePacket = stoppedFromStatePacket || markGanBluetoothStateSolved(decoded);
  const gyroOnlyPacket = isGanGyroOnlyPacket(decoded, parsedMoves);
  if (gyroOnlyPacket) {
    if (packetSequence < bluetoothGanLatestAppliedGyroSequence) return;
    bluetoothGanLatestAppliedGyroSequence = packetSequence;
  }
  const updatePacketUi = () => {
    if (decoded.batteryLevel != null) updateBluetoothBattery(decoded.batteryLevel, decoded.protocol || protocol.label);
    if (decoded.gyro) updateBluetoothGyro(decoded.gyro);
    if (decoded.facelets) updateBluetoothPhysicalState(decoded, { faces: physicalFaces });
    if (stoppedFromStatePacket) renderBluetoothMoves();
  };
  if (stoppedFromStatePacket || stoppedFromMoves) {
    requestAnimationFrame(updatePacketUi);
  } else {
    updatePacketUi();
  }

  const statusDetail = parsedMoves.length > 0
    ? `${parsedMoves.join(' ')} · ${moveHandling.statusLabel || (trackingMoves ? (bluetoothSolved ? '已复原' : '未复原') : '等待计时')}`
    : ganBluetoothStatusDetail(decoded, label, hex, duplicateMovePacket);
  const ignoredReason = duplicateMovePacket
    ? '重复转动包'
    : (moveHandling.ignoredReason || (parsedMoves.length > 0 && !trackingMoves ? '等待计时' : ''));
  elements.bluetoothStatus.title = `${deviceName} · ${statusDetail} · ${uuid} ${hex}`;
  if (shouldLogGanBluetoothPacket(decoded, parsedMoves, duplicateMovePacket)) {
    addBluetoothLog(
      moveHandling.logKind || ganBluetoothLogKind(decoded, parsedMoves, trackingMoves, duplicateMovePacket),
      label,
      ganBluetoothPacketLog(hex, decoded, ignoredReason),
    );
  }
  if (!stoppedFromStatePacket && solvedByStatePacket) finishTimingFromBluetooth(packetReceivedAt);
  if (!gyroOnlyPacket) console.info('GAN Bluetooth cube notification', {
    characteristic: uuid,
    value: hex,
    decoded,
    moves: parsedMoves,
    duplicate: duplicateMovePacket,
    tracked: trackingMoves,
  });
}

function isGanGyroOnlyPacket(decoded, parsedMoves = []) {
  return Boolean(
    decoded?.gyro
    && parsedMoves.length === 0
    && decoded.batteryLevel == null
    && !decoded.facelets
    && decoded.mode === 'gyro'
  );
}

function shouldLogGanBluetoothPacket(decoded, parsedMoves, duplicateMovePacket) {
  if (!decoded) return true;
  if (duplicateMovePacket) return false;
  if (parsedMoves.length > 0) return true;
  if (decoded.batteryLevel != null || decoded.mode === 'hardware' || decoded.mode === 'invalid') return true;
  if (decoded.stateSolved === true) return true;
  if (!isHighFrequencyGanStatePacket(decoded)) return true;

  const now = performance.now();
  const signature = highFrequencyGanStateSignature(decoded);
  const interval = isGanGyroOnlyPacket(decoded, parsedMoves)
    ? bluetoothGyroLogIntervalMs
    : bluetoothGanStateLogIntervalMs;
  if (signature === bluetoothGanLastStateLogSignature && now - bluetoothGanLastStateLogAt < interval) return false;
  bluetoothGanLastStateLogSignature = signature;
  bluetoothGanLastStateLogAt = now;
  return true;
}

function isHighFrequencyGanStatePacket(decoded) {
  return Boolean(decoded.gyro || decoded.facelets || decoded.mode === 'state');
}

function highFrequencyGanStateSignature(decoded) {
  return [
    decoded.protocol || '',
    decoded.mode || '',
    decoded.stateSignature || decoded.facelets || '',
    decoded.stateSolved === true ? 'solved' : 'active',
  ].join('|');
}

function ganBluetoothStatusDetail(decoded, label, hex, duplicateMovePacket) {
  if (duplicateMovePacket) return `${decoded.moves.join(' ')} · 重复转动包`;
  if (decoded.batteryLevel != null) return `电量 ${decoded.batteryLevel}%`;
  if (decoded.gyro) return `GAN 陀螺仪 · q=${formatGyroQuaternion(decoded.gyro.quaternion)}`;
  if (decoded.mode === 'state') {
    const stateLabel = decoded.stateSolved === true ? '已复原' : '未复原';
    return `GAN 状态包 · ${stateLabel} · 色块已同步 · counter=${decoded.moveCounter ?? '-'}`;
  }
  if (decoded.mode === 'hardware') return 'GAN 硬件信息';
  if (decoded.mode === 'invalid') return `GAN 解密结果无效 · ${hex.slice(0, 23)}`;
  return `${label} ${hex.slice(0, 17)}`;
}

function ganBluetoothLogKind(decoded, parsedMoves, trackingMoves, duplicateMovePacket) {
  if (parsedMoves.length > 0) return trackingMoves ? '数据/转动' : '数据/预备转动';
  if (duplicateMovePacket) return '数据/重复';
  if (decoded.batteryLevel != null) return '数据/电量';
  if (decoded.gyro) return '数据/GAN陀螺仪';
  if (decoded.stateSolved === true) return '数据/GAN已复原';
  if (decoded.mode === 'state') return '数据/GAN状态';
  if (decoded.mode === 'hardware') return '数据/GAN硬件';
  return '数据/GAN';
}

function ganBluetoothPacketLog(hex, decoded, ignoredReason = '') {
  const detail = [hex];
  if (decoded.protocol) detail.push(`protocol=${decoded.protocol}`);
  if (decoded.mode) detail.push(`mode=${decoded.mode}`);
  if (Number.isInteger(decoded.moveCounter)) detail.push(`counter=${decoded.moveCounter}`);
  if (decoded.batteryLevel != null) detail.push(`battery=${decoded.batteryLevel}%`);
  if (decoded.gyro) {
    detail.push(`gyro=q(${formatGyroQuaternion(decoded.gyro.quaternion)})`);
    detail.push(`velocity=${formatGyroVelocity(decoded.gyro.velocity)}`);
  }
  if (decoded.stateSignature) detail.push(`state=${decoded.stateSignature}`);
  if (decoded.stateSolved === true) detail.push('stateSolved=true');
  if (decoded.stateSolved === false) detail.push('stateSolved=false');
  if (decoded.facelets) detail.push(`facelets=${decoded.facelets}`);
  if (Array.isArray(decoded.decryptedBytes)) detail.push(`decrypted=${bytesToHex(decoded.decryptedBytes)}`);
  if (Array.isArray(decoded.historyMoves) && decoded.historyMoves.length > decoded.moves.length) {
    detail.push(`history=${decoded.historyMoves.join(' ')}`);
  }
  if (Array.isArray(decoded.moves) && decoded.moves.length > 0) detail.push(`moves=${decoded.moves.join(' ')}`);
  if (ignoredReason) detail.push(`未计入=${ignoredReason}`);
  return detail.join(' · ');
}

function markGanBluetoothStateSolved(decoded, options = {}) {
  if ((decoded.stateSolved !== true && options.force !== true) || appState !== 'timing') return false;
  bluetoothSolved = true;
  bluetoothSolvedByStatePacket = true;
  if (options.render !== false) renderBluetoothMoves();
  return true;
}

function stopTimingFromBluetoothSolved(finishedAt = performance.now(), options = {}) {
  if (appState !== 'timing') return false;
  bluetoothSolved = true;
  bluetoothSolvedByStatePacket = options.byStatePacket === true;
  finishSource = 'bluetooth';
  void finishTiming({ finishedAt });
  return true;
}

function finishTimingFromBluetooth(finishedAt = performance.now()) {
  if (appState !== 'timing' || !bluetoothSolved) return;
  stopTimingFromBluetoothSolved(finishedAt, { byStatePacket: bluetoothSolvedByStatePacket });
}

function cleanupBluetoothSubscriptions() {
  for (const characteristic of bluetoothSubscriptions) {
    characteristic.removeEventListener('characteristicvaluechanged', handleBluetoothNotification);
  }
  bluetoothSubscriptions = [];
}

function updateBluetoothBattery(level, source = '') {
  if (!Number.isInteger(level) || level < 0 || level > 100) return false;
  bluetoothBatteryLevel = level;
  renderBluetoothBattery();
  addBluetoothLog('电量', `${level}%`, source);
  return true;
}

function resetBluetoothBattery() {
  bluetoothBatteryLevel = null;
  renderBluetoothBattery();
}

function renderBluetoothBattery() {
  elements.bluetoothBattery.textContent = bluetoothBatteryLevel == null ? '电量 -' : `电量 ${bluetoothBatteryLevel}%`;
  elements.bluetoothBattery.title = bluetoothBatteryLevel == null ? '未读取到蓝牙电量' : `蓝牙电量 ${bluetoothBatteryLevel}%`;
  elements.bluetoothBattery.classList.toggle('low', bluetoothBatteryLevel != null && bluetoothBatteryLevel <= 20);
  renderBluetoothFeed();
}

function updateBluetoothGyro(gyro) {
  if (!gyro?.quaternion) return;
  bluetoothGyroLastUpdateAt = performance.now();
  const basisQuaternion = bluetoothGyroQuaternionFromPacket(gyro.quaternion);
  if (!basisQuaternion) return;
  if (bluetoothGyroLastBasisQuaternion && bluetoothGyroLastBasisQuaternion.dot(basisQuaternion) < 0) {
    basisQuaternion.set(-basisQuaternion.x, -basisQuaternion.y, -basisQuaternion.z, -basisQuaternion.w);
  }
  if (!bluetoothGyroReferenceInverse) {
    bluetoothGyroReferenceInverse = new THREE.Quaternion();
    addBluetoothLog('陀螺仪', '绝对姿态已同步', '白面/黄面朝上由 GAN q 参数直接驱动');
  }
  bluetoothGyroLastBasisQuaternion = basisQuaternion.clone();
  const relativeQuaternion = basisQuaternion.clone();
  const displayQuaternion = cube3d
    ? cube3d.baseQuaternion.clone().multiply(relativeQuaternion)
    : relativeQuaternion;
  const mappedVelocity = ganGyroVelocityToCube3dBasis(gyro.velocity || {});
  bluetoothGyro = {
    quaternion: {
      x: basisQuaternion.x,
      y: basisQuaternion.y,
      z: basisQuaternion.z,
      w: basisQuaternion.w,
    },
    rawQuaternion: { ...gyro.quaternion },
    displayQuaternion: {
      x: displayQuaternion.x,
      y: displayQuaternion.y,
      z: displayQuaternion.z,
      w: displayQuaternion.w,
    },
    velocity: mappedVelocity || { ...(gyro.velocity || {}) },
    rawVelocity: gyro.velocity ? { ...gyro.velocity } : null,
    raw: gyro.raw ? { ...gyro.raw } : null,
    isoTime: new Date().toISOString(),
  };
  if (cube3d?.targetQuaternion) {
    cube3d.targetQuaternion.copy(displayQuaternion);
    scheduleBluetoothCube3dAnimation();
  }
  scheduleBluetoothCube3dTelemetryRender();
}

function resetBluetoothGyro() {
  bluetoothGyro = null;
  bluetoothGyroLastUpdateAt = 0;
  bluetoothGyroReferenceInverse = null;
  bluetoothGyroLastBasisQuaternion = null;
  if (cube3dTelemetryTimer) {
    window.clearTimeout(cube3dTelemetryTimer);
    cube3dTelemetryTimer = 0;
  }
  if (cube3dTelemetryFrame) {
    cancelAnimationFrame(cube3dTelemetryFrame);
    cube3dTelemetryFrame = 0;
  }
  if (cube3d?.targetQuaternion) cube3d.targetQuaternion.copy(cube3d.baseQuaternion);
  markBluetoothCube3dDirty();
  renderBluetoothCube3dTelemetry();
}

function bluetoothGyroQuaternionFromPacket(quaternion = {}) {
  const mapped = ganGyroQuaternionToCube3dBasis(quaternion);
  if (!mapped) return null;
  const output = new THREE.Quaternion(mapped.x, mapped.y, mapped.z, mapped.w);
  output.normalize();
  return output;
}

function updateBluetoothPhysicalState(decoded, options = {}) {
  const faces = options.faces || facesFromFacelets(decoded.facelets);
  if (!faces) return;
  const facelets = String(decoded.facelets || '');
  const changed = facelets !== bluetoothPhysicalFacelets;
  bluetoothPhysicalFacelets = decoded.facelets;
  bluetoothPhysicalFaces = faces;
  bluetoothPhysicalStateTime = new Date().toISOString();
  bluetoothPhysicalStateReceivedAt = performance.now();
  if (options.render === false) {
    if (changed) renderBluetoothCube3dLiveFaces(faces);
    return faces;
  }
  if (!changed) return faces;
  renderBluetoothCube3dLiveFaces(faces);
  renderBluetoothMoves({ skipStatePreview: !elements.bluetoothLogDialog?.open });
  return faces;
}

function renderBluetoothCube3dLiveFaces(faces = bluetoothPhysicalFaces) {
  if (!faces || !cube3d || !bluetoothLivePreviewMode()) return;
  renderBluetoothCube3d(faces, `GAN 实时状态 · ${isSolvedFaces(faces) ? '已复原' : '未复原'}`);
}

function resetBluetoothPhysicalState() {
  bluetoothPhysicalFacelets = '';
  bluetoothPhysicalFaces = null;
  bluetoothPhysicalStateTime = '';
  bluetoothPhysicalStateReceivedAt = 0;
  renderPreviewMode();
}

function facesFromFacelets(facelets) {
  const text = String(facelets || '');
  if (!/^[URFDLB]{54}$/.test(text)) return null;
  const output = {};
  for (const [faceIndex, face] of cube3dFaces.entries()) {
    output[face] = [];
    const offset = faceIndex * 9;
    for (let row = 0; row < 3; row += 1) {
      output[face][row] = [];
      for (let col = 0; col < 3; col += 1) {
        const stickerFace = text[offset + row * 3 + col];
        output[face][row][col] = {
          face: stickerFace,
          color: cube3dFallbackColors[stickerFace] || '#d1d5db',
        };
      }
    }
  }
  return output;
}

function openBluetoothLogDialog() {
  renderBluetoothLog();
  if (!elements.bluetoothLogDialog.open) elements.bluetoothLogDialog.showModal();
}

function addBluetoothLog(kind, message, detail = '') {
  bluetoothLog.unshift({
    time: new Date().toLocaleTimeString(),
    isoTime: new Date().toISOString(),
    kind,
    message,
    detail,
  });
  bluetoothLog = bluetoothLog.slice(0, 120);
  renderBluetoothFeed();
  if (elements.bluetoothLogDialog?.open) renderBluetoothLog();
}

function renderBluetoothFeed() {
  if (!elements.bluetoothFeedMeta || !elements.bluetoothFeedRows) return;
  const connected = bluetoothDevice?.gatt?.connected ? '已连接' : '未连接';
  const battery = bluetoothBatteryLevel == null ? '' : ` · 电量 ${bluetoothBatteryLevel}%`;
  elements.bluetoothFeedMeta.textContent = bluetoothLog.length === 0
    ? `${connected}${battery}`
    : `${connected}${battery} · ${bluetoothLog.length} 条`;

  if (bluetoothLog.length === 0) {
    const row = document.createElement('div');
    row.className = 'bluetooth-feed-row';
    row.title = '暂无蓝牙命令';
    const time = document.createElement('span');
    time.className = 'feed-time';
    time.textContent = '-';
    const kind = document.createElement('span');
    kind.className = 'feed-kind';
    kind.textContent = '状态';
    const message = document.createElement('span');
    message.className = 'feed-message';
    message.textContent = '暂无蓝牙命令';
    const detail = document.createElement('span');
    detail.className = 'feed-detail';
    detail.textContent = '等待蓝牙连接或通知数据';
    row.append(time, kind, message, detail);
    elements.bluetoothFeedRows.replaceChildren(row);
    return;
  }

  elements.bluetoothFeedRows.replaceChildren(
    ...bluetoothLog.slice(0, 24).map((entry) => {
      const row = document.createElement('div');
      row.className = `bluetooth-feed-row ${bluetoothFeedKindClass(entry.kind)}`.trim();
      const detail = [entry.message, entry.detail].filter(Boolean).join(' · ');
      row.title = [entry.isoTime, entry.kind, detail].filter(Boolean).join(' · ');
      const time = document.createElement('span');
      time.className = 'feed-time';
      time.textContent = entry.time;
      const kind = document.createElement('span');
      kind.className = 'feed-kind';
      kind.textContent = entry.kind;
      const message = document.createElement('span');
      message.className = 'feed-message';
      message.textContent = entry.message || '-';
      const detailLine = document.createElement('span');
      detailLine.className = 'feed-detail';
      detailLine.textContent = entry.detail || entry.message || '-';
      row.append(time, kind, message, detailLine);
      return row;
    }),
  );
}

function bluetoothFeedKindClass(kind) {
  if (/错误/.test(kind)) return 'error';
  if (/警告/.test(kind)) return 'warning';
  if (/转动|预备/.test(kind)) return 'move';
  return '';
}

function renderBluetoothLog() {
  const connected = bluetoothDevice?.gatt?.connected ? '已连接' : '未连接';
  const battery = bluetoothBatteryLevel == null ? '电量 -' : `电量 ${bluetoothBatteryLevel}%`;
  elements.bluetoothLogMeta.textContent = `${connected} · ${battery} · ${bluetoothLog.length} 条事件 · ${bluetoothMoves.length} 次转动`;
  renderBluetoothMoves();

  if (bluetoothLog.length === 0) {
    elements.bluetoothLogRows.innerHTML = '<div class="bluetooth-log-row"><span>-</span><span>状态</span><span>暂无蓝牙事件</span></div>';
    return;
  }

  elements.bluetoothLogRows.replaceChildren(
    ...bluetoothLog.map((entry) => {
      const row = document.createElement('div');
      row.className = 'bluetooth-log-row';
      row.innerHTML = `
        <span title="${escapeHtml(entry.isoTime)}">${escapeHtml(entry.time)}</span>
        <span>${escapeHtml(entry.kind)}</span>
        <span>${escapeHtml([entry.message, entry.detail].filter(Boolean).join(' · '))}</span>
      `;
      return row;
    }),
  );
}

function clearBluetoothLog() {
  bluetoothLog = [];
  bluetoothMoves = [];
  bluetoothSolved = false;
  lastBluetoothMovePacketSignature = '';
  bluetoothGanLastMoveCounter = null;
  bluetoothGanDecodeWarning = '';
  bluetoothGanLastStateLogAt = 0;
  bluetoothGanLastStateLogSignature = '';
  renderBluetoothMoves();
  renderBluetoothFeed();
  renderBluetoothLog();
}

async function copyBluetoothLog() {
  const text = JSON.stringify(bluetoothLogPayload(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    elements.copyBluetoothLogButton.textContent = '已复制';
    setTimeout(() => {
      elements.copyBluetoothLogButton.textContent = '复制日志';
    }, 900);
  } catch (error) {
    addBluetoothLog('错误', '复制日志失败', error.message || String(error));
  }
}

function exportBluetoothLog() {
  downloadTextFile(
    `traintimer-bluetooth-log-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`,
    `${JSON.stringify(bluetoothLogPayload(), null, 2)}\n`,
    'application/json;charset=utf-8',
  );
}

function bluetoothLogPayload() {
  return {
    exportedAt: new Date().toISOString(),
    connected: Boolean(bluetoothDevice?.gatt?.connected),
    device: bluetoothDevice ? {
      name: bluetoothDevice.name || '',
      id: bluetoothDevice.id || '',
    } : null,
    batteryLevel: bluetoothBatteryLevel,
    gan: {
      mac: bluetoothGanMac,
      protocol: bluetoothGanSession?.protocol || '',
      label: bluetoothGanSession?.label || '',
      moveCounter: bluetoothGanLastMoveCounter,
    },
    webBluetooth: bluetoothAvailability(),
    request: {
      summary: bluetoothRequestSummary(bluetoothRequestOptions(false)),
      optionalServices: bluetoothOptionalServices,
      ganManufacturerDataCount: bluetoothGanManufacturerData.length,
    },
    solved: bluetoothSolved,
    gyro: bluetoothGyro,
    facelets: bluetoothPhysicalFacelets,
    faceletsTime: bluetoothPhysicalStateTime,
    moveCount: bluetoothMoves.length,
    moves: bluetoothMoves,
    events: bluetoothLog,
  };
}

function armBluetoothSolveTracking() {
  resetBluetoothSolveTracking();
  initializeBluetoothSolveCube();
  if (bluetoothDevice?.gatt?.connected) {
    addBluetoothLog('状态', '计时开始', '蓝牙转动从此刻计入本把成绩');
  }
}

function addBluetoothMoves(moves, source, protocol = '', deviceName = '') {
  const moveReceivedAt = performance.now();
  const now = new Date();
  const elapsedMs = appState === 'timing' && startedAt > 0 ? Math.max(0, Math.round(performance.now() - startedAt)) : null;
  const latestMove = moves.at(-1) || '-';
  bluetoothMoves.unshift(...moves.map((move) => ({
    move,
    source,
    protocol,
    deviceName,
    time: now.toLocaleTimeString(),
    isoTime: now.toISOString(),
    elapsedMs,
  })).reverse());
  bluetoothMoves = bluetoothMoves.slice(0, 160);
  bluetoothSolved = updateBluetoothSolvedFromMoves(moves);
  bluetoothSolvedByStatePacket = false;
  if (appState === 'timing' && bluetoothSolved) {
    stopTimingFromBluetoothSolved(moveReceivedAt, { byStatePacket: false });
    updateBluetooth3dMove(latestMove);
    requestAnimationFrame(() => {
      renderBluetoothMoves();
    });
    return;
  }
  updateBluetooth3dMove(latestMove);
  renderBluetoothMoves();
}

function initializeBluetoothSolveCube() {
  bluetoothSolveCube = null;
  bluetoothSolveCubeValid = false;
  bluetoothMoveDerivedFaces = null;
  bluetoothMoveDerivedStateTime = 0;
  if (!scramble?.scramble || (scramble.puzzle || scramblePuzzle) !== 'three') return;
  try {
    const cube = createSolvedCube();
    for (const move of parseScramble(scramble.scramble)) applyMove(cube, move);
    bluetoothSolveCube = cube;
    bluetoothSolveCubeValid = true;
    bluetoothMoveDerivedFaces = facesFromCube(bluetoothSolveCube);
    bluetoothMoveDerivedStateTime = performance.now();
  } catch (error) {
    addBluetoothLog('警告', '蓝牙复原状态初始化失败', error.message || String(error));
  }
}

function updateBluetoothSolvedFromMoves(moves) {
  if (bluetoothSolveCubeValid && bluetoothSolveCube) {
    try {
      for (const moveText of moves) {
        const move = parseScramble(moveText)[0];
        applyMove(bluetoothSolveCube, move);
      }
      const faces = facesFromCube(bluetoothSolveCube);
      bluetoothMoveDerivedFaces = faces;
      bluetoothMoveDerivedStateTime = performance.now();
      return isSolvedFaces(faces);
    } catch (error) {
      bluetoothSolveCubeValid = false;
      bluetoothMoveDerivedFaces = null;
      bluetoothMoveDerivedStateTime = 0;
      addBluetoothLog('警告', '蓝牙增量复原判定失败，已回退完整判定', error.message || String(error));
    }
  }
  return isBluetoothSolved();
}

function renderBluetoothMoves(options = {}) {
  const shouldRenderState = !options.skipStatePreview;
  const moveText = bluetoothMoveSequence().slice(-40).join(' ');
  const rowText = bluetoothMoves.length === 0
    ? (appState === 'timing' ? '暂无解析出的转动' : '计时开始后记录转动')
    : moveText;
  const statusText = bluetoothMoves.length === 0
    ? (bluetoothSolved ? '已复原' : (appState === 'timing' ? '未同步' : '等待计时'))
    : (bluetoothSolved ? '已复原' : '未复原');
  const renderKey = [
    bluetoothMoves.length,
    bluetoothSolved ? 1 : 0,
    appState,
    rowText,
    statusText,
    shouldRenderState ? bluetoothStatePreviewKey() : 'skip-state-preview',
  ].join('|');
  if (renderKey === bluetoothMovesRenderKey) return;
  bluetoothMovesRenderKey = renderKey;

  elements.bluetoothMoveCount.textContent = String(bluetoothMoves.length);
  elements.bluetoothSolveStatus.parentElement.classList.toggle('solved', bluetoothSolved);
  elements.bluetoothSolveStatus.textContent = statusText;
  elements.bluetoothMoveRows.textContent = rowText;
  elements.bluetoothMoveRows.title = bluetoothMoves.length === 0 ? '' : moveText;
  if (shouldRenderState) renderBluetoothStateSurface();
}

function renderBluetoothStateSurface() {
  if (elements.bluetoothLogDialog?.open) {
    renderBluetoothStatePreview();
    return;
  }
  renderBluetoothCube3dCurrent();
}

function bluetoothMoveSequence() {
  return bluetoothMoves.slice().reverse().map((entry) => entry.move);
}

function bluetoothMoveRecordSequence() {
  return bluetoothMoves.slice().reverse().map((entry, index) => ({
    step: index + 1,
    move: entry.move,
    source: entry.source || '',
    protocol: entry.protocol || '',
    deviceName: entry.deviceName || '',
    time: entry.time || '',
    isoTime: entry.isoTime || '',
    elapsedMs: Number.isFinite(entry.elapsedMs) ? entry.elapsedMs : null,
  }));
}

function bluetoothSolveMetadata() {
  const entries = bluetoothMoves.slice().reverse();
  const deviceName = bluetoothDevice?.name
    || entries.find((entry) => entry.deviceName)?.deviceName
    || '';
  return {
    deviceName,
    protocols: uniqueText(entries.map((entry) => entry.protocol)),
    sources: uniqueText(entries.map((entry) => entry.source)),
  };
}

function uniqueText(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function resetBluetoothSolveTracking() {
  bluetoothMoves = [];
  bluetoothSolved = false;
  bluetoothSolvedByStatePacket = false;
  bluetoothSolveCube = null;
  bluetoothSolveCubeValid = false;
  bluetoothMoveDerivedFaces = null;
  bluetoothMoveDerivedStateTime = 0;
  updateBluetooth3dMove('-');
  renderBluetoothMoves();
}

function isBluetoothSolved() {
  if (!scramble?.scramble || bluetoothMoves.length === 0) return false;
  try {
    const moves = bluetoothMoves.slice().reverse().map((entry) => entry.move).join(' ');
    const faces = cubeStateFromScramble(`${scramble.scramble} ${moves}`);
    bluetoothMoveDerivedFaces = faces;
    bluetoothMoveDerivedStateTime = performance.now();
    return isSolvedFaces(faces);
  } catch (error) {
    bluetoothMoveDerivedFaces = null;
    bluetoothMoveDerivedStateTime = 0;
    addBluetoothLog('警告', '蓝牙转动无法应用到当前打乱', error.message || String(error));
    return false;
  }
}

function renderBluetoothStatePreview() {
  const renderKey = bluetoothStatePreviewKey();
  if (renderKey === bluetoothStatePreviewRenderKey) return;
  bluetoothStatePreviewRenderKey = renderKey;

  elements.bluetoothStateNet.replaceChildren();
  const liveFaces = bluetooth3dPreferredLiveFaces();
  if (liveFaces && bluetoothLivePreviewMode()) {
    const solved = isSolvedFaces(liveFaces);
    const metaText = bluetoothMoveDerivedPreviewActive()
      ? `蓝牙转动实时状态 · ${bluetoothMoves.length} 步 · ${solved ? '已复原' : '未复原'}`
      : `GAN 实时状态 · ${solved ? '已复原' : '未复原'}`;
    renderCubeFacesNet(elements.bluetoothStateNet, liveFaces, 'bluetooth-state-net');
    elements.bluetoothStateMeta.textContent = metaText;
    renderBluetoothCube3d(liveFaces, metaText);
    return;
  }

  if (!scramble?.scramble) {
    elements.bluetoothStateMeta.textContent = '等待打乱';
    elements.bluetoothStateNet.className = 'bluetooth-state-net preview-loading';
    elements.bluetoothStateNet.textContent = '暂无状态';
    renderBluetoothCube3d(null, '等待打乱');
    return;
  }

  const moveText = bluetoothMoveSequence().join(' ');
  const stateText = [scramble.scramble, moveText].filter(Boolean).join(' ');
  try {
    const faces = cubeStateFromScramble(stateText);
    const replaySolved = isSolvedFaces(faces);
    const metaText = bluetoothMoves.length === 0
      ? (bluetoothSolvedByStatePacket ? 'GAN 状态已复原' : (appState === 'timing' ? '打乱状态' : '计时开始后同步'))
      : `${bluetoothMoves.length} 步 · ${bluetoothSolvedByStatePacket && !replaySolved ? 'GAN 状态已复原' : (replaySolved ? '已复原' : '未复原')}`;
    renderCubeFacesNet(elements.bluetoothStateNet, faces, 'bluetooth-state-net');
    elements.bluetoothStateMeta.textContent = metaText;
    renderBluetoothCube3d(faces, metaText);
  } catch (error) {
    elements.bluetoothStateMeta.textContent = '状态无效';
    elements.bluetoothStateNet.className = 'bluetooth-state-net preview-loading';
    elements.bluetoothStateNet.textContent = '无法渲染';
    renderBluetoothCube3d(null, '状态无效');
  }
}

function bluetoothStatePreviewKey() {
  return [
    bluetoothLivePreviewMode() ? 1 : 0,
    bluetoothPhysicalFacelets || '-',
    Math.round(bluetoothPhysicalStateReceivedAt),
    cubeFacesSignature(bluetoothMoveDerivedFaces),
    Math.round(bluetoothMoveDerivedStateTime),
    bluetoothSolved ? 1 : 0,
    bluetoothSolvedByStatePacket ? 1 : 0,
    appState,
    scramble?.scramble || '-',
    scramble?.puzzle || scramblePuzzle || 'three',
    bluetoothMoveSequence().join(' '),
  ].join('|');
}

function bluetoothMoveDerivedPreviewActive() {
  return Boolean(
    bluetoothMoveDerivedFaces
    && bluetoothMoves.length > 0
    && (appState === 'timing' || appState === 'saving')
    && bluetoothMoveDerivedStateTime >= bluetoothPhysicalStateReceivedAt
  );
}

function bluetooth3dPreferredLiveFaces() {
  return bluetoothMoveDerivedPreviewActive()
    ? bluetoothMoveDerivedFaces
    : bluetoothPhysicalFaces;
}

function initBluetoothCube3d() {
  if (!elements.bluetooth3dCanvas) return;

  const renderer = new THREE.WebGLRenderer({
    canvas: elements.bluetooth3dCanvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cube3dMaxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
  camera.position.set(4.2, 3.2, 5.4);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 2.0, 2.0),
    new THREE.MeshBasicMaterial({
      color: 0x1d1d1f,
    }),
  );
  group.add(shell);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.998, 1.998, 1.998)),
    new THREE.LineBasicMaterial({ color: 0x25262b, transparent: true, opacity: 0.08 }),
  );
  group.add(edges);

  const stickers = new Map();
  const stickerGeometry = new THREE.PlaneGeometry(0.642, 0.642);
  for (const face of cube3dFaces) {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const material = new THREE.MeshBasicMaterial({
          color: cube3dFallbackColors[face],
          side: THREE.DoubleSide,
        });
        const sticker = new THREE.Mesh(stickerGeometry, material);
        applyCube3dStickerTransform(sticker, face, row, col);
        sticker.userData.basePosition = sticker.position.clone();
        sticker.userData.baseQuaternion = sticker.quaternion.clone();
        group.add(sticker);
        stickers.set(`${face}${row}${col}`, sticker);
      }
    }
  }

  const baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.56, 0.72, 0.04));
  cube3d = {
    renderer,
    scene,
    camera,
    group,
    stickers,
    baseQuaternion,
    targetQuaternion: baseQuaternion.clone(),
    resizeObserver: null,
    needsRender: true,
    lastRenderAt: 0,
    turnAnimation: null,
    nextQuaternion: new THREE.Quaternion(),
    idleQuaternion: new THREE.Quaternion(),
    idleEuler: new THREE.Euler(),
    turnQuaternion: new THREE.Quaternion(),
    cssWidth: 0,
    cssHeight: 0,
  };
  group.quaternion.copy(baseQuaternion);

  const resize = () => resizeBluetoothCube3d();
  cube3d.resizeObserver = new ResizeObserver(resize);
  cube3d.resizeObserver.observe(elements.bluetooth3dCanvas);
  window.addEventListener('resize', resize);
  resize();
  renderBluetoothCube3dCurrent();
  renderBluetoothCube3dTelemetry();
  scheduleBluetoothCube3dAnimation();
}

function applyCube3dStickerTransform(sticker, face, row, col) {
  const spacing = 0.652;
  const surface = 1.012;
  const a = (col - 1) * spacing;
  const b = (1 - row) * spacing;

  if (face === 'U') {
    sticker.position.set(a, surface, -b);
    sticker.rotation.set(-Math.PI / 2, 0, 0);
  } else if (face === 'D') {
    sticker.position.set(a, -surface, b);
    sticker.rotation.set(Math.PI / 2, 0, 0);
  } else if (face === 'F') {
    sticker.position.set(a, b, surface);
    sticker.rotation.set(0, 0, 0);
  } else if (face === 'B') {
    sticker.position.set(-a, b, -surface);
    sticker.rotation.set(0, Math.PI, 0);
  } else if (face === 'R') {
    sticker.position.set(surface, b, -a);
    sticker.rotation.set(0, Math.PI / 2, 0);
  } else if (face === 'L') {
    sticker.position.set(-surface, b, a);
    sticker.rotation.set(0, -Math.PI / 2, 0);
  }
}

function resizeBluetoothCube3d() {
  if (!cube3d || !elements.bluetooth3dCanvas) return;
  const rect = elements.bluetooth3dCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (cube3d.cssWidth !== width || cube3d.cssHeight !== height) {
    cube3d.cssWidth = width;
    cube3d.cssHeight = height;
    cube3d.renderer.setSize(width, height, false);
    cube3d.camera.aspect = width / height;
    cube3d.camera.updateProjectionMatrix();
    markBluetoothCube3dDirty();
  }
}

function scheduleBluetoothCube3dAnimation(delayMs = 0) {
  if (!cube3d || cube3dAnimationFrame) return;
  if (delayMs <= 0) {
    if (cube3dAnimationTimer) {
      window.clearTimeout(cube3dAnimationTimer);
      cube3dAnimationTimer = 0;
    }
    cube3dAnimationFrame = requestAnimationFrame(animateBluetoothCube3d);
    return;
  }
  if (cube3dAnimationTimer) return;
  cube3dAnimationTimer = window.setTimeout(() => {
    cube3dAnimationTimer = 0;
    scheduleBluetoothCube3dAnimation();
  }, delayMs);
}

function animateBluetoothCube3d(time = performance.now()) {
  cube3dAnimationFrame = 0;
  if (!cube3d) return;
  const visible = isBluetoothCube3dVisible();
  const activeMove = Boolean(cube3d.turnAnimation);
  if (!visible) return;

  const activeGyro = hasRecentBluetoothGyro(time);
  if (!activeGyro && !activeMove && !cube3d.needsRender) {
    const waitMs = cube3dIdleFrameMs - (time - cube3d.lastRenderAt);
    if (waitMs > 0) {
      if (shouldContinueBluetoothCube3dAnimation(false, time)) scheduleBluetoothCube3dAnimation(waitMs);
      return;
    }
  }

  if (cube3dActiveFrameMs > 0 && (activeGyro || activeMove)) {
    const waitMs = cube3dActiveFrameMs - (time - cube3d.lastRenderAt);
    if (waitMs > 0) {
      if (shouldContinueBluetoothCube3dAnimation(false, time)) scheduleBluetoothCube3dAnimation(waitMs);
      return;
    }
  }

  if (cube3dActiveFrameMs > 0 && !activeGyro && !activeMove && cube3d.needsRender) {
    const waitMs = cube3dActiveFrameMs - (time - cube3d.lastRenderAt);
    if (waitMs > 0) {
      if (shouldContinueBluetoothCube3dAnimation(false, time)) scheduleBluetoothCube3dAnimation(waitMs);
      return;
    }
  }

  const changed = updateBluetoothCube3dPose(time);
  if (changed || cube3d.needsRender) {
    cube3d.renderer.render(cube3d.scene, cube3d.camera);
    cube3d.needsRender = false;
    cube3d.lastRenderAt = time;
  }
  if (shouldContinueBluetoothCube3dAnimation(changed, time)) scheduleBluetoothCube3dAnimation();
}

function shouldContinueBluetoothCube3dAnimation(changed, time = performance.now()) {
  if (!cube3d || !isBluetoothCube3dVisible()) return false;
  return Boolean(
    changed
    || cube3d.needsRender
    || cube3d.turnAnimation
    || hasRecentBluetoothGyro(time)
    || (!bluetoothGyro && bluetoothLivePreviewMode())
  );
}

function updateBluetoothCube3dPose(time) {
  const nextQuaternion = cube3d.nextQuaternion.copy(cube3d.group.quaternion);
  if (bluetoothGyro) {
    const deltaMs = cube3d.lastRenderAt > 0 ? Math.max(0, time - cube3d.lastRenderAt) : 16;
    const angle = nextQuaternion.angleTo(cube3d.targetQuaternion);
    const smoothingMs = angle > 0.22 ? cube3dGyroFastSmoothingMs : cube3dGyroSmoothingMs;
    const slerpFactor = Math.min(0.9, 1 - Math.exp(-deltaMs / smoothingMs));
    nextQuaternion.slerp(cube3d.targetQuaternion, slerpFactor);
  } else {
    const seconds = time / 1000;
    nextQuaternion.copy(cube3d.baseQuaternion);
    if (bluetoothLivePreviewMode()) {
      cube3d.idleEuler.set(
        Math.cos(seconds * 0.56) * 0.018,
        Math.sin(seconds * 0.72) * 0.048,
        0,
      );
      cube3d.idleQuaternion.setFromEuler(cube3d.idleEuler);
      nextQuaternion.multiply(cube3d.idleQuaternion);
    }
  }

  const changed = cube3d.group.quaternion.angleTo(nextQuaternion) > cube3dPoseEpsilon;
  if (changed) cube3d.group.quaternion.copy(nextQuaternion);
  const turnChanged = updateBluetoothCube3dTurnAnimation(time);
  return changed || turnChanged || Boolean(cube3d.turnAnimation) || (!bluetoothGyro && bluetoothLivePreviewMode());
}

function hasRecentBluetoothGyro(time = performance.now()) {
  return Boolean(bluetoothGyro && time - bluetoothGyroLastUpdateAt <= cube3dGyroActiveWindowMs);
}

function isBluetoothCube3dVisible() {
  return Boolean(cube3d && elements.bluetooth3dCanvas && !elements.bluetooth3dPanel?.hidden && cube3d.cssWidth > 4 && cube3d.cssHeight > 4);
}

function markBluetoothCube3dDirty() {
  if (cube3d) {
    cube3d.needsRender = true;
    cube3d.lastRenderAt = Math.min(cube3d.lastRenderAt, performance.now() - cube3dIdleFrameMs);
    scheduleBluetoothCube3dAnimation();
  }
}

function renderBluetoothCube3dCurrent() {
  if (!cube3d) return;
  if (solveReplayPreviewActive && solveReplayCube) {
    renderBluetoothCube3d(facesFromCube(solveReplayCube), solveReplayPreviewLabel || '完整解法回放');
    return;
  }
  if (bluetoothLivePreviewMode()) {
    const liveFaces = bluetooth3dPreferredLiveFaces();
    if (liveFaces) {
      const source = bluetoothMoveDerivedPreviewActive() ? `蓝牙转动实时状态 · ${bluetoothMoves.length} 步` : 'GAN 实时状态';
      renderBluetoothCube3d(liveFaces, `${source} · ${isSolvedFaces(liveFaces) ? '已复原' : '未复原'}`);
    } else {
      renderBluetoothCube3d(null, '等待 GAN 状态包');
    }
    return;
  }

  if (!scramble?.scramble || (scramble.puzzle || scramblePuzzle) !== 'three') {
    renderBluetoothCube3d(null, scramble?.scramble ? '3D 仅支持 3x3' : '等待打乱');
    return;
  }

  try {
    const moveText = bluetoothMoveSequence().join(' ');
    const stateText = [scramble.scramble, moveText].filter(Boolean).join(' ');
    const faces = cubeStateFromScramble(stateText);
    const metaText = bluetoothMoves.length === 0
      ? (appState === 'timing' ? '打乱状态' : '等待蓝牙转动')
      : `${bluetoothMoves.length} 步 · ${isSolvedFaces(faces) ? '已复原' : '未复原'}`;
    renderBluetoothCube3d(faces, metaText);
  } catch {
    renderBluetoothCube3d(null, '状态无效');
  }
}

function renderBluetoothCube3d(faces, metaText = '') {
  if (!cube3d) return;
  const nextFaces = faces || cubeStateFromScramble('');
  const signature = cube3dFacesSignature(nextFaces);
  if (signature !== cube3dLastFacesSignature) {
    cube3dLastFacesSignature = signature;
    for (const face of cube3dFaces) {
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const sticker = cube3d.stickers.get(`${face}${row}${col}`);
          const color = nextFaces?.[face]?.[row]?.[col]?.color || cube3dFallbackColors[face];
          sticker?.material.color.set(color);
        }
      }
    }
    markBluetoothCube3dDirty();
  }
  if (elements.bluetooth3dMeta) elements.bluetooth3dMeta.textContent = metaText || '等待蓝牙同步';
  renderBluetoothCube3dTelemetry();
}

function cube3dFacesSignature(faces) {
  return cube3dFaces.map((face) => (
    faces?.[face]?.flat().map((sticker) => sticker?.color || '-').join('') || '---------'
  )).join('|');
}

function updateBluetooth3dMove(move) {
  bluetoothLastMoveText = String(move || '-');
  if (bluetoothLastMoveText !== '-') triggerBluetoothCube3dTurnAnimation(bluetoothLastMoveText);
  if (!elements.bluetooth3dMove) return;
  elements.bluetooth3dMove.textContent = bluetoothLastMoveText;
  elements.bluetooth3dMove.classList.remove('pulse');
  if (bluetoothLastMoveText !== '-') {
    window.clearTimeout(cube3dMovePulseTimer);
    requestAnimationFrame(() => {
      elements.bluetooth3dMove.classList.add('pulse');
      cube3dMovePulseTimer = window.setTimeout(() => {
        elements.bluetooth3dMove.classList.remove('pulse');
      }, 260);
    });
  }
  renderBluetoothCube3dTelemetry();
}

function triggerBluetoothCube3dTurnAnimation(move, options = {}) {
  if (!cube3d) return;
  const match = String(move || '').match(/^([UDRLFB])(2|')?$/);
  if (!match) return;
  completeBluetoothCube3dTurnAnimation(false);
  const definitions = {
    U: { axisName: 'y', axis: new THREE.Vector3(0, 1, 0), sign: 1 },
    D: { axisName: 'y', axis: new THREE.Vector3(0, -1, 0), sign: -1 },
    R: { axisName: 'x', axis: new THREE.Vector3(1, 0, 0), sign: 1 },
    L: { axisName: 'x', axis: new THREE.Vector3(-1, 0, 0), sign: -1 },
    F: { axisName: 'z', axis: new THREE.Vector3(0, 0, 1), sign: 1 },
    B: { axisName: 'z', axis: new THREE.Vector3(0, 0, -1), sign: -1 },
  };
  const definition = definitions[match[1]];
  const suffix = match[2] || '';
  const direction = suffix === "'" ? -1 : 1;
  const amount = suffix === '2' ? 2 : 1;
  const stickers = [...cube3d.stickers.values()]
    .filter((sticker) => sticker.userData.basePosition[definition.axisName] * definition.sign > 0.55)
    .map((sticker) => ({
      sticker,
      position: sticker.userData.basePosition.clone(),
      quaternion: sticker.userData.baseQuaternion.clone(),
    }));
  if (stickers.length === 0) return;
  cube3d.turnAnimation = {
    axis: definition.axis,
    angle: direction * amount * Math.PI / 2,
    startedAt: performance.now(),
    duration: suffix === '2' ? cube3dDoubleTurnDurationMs : cube3dTurnDurationMs,
    stickers,
    onComplete: options.onComplete || null,
  };
  markBluetoothCube3dDirty();
}

function updateBluetoothCube3dTurnAnimation(time) {
  const turn = cube3d?.turnAnimation;
  if (!turn) return false;
  const progress = Math.min(1, Math.max(0, (time - turn.startedAt) / turn.duration));
  const eased = 1 - (1 - progress) ** 3;
  const quaternion = cube3d.turnQuaternion.setFromAxisAngle(turn.axis, turn.angle * eased);
  for (const item of turn.stickers) {
    item.sticker.position.copy(item.position).applyAxisAngle(turn.axis, turn.angle * eased);
    item.sticker.quaternion.copy(quaternion).multiply(item.quaternion);
  }
  if (progress >= 1) completeBluetoothCube3dTurnAnimation(true);
  return true;
}

function completeBluetoothCube3dTurnAnimation(runCallback = true) {
  if (!cube3d?.turnAnimation) return;
  const turn = cube3d.turnAnimation;
  cube3d.turnAnimation = null;
  for (const item of turn.stickers) {
    item.sticker.position.copy(item.position);
    item.sticker.quaternion.copy(item.quaternion);
  }
  markBluetoothCube3dDirty();
  if (runCallback && typeof turn.onComplete === 'function') turn.onComplete();
}

function scheduleBluetoothCube3dTelemetryRender() {
  if (!bluetoothGyro) {
    renderBluetoothCube3dTelemetry();
    return;
  }
  const now = performance.now();
  const waitMs = cube3dTelemetryFrameMs - (now - cube3dTelemetryLastRenderAt);
  if (waitMs <= 0) {
    if (cube3dTelemetryTimer) {
      window.clearTimeout(cube3dTelemetryTimer);
      cube3dTelemetryTimer = 0;
    }
    if (cube3dTelemetryFrame) {
      cancelAnimationFrame(cube3dTelemetryFrame);
      cube3dTelemetryFrame = 0;
    }
    renderBluetoothCube3dTelemetry();
    return;
  }
  if (cube3dTelemetryFrame || cube3dTelemetryTimer) return;
  cube3dTelemetryTimer = window.setTimeout(() => {
    cube3dTelemetryTimer = 0;
    cube3dTelemetryFrame = requestAnimationFrame(() => {
      cube3dTelemetryFrame = 0;
      renderBluetoothCube3dTelemetry();
    });
  }, waitMs);
}

function renderBluetoothCube3dTelemetry() {
  if (!elements.bluetooth3dGyro || !elements.bluetooth3dVelocity) return;
  cube3dTelemetryLastRenderAt = performance.now();
  if (!bluetoothGyro) {
    elements.bluetooth3dGyro.textContent = 'Gyro -';
    elements.bluetooth3dVelocity.textContent = `Turn ${bluetoothLastMoveText}`;
    elements.bluetooth3dGyro.title = '未收到陀螺仪数据';
    elements.bluetooth3dVelocity.title = `最近转动 ${bluetoothLastMoveText}`;
    return;
  }
  const gyroText = `q ${formatGyroQuaternion(bluetoothGyro.quaternion)}`;
  const velocityText = `ω ${formatGyroVelocity(bluetoothGyro.velocity)} · ${bluetoothLastMoveText}`;
  elements.bluetooth3dGyro.textContent = gyroText;
  elements.bluetooth3dVelocity.textContent = velocityText;
  elements.bluetooth3dGyro.title = gyroText;
  elements.bluetooth3dVelocity.title = velocityText;
}

function formatGyroQuaternion(quaternion = {}) {
  return ['w', 'x', 'y', 'z'].map((key) => formatSignedNumber(quaternion[key], 3)).join(' ');
}

function formatGyroVelocity(velocity = {}) {
  return ['x', 'y', 'z'].map((key) => formatSignedNumber(velocity[key], 0)).join('/');
}

function formatSignedNumber(value, digits) {
  if (!Number.isFinite(value)) return '-';
  const fixed = Number(value).toFixed(digits);
  return Number(value) > 0 ? `+${fixed}` : fixed;
}

function logBluetoothPacket(hex, decoded, ignoredReason = '') {
  const detail = [];
  detail.push(hex);
  if (decoded.protocol) detail.push(`protocol=${decoded.protocol}`);
  if (decoded.batteryLevel != null) detail.push(`battery=${decoded.batteryLevel}%`);
  if (Array.isArray(decoded.historyMoves) && decoded.historyMoves.length > decoded.moves.length) {
    detail.push(`history=${decoded.historyMoves.join(' ')}`);
  }
  if (decoded.text) detail.push(`text=${JSON.stringify(decoded.text)}`);
  if (decoded.moves.length > 0) detail.push(`moves=${decoded.moves.join(' ')}`);
  if (ignoredReason) detail.push(`未计入=${ignoredReason}`);
  return detail.join(' · ');
}

function bluetoothUuidLabel(uuid) {
  const normalized = normalizeBluetoothUuid(uuid);
  const label = bluetoothUuidLabels.get(normalized);
  const compact = shortUuid(uuid);
  return label ? `${compact} ${label}` : compact;
}

function bluetoothGanServiceLabel(uuid) {
  return bluetoothGanServiceLabels.get(normalizeBluetoothUuid(uuid)) || 'GAN 服务';
}

function isGanServiceUuid(uuid) {
  return bluetoothGanServiceUuids.has(normalizeBluetoothUuid(uuid));
}

function isGanCharacteristicUuid(uuid) {
  return bluetoothGanCharacteristicUuids.has(normalizeBluetoothUuid(uuid));
}

function isGanPacketSource(uuid, deviceName = '') {
  return isGanCharacteristicUuid(uuid) || /^(gan|mg|aicube)/i.test(String(deviceName || ''));
}

function bluetoothGanProtocolForService(uuid) {
  return bluetoothGanProtocols.get(normalizeBluetoothUuid(uuid)) || null;
}

function bluetoothGanProtocolForCharacteristic(uuid) {
  return bluetoothGanCharacteristicProtocols.get(normalizeBluetoothUuid(uuid)) || null;
}

function bluetoothGanProtocolForDevice(deviceName = '') {
  const name = String(deviceName || '').toLowerCase();
  if (!/^(gan|mg|aicube)/.test(name)) return null;
  if (name.includes('i4')) return bluetoothGanProtocols.get(bluetoothGanV4ServiceUuid);
  return bluetoothGanSession;
}

function isLikelyGanDevice(device) {
  return /^(gan|mg|aicube)/i.test(String(device?.name || ''));
}

function normalizeBluetoothUuid(uuid) {
  return String(uuid).toLowerCase();
}

function shortUuid(uuid) {
  const match = String(uuid).match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i);
  return match ? `0x${match[1].toUpperCase()}` : String(uuid).slice(0, 8);
}

function isBatteryLevelCharacteristic(uuid) {
  const normalized = String(uuid).toLowerCase();
  return normalized === 'battery_level' || normalized === bluetoothBatteryLevelUuid;
}

function isGiikerBatteryCharacteristic(uuid) {
  return String(uuid).toLowerCase() === bluetoothGiikerBatteryReadUuid;
}

function decodeGiikerBatteryLevel(dataView) {
  const bytes = dataViewBytes(dataView);
  const level = bytes.length > 1 ? bytes[1] : null;
  return Number.isInteger(level) && level >= 0 && level <= 100 ? level : null;
}

function characteristicProperties(properties) {
  return ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate']
    .filter((name) => properties[name]);
}

function dataViewToHex(dataView) {
  return bytesToHex(dataViewBytes(dataView));
}

function dataViewBytes(dataView) {
  return new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function render() {
  renderTimer();
  renderBluetoothMoves();
  renderBluetoothFeed();
  renderPreviewMode();
  renderSessions();
  renderScramble();
  renderStats();
  renderHistory();
  renderQuickActions();
  renderOpenDialogs();
}

function renderOpenDialogs() {
  renderAllSolvesDialog();
  renderStatsDialog();
  renderAverageDialog();
  renderAlgorithmTrainerDialog();
  renderExportDialog();
  renderImportDialog();
  renderMarkPenaltyDialog();
  renderPuzzleSolvesDialog();
  renderTagSolvesDialog();
  renderCommentSolvesDialog();
  renderMoveSolvesDialog();
  renderMergeSessionDialog();
}

function renderPreviewMode() {
  const replayMode = solveReplayPreviewActive && solveReplayCube;
  const liveMode = replayMode || bluetoothLivePreviewMode();
  elements.cubeNet.hidden = liveMode;
  elements.bluetooth3dPanel.hidden = !liveMode;
  elements.previewTitle.textContent = replayMode ? '复原回放' : (liveMode ? '蓝牙魔方状态' : '打乱结果预览');
  elements.previewMeta.textContent = replayMode
    ? '完整解法播放'
    : (liveMode
    ? (bluetoothMoveDerivedPreviewActive() ? '转动实时状态' : (bluetoothPhysicalFacelets ? 'GAN 实时状态' : '等待状态包'))
    : 'TNoodle');

  if (liveMode) {
    markBluetoothCube3dDirty();
    resizeBluetoothCube3d();
    renderBluetoothCube3dCurrent();
  }
}

function bluetoothLivePreviewMode() {
  return Boolean(bluetoothDevice?.gatt?.connected);
}

function setTimerDisplayText(text) {
  const display = elements.timerDisplay;
  const nextText = String(text ?? '');
  const size = nextText.length >= 9 ? 'compact' : (nextText.length >= 8 ? 'long' : 'normal');
  const textKey = `${size}:${nextText}`;
  if (timerDisplayTextKey === textKey) return;
  timerDisplayTextKey = textKey;
  if (display.textContent !== nextText) display.textContent = nextText;
  display.dataset.size = size;
  const width = Math.round(display.getBoundingClientRect().width);
  const key = `${size}:${nextText.length}:${width}`;
  if (key === timerDisplayFitKey) return;
  timerDisplayFitKey = key;
  display.style.setProperty('--timer-scale', '1');
  requestAnimationFrame(() => fitTimerDisplayToWidth(key));
}

function fitTimerDisplayToWidth(key) {
  if (key !== timerDisplayFitKey) return;
  const display = elements.timerDisplay;
  const available = display.clientWidth;
  const needed = display.scrollWidth;
  if (available <= 0 || needed <= available) {
    display.style.setProperty('--timer-scale', '1');
    return;
  }
  const scale = Math.max(0.48, Math.min(1, (available / needed) * 0.985));
  display.style.setProperty('--timer-scale', scale.toFixed(3));
}

function invalidateTimerDisplayFit() {
  timerDisplayFitKey = '';
  timerDisplayTextKey = '';
  setTimerDisplayText(elements.timerDisplay.textContent);
}

function timingDisplayText(elapsedMs) {
  if (hideTimerWhileSolving) return '···';
  if (timerFreezeMs > 0 && elapsedMs < timerFreezeMs) return '0.000';
  return formatTime(elapsedMs);
}

function timerDisplayModeHint(elapsedMs = 0) {
  if (hideTimerWhileSolving) return '计时已隐藏 · 按任意键结束';
  if (timerFreezeMs > 0 && elapsedMs < timerFreezeMs) return '起步冻结中 · 按任意键结束';
  return '';
}

function openTimerSettingsDialog() {
  renderTimerSettingsDialog();
  if (!elements.timerSettingsDialog.open) elements.timerSettingsDialog.showModal();
}

function renderTimerSettingsDialog() {
  elements.hideTimerToggle.checked = hideTimerWhileSolving;
  elements.timerFreezeSelect.value = String(timerFreezeMs);
  elements.confirmDeleteToggle.checked = confirmDeleteSolves;
  const displayMode = hideTimerWhileSolving ? '隐藏计时中数字' : '显示计时中数字';
  const freezeMode = timerFreezeMs > 0 ? `起步冻结 ${(timerFreezeMs / 1000).toFixed(1)}s` : '无起步冻结';
  const deleteMode = confirmDeleteSolves ? '删除前确认' : '删除直接撤销';
  elements.timerSettingsMeta.textContent = `${displayMode} · ${freezeMode} · ${deleteMode}`;
}

function updateTimerSettingsFromControls() {
  hideTimerWhileSolving = elements.hideTimerToggle.checked;
  timerFreezeMs = normalizeTimerFreezeMs(elements.timerFreezeSelect.value);
  confirmDeleteSolves = elements.confirmDeleteToggle.checked;
  localStorage.setItem('trainTimer.hideTimerWhileSolving', hideTimerWhileSolving ? '1' : '0');
  localStorage.setItem('trainTimer.timerFreezeMs', String(timerFreezeMs));
  localStorage.setItem('trainTimer.confirmDeleteSolves', confirmDeleteSolves ? '1' : '0');
  renderTimerSettingsDialog();
  renderTimer();
}

function normalizeTimerFreezeMs(value) {
  const parsed = Number(value);
  const allowed = [0, 200, 500, 1000, 2000];
  return allowed.includes(parsed) ? parsed : 0;
}

function renderSessions() {
  elements.sessionSelect.replaceChildren(
    ...sessions.map((session) => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = session.name;
      option.selected = session.id === currentSessionId;
      return option;
    }),
  );
  elements.duplicateSessionButton.disabled = !sessions.some((session) => session.id === currentSessionId);
  elements.mergeSessionButton.disabled = currentSessionId === 'default' || sessions.length < 2;
  elements.deleteSessionButton.disabled = currentSessionId === 'default';
}

function renderTimer() {
  document.body.dataset.state = appState;
  document.body.dataset.holdReady = appState === 'hold' && holdConfirmed ? 'true' : 'false';
  document.body.dataset.focus = timerFocusActive() ? 'true' : 'false';
  elements.inspectionToggle.disabled = appState === 'timing' || appState === 'inspection' || appState === 'hold';

  if (appState === 'ready') {
    elements.statusText.textContent = '准备';
    setTimerDisplayText('0.000');
    elements.timerHint.textContent = scrambleGuideReadyHint()
      || (inspectionEnabled ? '按 Space 开始观察' : '长按 Space 超过 0.5s，松开开始计时');
  } else if (appState === 'inspection') {
    const elapsed = (performance.now() - inspectionStartedAt) / 1000;
    const remaining = Math.max(0, inspectionSeconds - elapsed);
    const penalty = inspectionPenaltyForElapsed(elapsed);
    elements.statusText.textContent = penalty === 'ok' ? '观察中' : '观察超时';
    setTimerDisplayText(inspectionDisplayForElapsed(elapsed));
    elements.timerHint.textContent = penalty === 'ok'
      ? '长按 Space 超过 0.5s，松开开始计时'
      : `长按 Space 后松开开始计时，本次 ${penalty.toUpperCase()}`;
  } else if (appState === 'hold') {
    elements.statusText.textContent = holdConfirmed ? '松开空格开始计时' : '长按确认中';
    elements.timerHint.textContent = '短按不会启动';
  } else if (appState === 'timing') {
    elements.statusText.textContent = '计时中';
    const elapsedMs = performance.now() - startedAt;
    setTimerDisplayText(timingDisplayText(elapsedMs));
    elements.timerHint.textContent = timerDisplayModeHint(elapsedMs) || '按任意键结束本次计时';
  } else if (appState === 'saving') {
    elements.statusText.textContent = finishSource === 'bluetooth' ? '蓝牙复原' : '保存中';
    elements.timerHint.textContent = finishSource === 'bluetooth' ? '检测到已复原，正在写入成绩' : '正在写入成绩';
  } else if (appState === 'done') {
    elements.statusText.textContent = '已记录';
    elements.timerHint.textContent = 'Space 下一把 · O/2/D 快速改上一把';
  }
}

function timerFocusActive() {
  return appState === 'timing'
    || appState === 'inspection'
    || (appState === 'hold' && holdReturnState === 'inspection');
}

function renderQuickActions() {
  const solve = latestSessionSolve();
  const disabled = !solve || appState === 'timing' || appState === 'inspection' || appState === 'hold' || appState === 'saving';
  const actionLocked = appState === 'timing' || appState === 'inspection' || appState === 'hold' || appState === 'saving';
  elements.nextButton.disabled = actionLocked;
  elements.scrambleButton.disabled = actionLocked || scrambleLocked;
  elements.scrambleLockButton.disabled = !canToggleScrambleLock();
  elements.scrambleLockButton.classList.toggle('active', scrambleLocked);
  elements.scrambleLockButton.setAttribute('aria-pressed', scrambleLocked ? 'true' : 'false');
  elements.scrambleLockButton.title = scrambleLocked
    ? '已锁定当前打乱，下一把继续使用'
    : '锁定当前打乱（L）';
  elements.scrambleLockButton.setAttribute('aria-label', scrambleLocked ? '解锁当前打乱' : '锁定当前打乱');
  elements.lastOkButton.disabled = disabled || solve?.penalty === 'ok';
  elements.lastPlusTwoButton.disabled = disabled || solve?.penalty === '+2';
  elements.lastDnfButton.disabled = disabled || solve?.penalty === 'dnf';
  elements.lastDeleteButton.disabled = disabled;
  const title = solve ? `上一把 ${displaySolveTime(solve)}` : '当前会话暂无成绩';
  elements.lastOkButton.title = title;
  elements.lastPlusTwoButton.title = title;
  elements.lastDnfButton.title = title;
  elements.lastDeleteButton.title = title;
}

function renderScramble() {
  if (!scramble) return;
  const currentPuzzle = scramble.puzzle || scramblePuzzle;
  elements.scramblePuzzleSelect.value = currentPuzzle;
  elements.scramblePuzzleSelect.disabled = scrambleChangeLocked();
  renderScrambleText();
  renderScrambleGuideMeta();
  elements.scrambleSource.textContent = `${puzzleLabel(currentPuzzle)} · ${scramble.source}${scrambleLocked ? ' · 已锁定' : ''}`;
  if (bluetoothLivePreviewMode()) {
    renderBluetoothCube3dCurrent();
  } else {
    renderScramblePreview(scramble.scramble, currentPuzzle);
  }
}

function renderScrambleText() {
  const text = scramble?.scramble || '';
  if (!text) {
    elements.scrambleText.textContent = '当前打乱类型暂不可用';
    return;
  }

  if (!scrambleGuideSupported || !bluetoothScrambleGuideActive() || scrambleGuideMoves.length === 0) {
    elements.scrambleText.textContent = text;
    return;
  }

  if (scrambleGuideErrorIndex != null) {
    const correctionMoves = scrambleGuideCorrectionMoves();
    if (correctionMoves.length === 0) {
      elements.scrambleText.textContent = '当前状态已到达目标打乱';
      return;
    }
    elements.scrambleText.replaceChildren(
      ...correctionMoves.flatMap((move, index) => {
        const span = document.createElement('span');
        span.className = 'scramble-move correction';
        span.textContent = move;
        span.title = '修正到目标打乱状态';
        return [span, document.createTextNode(index === correctionMoves.length - 1 ? '' : ' ')];
      }),
    );
    return;
  }

  elements.scrambleText.replaceChildren(
    ...scrambleGuideMoves.flatMap((move, index) => {
      const span = document.createElement('span');
      span.className = `scramble-move ${scrambleMoveClass(index)}`.trim();
      span.textContent = move;
      span.title = scrambleMoveTitle(index, move);
      return [span, document.createTextNode(index === scrambleGuideMoves.length - 1 ? '' : ' ')];
    }),
  );
}

function scrambleMoveClass(index) {
  if (!bluetoothScrambleGuideActive()) return '';
  if (scrambleGuideCompleted) return 'correct';
  if (index === scrambleGuideErrorIndex) return 'wrong';
  if (index === scrambleGuidePartialIndex) return 'partial';
  if (index < scrambleGuideCorrectPrefix) return 'correct';
  if (index === scrambleGuideCorrectPrefix && appState === 'ready') return 'current';
  return '';
}

function scrambleMoveTitle(index, move) {
  if (scrambleGuideCompleted) return '打乱状态已匹配';
  if (index === scrambleGuideErrorIndex) {
    return `这里应为 ${move}，实际转动 ${scrambleGuideErrorMove}`;
  }
  if (index === scrambleGuidePartialIndex) return `${move} 已完成半步，继续同方向完成双拨`;
  if (index < scrambleGuideCorrectPrefix) return '已完成';
  if (index === scrambleGuideCorrectPrefix) return '下一步';
  return '';
}

function renderScrambleGuideMeta() {
  elements.scrambleGuideMeta.classList.remove('error', 'complete');
  if (!scrambleGuideSupported) {
    elements.scrambleGuideMeta.textContent = '';
    return;
  }
  if (!bluetoothScrambleGuideActive()) {
    elements.scrambleGuideMeta.textContent = '';
    return;
  }
  if (scrambleGuideCompleted) {
    elements.scrambleGuideMeta.textContent = '打乱完成，已自动进入观察';
    elements.scrambleGuideMeta.classList.add('complete');
    return;
  }
  if (scrambleGuideErrorIndex != null) {
    const expected = scrambleGuideMoves[scrambleGuideErrorIndex] || '-';
    elements.scrambleGuideMeta.textContent = `打乱错误：第 ${scrambleGuideErrorIndex + 1} 步应为 ${expected}，实际 ${scrambleGuideErrorMove} · 按上方公式修正到目标打乱状态`;
    elements.scrambleGuideMeta.classList.add('error');
    return;
  }
  if (scrambleGuidePartialIndex != null) {
    elements.scrambleGuideMeta.textContent = `双拨未完成：继续 ${scrambleGuideMoves[scrambleGuidePartialIndex] || ''}`;
    return;
  }
  elements.scrambleGuideMeta.textContent = `蓝牙打乱校验 ${scrambleGuideCorrectPrefix}/${scrambleGuideMoves.length}`;
}

function resetScrambleGuide() {
  scrambleGuideMoves = [];
  scrambleGuideInputMoves = [];
  scrambleGuideRoute = [];
  scrambleGuideCorrectPrefix = 0;
  scrambleGuidePartialIndex = null;
  scrambleGuideErrorIndex = null;
  scrambleGuideErrorMove = '';
  scrambleGuideLastMatchedInputLength = 0;
  scrambleGuideLastMatchedRemainingMoves = [];
  scrambleGuideCompleted = false;
  scrambleGuideSupported = false;

  const currentPuzzle = scramble?.puzzle || scramblePuzzle;
  if (currentPuzzle !== 'three' || !scramble?.scramble) return;

  try {
    const parsedMoves = parseScramble(scramble.scramble);
    scrambleGuideMoves = parsedMoves.map(scrambleMoveNotation);
    scrambleGuideRoute = buildScrambleGuideRoute(parsedMoves);
    scrambleGuideSupported = scrambleGuideMoves.length > 0;
    scrambleGuideLastMatchedRemainingMoves = scrambleGuideRoute[0]?.remainingMoves || [];
  } catch {
    scrambleGuideMoves = [];
    scrambleGuideRoute = [];
    scrambleGuideSupported = false;
    scrambleGuideLastMatchedRemainingMoves = [];
  }
}

function scrambleMoveNotation(move) {
  return `${move.face}${move.suffix || ''}`;
}

function buildScrambleGuideRoute(moves) {
  const atomicEntries = [];
  moves.forEach((move, index) => {
    const atomicMoves = scrambleMoveAtomicTokens(move);
    atomicMoves.forEach((token, atomicIndex) => {
      atomicEntries.push({
        token,
        correctPrefix: atomicIndex === atomicMoves.length - 1 ? index + 1 : index,
        displayIndex: index,
        partial: atomicIndex < atomicMoves.length - 1,
      });
    });
  });

  const route = [{
    signature: cubeFacesSignature(cubeStateFromScramble('')),
    correctPrefix: 0,
    displayIndex: 0,
    partial: false,
    remainingMoves: atomicEntries.map((entry) => entry.token),
  }];
  const tokens = [];

  atomicEntries.forEach((entry, atomicIndex) => {
    tokens.push(entry.token);
    route.push({
      signature: cubeFacesSignature(cubeStateFromScramble(tokens.join(' '))),
      correctPrefix: entry.correctPrefix,
      displayIndex: entry.displayIndex,
      partial: entry.partial,
      remainingMoves: atomicEntries.slice(atomicIndex + 1).map((tailEntry) => tailEntry.token),
    });
  });

  return route;
}

function scrambleMoveAtomicTokens(move) {
  if (move.suffix === '2') return [move.face, move.face];
  return [scrambleMoveNotation(move)];
}

function inverseScrambleMoveNotation(move) {
  if (!move) return '';
  if (move.suffix === '2') return `${move.face}2`;
  if (move.suffix === "'") return move.face;
  return `${move.face}'`;
}

function inverseScrambleMoveTokens(moves) {
  const parsedMoves = [];
  for (const move of moves) {
    try {
      parsedMoves.push(parseScramble(move)[0]);
    } catch {
      return [];
    }
  }
  return parsedMoves.reverse().map(inverseScrambleMoveNotation).filter(Boolean);
}

function simplifyScrambleMoveTokens(tokens) {
  const simplified = [];
  for (const token of tokens.filter(Boolean)) {
    let move;
    try {
      move = parseScramble(token)[0];
    } catch {
      simplified.push(token);
      continue;
    }
    const previousToken = simplified.at(-1);
    let previousMove = null;
    try {
      previousMove = previousToken ? parseScramble(previousToken)[0] : null;
    } catch {
      previousMove = null;
    }
    if (!previousMove || previousMove.face !== move.face) {
      simplified.push(scrambleMoveNotation(move));
      continue;
    }
    simplified.pop();
    const turns = (scrambleMoveQuarterTurns(previousMove) + scrambleMoveQuarterTurns(move)) % 4;
    if (turns === 1) simplified.push(move.face);
    else if (turns === 2) simplified.push(`${move.face}2`);
    else if (turns === 3) simplified.push(`${move.face}'`);
  }
  return simplified;
}

function scrambleMoveQuarterTurns(move) {
  if (move.suffix === '2') return 2;
  if (move.suffix === "'") return 3;
  return 1;
}

function scrambleGuideCorrectionMoves() {
  if (!scrambleGuideSupported || scrambleGuideInputMoves.length <= scrambleGuideLastMatchedInputLength) return [];
  const undoWrongMoves = inverseScrambleMoveTokens(scrambleGuideInputMoves.slice(scrambleGuideLastMatchedInputLength));
  const remainingMoves = scrambleGuideLastMatchedRemainingMoves.length > 0
    ? scrambleGuideLastMatchedRemainingMoves
    : scrambleGuideMoves.slice(scrambleGuideCorrectPrefix);
  return simplifyScrambleMoveTokens([...undoWrongMoves, ...remainingMoves]);
}

function scrambleGuideCorrectionText() {
  return scrambleGuideCorrectionMoves().join(' ');
}

function scrambleGuideReadyHint() {
  if (!bluetoothScrambleGuideActive() || appState !== 'ready') return '';
  if (scrambleGuideCompleted) return '打乱完成，观察中转动魔方即可开始计时';
  if (scrambleGuideErrorIndex != null) return '打乱公式不匹配，请按上方公式修正';
  if (scrambleGuidePartialIndex != null) return `双拨未完成：继续 ${scrambleGuideMoves[scrambleGuidePartialIndex] || ''}`;
  if (scrambleGuideCorrectPrefix > 0) return `继续打乱：${scrambleGuideCorrectPrefix}/${scrambleGuideMoves.length}`;
  return '转动蓝牙魔方开始打乱校验';
}

function bluetoothScrambleGuideActive() {
  return scrambleGuideSupported && Boolean(bluetoothDevice?.gatt?.connected);
}

function handleBluetoothMovesForCurrentState(moves, source, protocol = '', deviceName = '') {
  let parsedMoves = moves.filter(Boolean);
  const result = {
    trackingMoves: false,
    consumed: false,
    ignoredReason: '',
    statusLabel: '',
    logKind: '',
  };
  if (parsedMoves.length === 0) return result;

  if (appState === 'ready' || appState === 'done') {
    const gesture = processBluetoothNextSolveGesture(parsedMoves, source, protocol, deviceName);
    parsedMoves = gesture.moves;
    if (gesture.triggered || (gesture.consumed && parsedMoves.length === 0)) {
      return {
        ...result,
        consumed: true,
        ignoredReason: gesture.triggered ? '下一把手势' : '下一把手势待确认',
        statusLabel: gesture.triggered ? '下一把' : '手势待确认',
        logKind: gesture.triggered ? '手势/下一把' : '数据/手势',
      };
    }
  }

  if (parsedMoves.length === 0) return result;

  if (appState === 'ready') {
    const guide = applyScrambleGuideMoves(parsedMoves, source, protocol, deviceName);
    return {
      ...result,
      consumed: true,
      ignoredReason: guide.reason || '打乱校验',
      statusLabel: guide.statusLabel,
      logKind: guide.logKind,
    };
  }

  if (appState === 'inspection') {
    if (performance.now() < inspectionBluetoothStartBlockedUntil) {
      return {
        ...result,
        consumed: true,
        ignoredReason: '防误触',
        statusLabel: '打乱完成后 1 秒内忽略',
        logKind: '数据/防误触',
      };
    }
    startTiming();
  }

  if (appState === 'timing') {
    addBluetoothMoves(parsedMoves, source, protocol, deviceName);
    return {
      ...result,
      trackingMoves: true,
      statusLabel: bluetoothSolved ? '已复原' : '未复原',
    };
  }

  return result;
}

function processBluetoothNextSolveGesture(moves, source, protocol = '', deviceName = '') {
  const outputMoves = [];
  let consumed = false;
  let triggered = false;

  for (const move of moves) {
    const now = performance.now();
    const gestureMove = normalizeBluetoothNextSolveGestureMove(move);
    const candidate = currentBluetoothNextSolveGestureCandidate(now);

    if (candidate && gestureMove && isOppositeBluetoothNextSolveGesture(candidate, gestureMove)) {
      clearBluetoothNextSolveGestureCandidate();
      triggerBluetoothNextSolveGesture(source, protocol, deviceName);
      consumed = true;
      triggered = true;
      continue;
    }

    if (candidate?.deferred) outputMoves.push(candidate.move);
    if (candidate) clearBluetoothNextSolveGestureCandidate();

    if (appState === 'done') {
      if (gestureMove) {
        setBluetoothNextSolveGestureCandidate({
          ...gestureMove,
          move,
          source,
          protocol,
          deviceName,
          time: now,
          deferred: false,
        });
      }
      consumed = true;
      continue;
    }

    if (gestureMove && bluetoothNextSolveGestureReadyCanStart()) {
      const staysOnRoute = scrambleGuideMoveWouldStayOnRoute(move);
      setBluetoothNextSolveGestureCandidate({
        ...gestureMove,
        move,
        source,
        protocol,
        deviceName,
        time: now,
        deferred: !staysOnRoute,
      });
      if (!staysOnRoute) {
        consumed = true;
        continue;
      }
    }

    outputMoves.push(move);
  }

  return { moves: outputMoves, consumed, triggered };
}

function normalizeBluetoothNextSolveGestureMove(move) {
  const match = String(move || '').match(/^([UDRLFB])('?|)$/);
  if (!match) return null;
  return {
    face: match[1],
    direction: match[2] === "'" ? -1 : 1,
  };
}

function currentBluetoothNextSolveGestureCandidate(now = performance.now()) {
  if (!bluetoothNextSolveGestureCandidate) return null;
  if (now - bluetoothNextSolveGestureCandidate.time <= bluetoothNextSolveGestureWindowMs) {
    return bluetoothNextSolveGestureCandidate;
  }
  if (bluetoothNextSolveGestureCandidate.deferred) flushDeferredBluetoothNextSolveGesture();
  else clearBluetoothNextSolveGestureCandidate();
  return null;
}

function isOppositeBluetoothNextSolveGesture(candidate, move) {
  return candidate.face === move.face && candidate.direction === -move.direction;
}

function bluetoothNextSolveGestureReadyCanStart() {
  return appState === 'ready'
    && !bluetoothNextSolveGestureLoading
    && !scrambleGuideCompleted
    && scrambleGuideInputMoves.length === 0
    && scrambleGuideErrorIndex == null;
}

function scrambleGuideMoveWouldStayOnRoute(move) {
  if (!scrambleGuideSupported || scrambleGuideRoute.length === 0) return false;
  try {
    const nextMoves = [...scrambleGuideInputMoves, move].join(' ');
    const signature = cubeFacesSignature(cubeStateFromScramble(nextMoves));
    return scrambleGuideRoute.some((entry) => entry.signature === signature);
  } catch {
    return false;
  }
}

function setBluetoothNextSolveGestureCandidate(candidate) {
  clearBluetoothNextSolveGestureCandidate();
  bluetoothNextSolveGestureCandidate = candidate;
  if (candidate.deferred) {
    bluetoothNextSolveGestureFlushTimer = window.setTimeout(
      flushDeferredBluetoothNextSolveGesture,
      bluetoothNextSolveGestureWindowMs + 40,
    );
  }
}

function clearBluetoothNextSolveGestureCandidate() {
  if (bluetoothNextSolveGestureFlushTimer) {
    clearTimeout(bluetoothNextSolveGestureFlushTimer);
    bluetoothNextSolveGestureFlushTimer = 0;
  }
  bluetoothNextSolveGestureCandidate = null;
}

function resetBluetoothNextSolveGesture() {
  clearBluetoothNextSolveGestureCandidate();
  bluetoothNextSolveGestureLoading = false;
}

function flushDeferredBluetoothNextSolveGesture() {
  const candidate = bluetoothNextSolveGestureCandidate;
  clearBluetoothNextSolveGestureCandidate();
  if (!candidate?.deferred || appState !== 'ready') return;
  applyScrambleGuideMoves([candidate.move], candidate.source, candidate.protocol, candidate.deviceName);
}

async function triggerBluetoothNextSolveGesture(source, protocol = '', deviceName = '') {
  if (bluetoothNextSolveGestureLoading || (appState !== 'done' && appState !== 'ready')) return;
  bluetoothNextSolveGestureLoading = true;
  addBluetoothLog('手势/下一把', '检测到快速来回转动', [deviceName, protocol, source].filter(Boolean).join(' · '));
  try {
    await nextSolve();
  } catch (error) {
    addBluetoothLog('错误', '蓝牙手势启动下一把失败', error.message || String(error));
    render();
  } finally {
    bluetoothNextSolveGestureLoading = false;
  }
}

function applyScrambleGuideMoves(moves, source, protocol = '', deviceName = '') {
  if (!scrambleGuideSupported || scrambleGuideCompleted) {
    return { statusLabel: '等待计时', reason: '等待计时', logKind: '数据/预备转动' };
  }

  let firstError = false;
  let recovered = false;
  for (const move of moves) {
    const wasError = scrambleGuideErrorIndex != null;
    scrambleGuideInputMoves.push(move);
    updateScrambleGuideProgress(move);
    if (!wasError && scrambleGuideErrorIndex != null) firstError = true;
    if (wasError && scrambleGuideErrorIndex == null) recovered = true;

    if (scrambleGuideStateMatchesTarget()) {
      completeScrambleGuide(source, protocol, deviceName);
      break;
    }
  }

  if (firstError && scrambleGuideErrorIndex != null) {
    const correction = scrambleGuideCorrectionText();
    beep();
    addBluetoothLog(
      '打乱/错误',
      `第 ${scrambleGuideErrorIndex + 1} 步不匹配`,
      [
        `应为 ${scrambleGuideMoves[scrambleGuideErrorIndex] || '-'}`,
        `实际 ${scrambleGuideErrorMove}`,
        correction ? `修正公式 ${correction}` : '',
      ].filter(Boolean).join(' · '),
    );
  }
  if (recovered && !scrambleGuideCompleted) {
    addBluetoothLog('打乱/恢复', '蓝牙状态回到公式路径', `当前 ${scrambleGuideCorrectPrefix}/${scrambleGuideMoves.length}`);
  }

  renderScrambleText();
  renderScrambleGuideMeta();
  renderTimer();

  if (scrambleGuideCompleted) {
    return { statusLabel: '打乱完成', reason: '自动观察', logKind: '打乱/完成' };
  }
  if (scrambleGuideErrorIndex != null) {
    return { statusLabel: '打乱错误', reason: '打乱错误', logKind: '打乱/错误' };
  }
  return {
    statusLabel: `打乱 ${scrambleGuideCorrectPrefix}/${scrambleGuideMoves.length}`,
    reason: '打乱校验',
    logKind: '打乱/进度',
  };
}

function updateScrambleGuideProgress(latestMove = '') {
  const match = scrambleGuideRouteMatch();
  if (match) {
    scrambleGuideCorrectPrefix = match.correctPrefix;
    scrambleGuidePartialIndex = match.partial ? match.displayIndex : null;
    scrambleGuideErrorIndex = null;
    scrambleGuideErrorMove = '';
    scrambleGuideLastMatchedInputLength = scrambleGuideInputMoves.length;
    scrambleGuideLastMatchedRemainingMoves = match.remainingMoves || [];
    return;
  }

  if (scrambleGuideErrorIndex == null) {
    scrambleGuideErrorIndex = Math.min(scrambleGuideCorrectPrefix, scrambleGuideMoves.length - 1);
    scrambleGuideErrorMove = latestMove;
  }
  scrambleGuidePartialIndex = null;
}

function scrambleGuideRouteMatch() {
  if (!scrambleGuideSupported) return null;
  try {
    const signature = cubeFacesSignature(cubeStateFromScramble(scrambleGuideInputMoves.join(' ')));
    let match = null;
    for (const entry of scrambleGuideRoute) {
      if (entry.signature === signature) match = entry;
    }
    return match;
  } catch {
    return null;
  }
}

function scrambleGuideStateMatchesTarget() {
  if (!scrambleGuideSupported || scrambleGuideInputMoves.length === 0) return false;
  try {
    return cubeFacesSignature(cubeStateFromScramble(scrambleGuideInputMoves.join(' ')))
      === scrambleGuideRoute.at(-1)?.signature;
  } catch {
    return false;
  }
}

function completeScrambleGuide(source, protocol = '', deviceName = '') {
  if (scrambleGuideCompleted) return;
  scrambleGuideCompleted = true;
  scrambleGuideCorrectPrefix = scrambleGuideMoves.length;
  scrambleGuidePartialIndex = null;
  scrambleGuideErrorIndex = null;
  scrambleGuideErrorMove = '';
  scrambleGuideLastMatchedInputLength = scrambleGuideInputMoves.length;
  scrambleGuideLastMatchedRemainingMoves = [];
  inspectionStartedAt = 0;
  activePenalty = 'ok';
  addBluetoothLog(
    '打乱/完成',
    '蓝牙状态匹配打乱公式',
    [deviceName, protocol, source, `${scrambleGuideInputMoves.length} 步`].filter(Boolean).join(' · '),
  );
  startInspection({ bluetoothGuardMs: 1000 });
  renderScrambleText();
  renderScrambleGuideMeta();
}

function cubeFacesSignature(faces) {
  return ['U', 'R', 'F', 'D', 'L', 'B'].map((face) => (
    faces?.[face]?.flat().map((sticker) => sticker?.face || '-').join('') || '---------'
  )).join('|');
}

function renderScramblePreview(scrambleText, puzzle = 'three') {
  const cacheKey = `${puzzle}\n${scrambleText}`;
  if (previewScrambleText === cacheKey && elements.cubeNet.hasChildNodes()) return;

  previewScrambleText = cacheKey;
  previewRequestId += 1;
  const requestId = previewRequestId;
  const cached = previewCache.get(cacheKey);

  if (cached?.svg) {
    renderTnoodleCubeSvg(cached.svg);
    return;
  }

  if (cached?.fallback) {
    renderLocalScramblePreview(scrambleText, puzzle);
    return;
  }

  renderPreviewLoading();
  loadScramblePreview(scrambleText, puzzle, requestId);
}

async function loadScramblePreview(scrambleText, puzzle, requestId) {
  const cacheKey = `${puzzle}\n${scrambleText}`;
  try {
    const data = await postJson('/api/scramble-preview', { scramble: scrambleText, puzzle });
    if (requestId !== previewRequestId || previewScrambleText !== cacheKey) return;

    if (data.svg) {
      previewCache.set(cacheKey, { svg: data.svg });
      renderTnoodleCubeSvg(data.svg);
    } else {
      previewCache.set(cacheKey, { fallback: true });
      renderLocalScramblePreview(scrambleText, puzzle);
    }
  } catch {
    if (requestId !== previewRequestId || previewScrambleText !== cacheKey) return;
    previewCache.set(cacheKey, { fallback: true });
    renderLocalScramblePreview(scrambleText, puzzle);
  }
}

function renderStats() {
  const sessionSolves = filteredSolves();
  const sessionSummary = summarizeSolves(sessionSolves);
  const dnfCount = sessionSolves.filter((solve) => solve.penalty === 'dnf').length;
  const successCount = sessionSolves.length - dnfCount;
  elements.countStat.textContent = `${successCount}/${sessionSolves.length}`;
  renderSessionGoalProgress(successCount, sessionSolves.length);
  elements.bestStat.textContent = sessionSummary.best == null ? '-' : formatTime(sessionSummary.best);
  elements.averageStat.textContent = sessionSummary.average == null ? '-' : formatTime(sessionSummary.average);
  elements.mo3Stat.textContent = sessionSummary.mo3 == null ? '-' : formatTime(sessionSummary.mo3);
  elements.ao5Stat.textContent = sessionSummary.ao5 == null ? '-' : formatTime(sessionSummary.ao5);
  elements.ao12Stat.textContent = sessionSummary.ao12 == null ? '-' : formatTime(sessionSummary.ao12);
  elements.bestMo3Stat.textContent = sessionSummary.bestMo3 == null ? '-' : formatTime(sessionSummary.bestMo3);
  elements.bestAo5Stat.textContent = sessionSummary.bestAo5 == null ? '-' : formatTime(sessionSummary.bestAo5);
  elements.bestAo12Stat.textContent = sessionSummary.bestAo12 == null ? '-' : formatTime(sessionSummary.bestAo12);
  elements.latestStat.textContent = sessionSummary.latest == null ? '-' : formatTime(sessionSummary.latest);
  elements.statsDetailButton.disabled = sessionSummary.count === 0;
}

function renderSessionGoalProgress(successCount, totalCount) {
  const goal = sessionTargetCountForId(currentSessionId);
  const progress = goal == null ? 0 : Math.min(1, successCount / goal);
  const done = goal != null && successCount >= goal;
  const label = goal == null
    ? '设目标'
    : `${done ? '达成' : '目标'} ${goal} · ${Math.round(progress * 100)}%`;

  elements.sessionGoalStat.textContent = label;
  elements.sessionGoalButton.classList.toggle('done', done);
  elements.sessionGoalButton.title = goal == null
    ? `本会话 ${successCount}/${totalCount}，点击设置目标`
    : `本会话 ${successCount}/${totalCount}，目标 ${goal}，完成 ${Math.round(progress * 100)}%`;
  elements.sessionGoalButton.setAttribute('aria-label', elements.sessionGoalButton.title);
  elements.sessionGoalBar.style.setProperty('--session-goal-progress', progress.toFixed(3));
}

function openAlgorithmTrainerDialog() {
  if (!algorithmTrainerCurrentCase()) chooseNextAlgorithmTrainerCase({ renderOnly: true });
  if (!elements.algorithmTrainerDialog.open) elements.algorithmTrainerDialog.showModal();
  renderAlgorithmTrainerDialog();
}

function handleAlgorithmTrainerKeyDown(event) {
  if (!elements.algorithmTrainerDialog.open || shouldIgnoreAlgorithmTrainerShortcut(event)) return;

  const actions = {
    Space: () => toggleAlgorithmTrainerTimer(),
    Enter: () => recordAlgorithmTrainerResult(true),
    Backspace: () => recordAlgorithmTrainerResult(false),
    KeyF: () => recordAlgorithmTrainerResult(false),
    KeyN: () => chooseNextAlgorithmTrainerCase(),
    KeyS: () => toggleAlgorithmTrainerStarred(),
    KeyC: () => { void copyAlgorithmTrainerSetup(); },
    KeyA: () => applyAlgorithmTrainerSetupToTimer(),
  };
  const action = actions[event.code];
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  action();
}

function shouldIgnoreAlgorithmTrainerShortcut(event) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target;
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function renderAlgorithmTrainerDialog() {
  if (!elements.algorithmTrainerDialog.open) return;
  elements.algorithmTrainerSet.value = algorithmTrainerSet;
  elements.algorithmTrainerFocus.value = algorithmTrainerFocus;
  const allSetCases = algorithmTrainerCasesForSet();
  renderAlgorithmTrainerGroupOptions(allSetCases);
  if (elements.algorithmTrainerSearch.value !== algorithmTrainerSearch) {
    elements.algorithmTrainerSearch.value = algorithmTrainerSearch;
  }
  const allCases = algorithmTrainerCasesForGroup(allSetCases);
  const scopedCases = algorithmTrainerCasesForFocus(allCases);
  const searchActive = algorithmTrainerSearchQuery() !== '';
  const focusCanFallback = algorithmTrainerFocusCanFallback();
  const focusBaseCases = scopedCases.length > 0 || algorithmTrainerFocus === 'all' || !focusCanFallback ? scopedCases : allCases;
  const visibleCases = algorithmTrainerCasesForSearch(focusBaseCases);
  const effectiveCases = searchActive ? visibleCases : (scopedCases.length > 0 || !focusCanFallback ? scopedCases : allCases);
  const current = algorithmTrainerCurrentCase(effectiveCases) || effectiveCases[0];
  if (current && current.id !== algorithmTrainerCurrentId) {
    algorithmTrainerCurrentId = current.id;
    localStorage.setItem('trainTimer.algorithmTrainerCurrentId', algorithmTrainerCurrentId);
  }
  if (!current) cancelAlgorithmTrainerTimer();
  const totals = algorithmTrainerTotals(allCases);
  const setLabel = algorithmTrainerSetLabels[algorithmTrainerSet] || algorithmTrainerSet.toUpperCase();
  const focusLabel = algorithmTrainerFocusLabels[algorithmTrainerFocus] || '全部';
  const groupLabel = algorithmTrainerGroup === 'all' ? '' : ` · ${algorithmTrainerGroup} ${allCases.length}/${allSetCases.length}`;
  const focusText = algorithmTrainerFocus === 'all' ? '' : ` · ${focusLabel} ${scopedCases.length}/${allCases.length}`;
  const searchText = searchActive ? ` · 搜索 ${visibleCases.length}/${focusBaseCases.length}` : '';
  elements.algorithmTrainerMeta.textContent = `${setLabel} · ${allSetCases.length} 条${groupLabel}${focusText}${searchText} · ${totals.success}/${totals.total} 掌握`;
  elements.algorithmTrainerName.textContent = current?.name || '-';
  elements.algorithmTrainerGroup.textContent = current?.group || '-';
  elements.algorithmTrainerAlg.textContent = current?.algorithm || '-';
  elements.algorithmTrainerHint.textContent = searchActive && visibleCases.length === 0
    ? `没有匹配“${algorithmTrainerSearchQuery()}”的公式`
    : (scopedCases.length === 0 && algorithmTrainerFocus !== 'all'
    ? (focusCanFallback ? `${focusLabel}范围暂无案例，随机会从全部中选择` : `${focusLabel}范围暂无案例`)
    : (current?.hint || '选择随机下一条开始练习'));
  const currentStats = algorithmTrainerStats[current?.id] || { success: 0, total: 0, streak: 0 };
  elements.algorithmTrainerScore.textContent = algorithmTrainerProgressText(currentStats);
  const customSelected = current?.set === 'custom';
  elements.algorithmTrainerEditButton.disabled = !customSelected;
  elements.algorithmTrainerDeleteButton.disabled = !customSelected;
  elements.algorithmTrainerExportButton.disabled = algorithmTrainerCustomCases.length === 0;
  renderAlgorithmTrainerStarButton(current);
  renderAlgorithmTrainerSetup(current);
  renderAlgorithmTrainerTimer(currentStats);
  const listRows = searchActive
    ? visibleCases
    : (scopedCases.length > 0 || algorithmTrainerFocus === 'all'
    ? scopedCases
    : []);
  elements.algorithmTrainerList.replaceChildren(
    ...(listRows.length > 0 ? listRows.map(renderAlgorithmTrainerListItem) : [renderAlgorithmTrainerEmpty(searchActive ? '搜索' : focusLabel)]),
  );
}

function renderAlgorithmTrainerListItem(item) {
  const stats = algorithmTrainerStats[item.id] || { success: 0, total: 0, streak: 0 };
  const row = document.createElement('button');
  row.type = 'button';
  row.className = [
    'algorithm-trainer-item',
    item.id === algorithmTrainerCurrentId ? 'active' : '',
    algorithmTrainerCaseStarred(item.id) ? 'starred' : '',
  ].filter(Boolean).join(' ');
  const reviewReason = algorithmTrainerFocus === 'review' ? algorithmTrainerReviewReason(item) : '';
  row.title = [item.algorithm, reviewReason].filter(Boolean).join(' · ');
  row.innerHTML = `
    <strong>${escapeHtml(item.name)}</strong>
    <span>${escapeHtml(item.group)}</span>
    <em>${escapeHtml(algorithmTrainerProgressText(stats))}</em>
  `;
  row.addEventListener('click', () => {
    cancelAlgorithmTrainerTimer();
    algorithmTrainerCurrentId = item.id;
    localStorage.setItem('trainTimer.algorithmTrainerCurrentId', algorithmTrainerCurrentId);
    renderAlgorithmTrainerDialog();
  });
  return row;
}

function renderAlgorithmTrainerEmpty(focusLabel) {
  const row = document.createElement('div');
  row.className = 'algorithm-trainer-empty';
  row.textContent = focusLabel === '搜索'
    ? `没有匹配“${algorithmTrainerSearchQuery()}”的公式`
    : `${focusLabel}范围暂无案例`;
  return row;
}

function chooseNextAlgorithmTrainerCase(options = {}) {
  cancelAlgorithmTrainerTimer();
  const allCases = algorithmTrainerCasesForGroup(algorithmTrainerCasesForSet());
  const focusedCases = algorithmTrainerCasesForFocus(allCases);
  const focusCanFallback = algorithmTrainerFocusCanFallback();
  const baseCases = focusedCases.length > 0 || algorithmTrainerFocus === 'all' || !focusCanFallback ? focusedCases : allCases;
  const searchActive = algorithmTrainerSearchQuery() !== '';
  const cases = searchActive ? algorithmTrainerCasesForSearch(baseCases) : baseCases;
  if (cases.length === 0) {
    algorithmTrainerCurrentId = '';
    localStorage.setItem('trainTimer.algorithmTrainerCurrentId', algorithmTrainerCurrentId);
    if (!options.renderOnly) renderAlgorithmTrainerDialog();
    return;
  }
  const weighted = cases.flatMap((item) => {
    const stats = algorithmTrainerStats[item.id] || { success: 0, total: 0, streak: 0 };
    const misses = Math.max(0, stats.total - stats.success);
    const weight = 1 + misses + (stats.total === 0 ? 2 : 0);
    return Array.from({ length: weight }, () => item);
  });
  let next = weighted[Math.floor(Math.random() * weighted.length)] || cases[0];
  if (cases.length > 1 && next.id === algorithmTrainerCurrentId) {
    next = cases[(cases.findIndex((item) => item.id === next.id) + 1) % cases.length];
  }
  algorithmTrainerCurrentId = next.id;
  localStorage.setItem('trainTimer.algorithmTrainerCurrentId', algorithmTrainerCurrentId);
  if (!options.renderOnly) renderAlgorithmTrainerDialog();
}

function recordAlgorithmTrainerResult(success) {
  const current = algorithmTrainerCurrentCase();
  if (!current) return;
  cancelAlgorithmTrainerTimer();
  const stats = algorithmTrainerStats[current.id] || { success: 0, total: 0, streak: 0 };
  stats.total += 1;
  if (success) {
    stats.success += 1;
    stats.streak = Math.max(0, stats.streak) + 1;
  } else {
    stats.streak = 0;
  }
  stats.updatedAt = new Date().toISOString();
  algorithmTrainerStats[current.id] = stats;
  saveAlgorithmTrainerStats();
  chooseNextAlgorithmTrainerCase();
}

function renderAlgorithmTrainerStarButton(current) {
  const starred = Boolean(current && algorithmTrainerCaseStarred(current.id));
  elements.algorithmTrainerStarButton.disabled = !current;
  elements.algorithmTrainerStarButton.textContent = starred ? '★' : '☆';
  elements.algorithmTrainerStarButton.classList.toggle('active', starred);
  elements.algorithmTrainerStarButton.setAttribute('aria-pressed', starred ? 'true' : 'false');
  elements.algorithmTrainerStarButton.setAttribute('aria-label', starred ? '取消收藏当前公式' : '收藏当前公式');
  elements.algorithmTrainerStarButton.title = current
    ? (starred ? 'S 取消收藏专项' : 'S 加入收藏专项')
    : '没有可收藏的公式';
}

function toggleAlgorithmTrainerStarred() {
  const current = algorithmTrainerCurrentCase();
  if (!current) return;
  if (algorithmTrainerStarredIds.has(current.id)) {
    algorithmTrainerStarredIds.delete(current.id);
  } else {
    algorithmTrainerStarredIds.add(current.id);
  }
  saveAlgorithmTrainerStarredIds();
  renderAlgorithmTrainerDialog();
}

function renderAlgorithmTrainerSetup(current) {
  const setup = current ? algorithmTrainerSetupText(current.algorithm) : '';
  const supported = Boolean(setup && algorithmTrainerSetupCanApply(setup));
  elements.algorithmTrainerSetup.textContent = setup ? `训练打乱 ${setup}` : '训练打乱 -';
  elements.algorithmTrainerSetup.title = setup
    ? (supported ? '可一键套用到当前计时器' : '含 M、r、x、y 等公式记号，建议复制后手动执行')
    : '当前公式无法生成训练打乱';
  elements.algorithmTrainerCopySetupButton.disabled = !setup;
  elements.algorithmTrainerCopySetupButton.textContent = '复制打乱';
  elements.algorithmTrainerApplySetupButton.disabled = !supported || !canApplyAlgorithmTrainerSetup();
  elements.algorithmTrainerApplySetupButton.title = supported
    ? (canApplyAlgorithmTrainerSetup() ? 'A 把训练打乱套用到主计时器并锁定当前打乱' : '计时、观察或保存中不能套用')
    : '只有基础面转 UDRLFB 才能直接套用到计时器';
}

function algorithmTrainerSetupText(algorithm = '') {
  const tokens = String(algorithm || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  return tokens.slice().reverse().map(invertAlgorithmTrainerToken).join(' ');
}

function invertAlgorithmTrainerToken(token) {
  if (token.endsWith('2')) return token;
  if (token.endsWith("'")) return token.slice(0, -1);
  return `${token}'`;
}

function algorithmTrainerSetupCanApply(setupText) {
  try {
    parseScramble(setupText);
    return true;
  } catch {
    return false;
  }
}

function canApplyAlgorithmTrainerSetup() {
  return !['timing', 'inspection', 'hold', 'saving'].includes(appState);
}

async function copyAlgorithmTrainerSetup() {
  const current = algorithmTrainerCurrentCase();
  const setup = current ? algorithmTrainerSetupText(current.algorithm) : '';
  if (!setup) return;
  try {
    await navigator.clipboard.writeText(setup);
    elements.algorithmTrainerCopySetupButton.textContent = '已复制';
    setTimeout(() => {
      elements.algorithmTrainerCopySetupButton.textContent = '复制打乱';
    }, 900);
  } catch (error) {
    alert(`复制训练打乱失败：${error.message || String(error)}`);
  }
}

function applyAlgorithmTrainerSetupToTimer() {
  const current = algorithmTrainerCurrentCase();
  const setup = current ? algorithmTrainerSetupText(current.algorithm) : '';
  if (!setup || !algorithmTrainerSetupCanApply(setup) || !canApplyAlgorithmTrainerSetup()) return;
  scramble = {
    scramble: setup,
    source: `算法训练 · ${current.name}`,
    puzzle: 'three',
  };
  scramblePuzzle = 'three';
  localStorage.setItem('trainTimer.scramblePuzzle', scramblePuzzle);
  updateLocalSession(currentSessionId, { scramblePuzzle });
  scrambleLocked = true;
  localStorage.setItem('trainTimer.scrambleLocked', '1');
  activePenalty = 'ok';
  activeInspectionUsed = false;
  inspectionStartedAt = 0;
  inspectionBluetoothStartBlockedUntil = 0;
  resetBluetoothSolveTracking();
  resetScrambleGuide();
  render();
}

function toggleAlgorithmTrainerTimer() {
  if (algorithmTrainerTimerStartedAt > 0) {
    finishAlgorithmTrainerTimer();
    return;
  }
  startAlgorithmTrainerTimer();
}

function startAlgorithmTrainerTimer() {
  if (!algorithmTrainerCurrentCase()) return;
  algorithmTrainerTimerStartedAt = performance.now();
  tickAlgorithmTrainerTimer();
}

function finishAlgorithmTrainerTimer() {
  const current = algorithmTrainerCurrentCase();
  if (!current || algorithmTrainerTimerStartedAt <= 0) {
    cancelAlgorithmTrainerTimer();
    return;
  }

  const durationMs = Math.max(1, Math.round(performance.now() - algorithmTrainerTimerStartedAt));
  cancelAlgorithmTrainerTimer({ keepDisplay: true });
  recordAlgorithmTrainerTimedAttempt(current.id, durationMs);
  renderAlgorithmTrainerDialog();
}

function tickAlgorithmTrainerTimer() {
  if (algorithmTrainerTimerStartedAt <= 0) return;
  const elapsedMs = Math.max(0, performance.now() - algorithmTrainerTimerStartedAt);
  elements.algorithmTrainerTimerDisplay.textContent = formatTime(elapsedMs);
  elements.algorithmTrainerTimerButton.textContent = '完成记录';
  elements.algorithmTrainerTimerButton.classList.add('running');
  if (algorithmTrainerTimerFrame) cancelAnimationFrame(algorithmTrainerTimerFrame);
  algorithmTrainerTimerFrame = requestAnimationFrame(tickAlgorithmTrainerTimer);
}

function cancelAlgorithmTrainerTimer(options = {}) {
  if (algorithmTrainerTimerFrame) {
    cancelAnimationFrame(algorithmTrainerTimerFrame);
    algorithmTrainerTimerFrame = 0;
  }
  algorithmTrainerTimerStartedAt = 0;
  if (!options.keepDisplay && elements.algorithmTrainerTimerButton) {
    elements.algorithmTrainerTimerButton.textContent = '开始计时';
    elements.algorithmTrainerTimerButton.classList.remove('running');
  }
}

function recordAlgorithmTrainerTimedAttempt(caseId, durationMs) {
  const stats = algorithmTrainerStats[caseId] || { success: 0, total: 0, streak: 0 };
  stats.total = Math.max(0, Number(stats.total) || 0) + 1;
  stats.success = Math.max(0, Number(stats.success) || 0) + 1;
  stats.streak = Math.max(0, Number(stats.streak) || 0) + 1;
  stats.timedCount = Math.max(0, Number(stats.timedCount) || 0) + 1;
  stats.timedTotalMs = Math.max(0, Number(stats.timedTotalMs) || 0) + durationMs;
  const previousBestMs = Number(stats.timedBestMs);
  stats.timedBestMs = Number.isFinite(previousBestMs) ? Math.min(previousBestMs, durationMs) : durationMs;
  stats.lastTimedMs = durationMs;
  stats.updatedAt = new Date().toISOString();
  algorithmTrainerStats[caseId] = stats;
  saveAlgorithmTrainerStats();
}

function renderAlgorithmTrainerTimer(stats = {}) {
  const running = algorithmTrainerTimerStartedAt > 0;
  const lastMs = Number.isFinite(Number(stats.lastTimedMs)) ? Number(stats.lastTimedMs) : null;
  const bestMs = Number.isFinite(Number(stats.timedBestMs)) ? Number(stats.timedBestMs) : null;
  const count = Math.max(0, Number(stats.timedCount) || 0);
  const averageMs = count > 0 && Number.isFinite(Number(stats.timedTotalMs)) ? Number(stats.timedTotalMs) / count : null;
  if (!running) {
    elements.algorithmTrainerTimerDisplay.textContent = Number.isFinite(lastMs) ? formatTime(lastMs) : '0.000';
    elements.algorithmTrainerTimerButton.textContent = '开始计时';
    elements.algorithmTrainerTimerButton.classList.remove('running');
  }
  elements.algorithmTrainerTimerButton.disabled = !algorithmTrainerCurrentCase();
  elements.algorithmTrainerTimerButton.title = running ? 'Space 完成训练计时' : 'Space 开始训练计时';
  elements.algorithmTrainerTimerStats.textContent = count > 0 && Number.isFinite(lastMs) && Number.isFinite(bestMs) && Number.isFinite(averageMs)
    ? `最近 ${formatTime(lastMs)} · 最佳 ${formatTime(bestMs)} · 平均 ${formatTime(averageMs)} · ${count} 次`
    : '计时练习未开始';
}

function resetAlgorithmTrainerStats() {
  if (!confirm('清空算法训练记录？')) return;
  cancelAlgorithmTrainerTimer();
  algorithmTrainerStats = {};
  saveAlgorithmTrainerStats();
  renderAlgorithmTrainerDialog();
}

function addAlgorithmTrainerCustomCase() {
  const name = prompt('自定义公式名称，例如 Jb Perm 或 左手 OLL。');
  if (name === null) return;
  const cleanName = name.trim();
  if (!cleanName) return;

  const algorithm = prompt("输入公式，例如 R U R' U'。");
  if (algorithm === null) return;
  const cleanAlgorithm = algorithm.trim().replace(/\s+/g, ' ');
  if (!cleanAlgorithm) return;

  const group = prompt('分组名称，可留空。', 'Custom');
  if (group === null) return;
  const hint = prompt('提示或识别要点，可留空。', '');
  if (hint === null) return;

  const item = {
    id: createAlgorithmTrainerCustomCaseId(),
    set: 'custom',
    name: cleanName.slice(0, 80),
    group: (group.trim() || 'Custom').slice(0, 80),
    algorithm: cleanAlgorithm.slice(0, 220),
    hint: hint.trim().slice(0, 160),
  };
  algorithmTrainerCustomCases = [...algorithmTrainerCustomCases, item];
  saveAlgorithmTrainerCustomCases();
  cancelAlgorithmTrainerTimer();
  algorithmTrainerSet = 'custom';
  algorithmTrainerFocus = 'all';
  algorithmTrainerCurrentId = item.id;
  localStorage.setItem('trainTimer.algorithmTrainerSet', algorithmTrainerSet);
  localStorage.setItem('trainTimer.algorithmTrainerFocus', algorithmTrainerFocus);
  localStorage.setItem('trainTimer.algorithmTrainerCurrentId', algorithmTrainerCurrentId);
  renderAlgorithmTrainerDialog();
}

function editAlgorithmTrainerCustomCase() {
  const current = algorithmTrainerCurrentCase();
  if (!current || current.set !== 'custom') return;

  const name = prompt('编辑公式名称。', current.name || '');
  if (name === null) return;
  const cleanName = name.trim();
  if (!cleanName) return;

  const algorithm = prompt('编辑公式。', current.algorithm || '');
  if (algorithm === null) return;
  const cleanAlgorithm = algorithm.trim().replace(/\s+/g, ' ');
  if (!cleanAlgorithm) return;

  const group = prompt('编辑分组名称，可留空。', current.group || 'Custom');
  if (group === null) return;
  const hint = prompt('编辑提示或识别要点，可留空。', current.hint || '');
  if (hint === null) return;

  const updated = {
    ...current,
    name: cleanName.slice(0, 80),
    group: (group.trim() || 'Custom').slice(0, 80),
    algorithm: cleanAlgorithm.slice(0, 220),
    hint: hint.trim().slice(0, 160),
  };
  const duplicate = algorithmTrainerCustomCases.some((item) => (
    item.id !== current.id && algorithmTrainerCustomCaseKey(item) === algorithmTrainerCustomCaseKey(updated)
  ));
  if (duplicate) {
    alert('已存在相同名称、分组和公式的自定义公式。');
    return;
  }

  cancelAlgorithmTrainerTimer();
  algorithmTrainerCustomCases = algorithmTrainerCustomCases.map((item) => (
    item.id === current.id ? updated : item
  ));
  saveAlgorithmTrainerCustomCases();
  algorithmTrainerCurrentId = updated.id;
  localStorage.setItem('trainTimer.algorithmTrainerCurrentId', algorithmTrainerCurrentId);
  renderAlgorithmTrainerDialog();
}

function exportAlgorithmTrainerCustomCases() {
  if (algorithmTrainerCustomCases.length === 0) return;
  const payload = {
    source: 'train-timer-algorithm-trainer',
    version: 1,
    exportedAt: new Date().toISOString(),
    cases: algorithmTrainerCustomCases.map((item) => ({
      name: item.name,
      group: item.group,
      algorithm: item.algorithm,
      hint: item.hint || '',
    })),
  };
  downloadTextFile(
    `traintimer-algorithms-${algorithmTrainerCustomCases.length}.json`,
    `${JSON.stringify(payload, null, 2)}\n`,
    'application/json;charset=utf-8',
  );
}

async function importAlgorithmTrainerCustomCases() {
  const [file] = elements.algorithmTrainerImportFile.files;
  if (!file) return;
  try {
    const text = await file.text();
    const imported = parseAlgorithmTrainerCustomCaseImport(text);
    if (imported.length === 0) {
      alert('没有可导入的自定义公式。JSON 可以是公式数组，或包含 cases 数组的对象。');
      return;
    }

    const existingKeys = new Set(algorithmTrainerCustomCases.map(algorithmTrainerCustomCaseKey));
    const nextItems = [];
    for (const item of imported) {
      const key = algorithmTrainerCustomCaseKey(item);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      nextItems.push({ ...item, id: createAlgorithmTrainerCustomCaseId() });
    }

    if (nextItems.length === 0) {
      alert(`“${file.name}”里的公式都已存在。`);
      return;
    }

    cancelAlgorithmTrainerTimer();
    algorithmTrainerCustomCases = [...algorithmTrainerCustomCases, ...nextItems];
    saveAlgorithmTrainerCustomCases();
    algorithmTrainerSet = 'custom';
    algorithmTrainerFocus = 'all';
    algorithmTrainerCurrentId = nextItems[0].id;
    localStorage.setItem('trainTimer.algorithmTrainerSet', algorithmTrainerSet);
    localStorage.setItem('trainTimer.algorithmTrainerFocus', algorithmTrainerFocus);
    localStorage.setItem('trainTimer.algorithmTrainerCurrentId', algorithmTrainerCurrentId);
    renderAlgorithmTrainerDialog();
    alert(`已导入 ${nextItems.length} 条自定义公式。`);
  } catch (error) {
    alert(`导入自定义公式失败：${error.message || String(error)}`);
  } finally {
    elements.algorithmTrainerImportFile.value = '';
  }
}

function deleteAlgorithmTrainerCustomCase() {
  const current = algorithmTrainerCurrentCase();
  if (!current || current.set !== 'custom') return;
  if (!confirm(`删除自定义公式“${current.name}”？`)) return;
  cancelAlgorithmTrainerTimer();
  algorithmTrainerCustomCases = algorithmTrainerCustomCases.filter((item) => item.id !== current.id);
  delete algorithmTrainerStats[current.id];
  algorithmTrainerStarredIds.delete(current.id);
  saveAlgorithmTrainerCustomCases();
  saveAlgorithmTrainerStats();
  saveAlgorithmTrainerStarredIds();
  algorithmTrainerCurrentId = algorithmTrainerCustomCases[0]?.id || '';
  localStorage.setItem('trainTimer.algorithmTrainerCurrentId', algorithmTrainerCurrentId);
  renderAlgorithmTrainerDialog();
}

function parseAlgorithmTrainerCustomCaseImport(text) {
  const parsed = JSON.parse(text);
  const rawCases = Array.isArray(parsed) ? parsed : parsed?.cases;
  if (!Array.isArray(rawCases)) return [];
  return rawCases
    .map(normalizeAlgorithmTrainerCustomCase)
    .filter(Boolean)
    .map((item) => ({ ...item, id: createAlgorithmTrainerCustomCaseId() }));
}

function createAlgorithmTrainerCustomCaseId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function algorithmTrainerCustomCaseKey(item) {
  return [
    item.group,
    item.name,
    item.algorithm,
  ].map((value) => String(value || '').trim().toLowerCase()).join('|');
}

function algorithmTrainerAllCases() {
  return [...algorithmTrainerCases, ...algorithmTrainerCustomCases];
}

function algorithmTrainerCasesForSet() {
  return algorithmTrainerAllCases().filter((item) => item.set === algorithmTrainerSet);
}

function renderAlgorithmTrainerGroupOptions(cases) {
  const groups = algorithmTrainerGroupOptions(cases);
  if (algorithmTrainerGroup !== 'all' && !groups.includes(algorithmTrainerGroup)) {
    algorithmTrainerGroup = 'all';
    localStorage.setItem('trainTimer.algorithmTrainerGroup', algorithmTrainerGroup);
  }
  elements.algorithmTrainerGroupFilter.replaceChildren(
    optionNode('all', '全部分组', algorithmTrainerGroup === 'all'),
    ...groups.map((group) => optionNode(group, `${group} (${cases.filter((item) => item.group === group).length})`, group === algorithmTrainerGroup)),
  );
}

function optionNode(value, label, selected = false) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  return option;
}

function algorithmTrainerGroupOptions(cases) {
  return [...new Set(cases.map((item) => item.group).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' }));
}

function algorithmTrainerCasesForGroup(cases) {
  if (algorithmTrainerGroup === 'all') return cases;
  return cases.filter((item) => item.group === algorithmTrainerGroup);
}

function algorithmTrainerCasesForFocus(cases) {
  if (algorithmTrainerFocus === 'review') {
    return cases.filter((item) => algorithmTrainerCaseNeedsReviewQueue(item, cases));
  }
  if (algorithmTrainerFocus === 'new') {
    return cases.filter((item) => (algorithmTrainerStats[item.id]?.total || 0) === 0);
  }
  if (algorithmTrainerFocus === 'weak') {
    return cases.filter((item) => algorithmTrainerCaseNeedsReview(item));
  }
  if (algorithmTrainerFocus === 'starred') {
    return cases.filter((item) => algorithmTrainerCaseStarred(item.id));
  }
  return cases;
}

function algorithmTrainerFocusCanFallback() {
  return algorithmTrainerFocus !== 'starred';
}

function algorithmTrainerCasesForSearch(cases) {
  const query = algorithmTrainerSearchQuery();
  if (!query) return cases;
  return cases.filter((item) => algorithmTrainerSearchText(item).includes(query));
}

function algorithmTrainerSearchQuery() {
  return algorithmTrainerSearch.trim().toLowerCase();
}

function algorithmTrainerSearchText(item) {
  return [
    item.name,
    item.group,
    item.algorithm,
    item.hint,
  ].filter(Boolean).join(' ').toLowerCase();
}

function algorithmTrainerCaseStarred(caseId) {
  return algorithmTrainerStarredIds.has(String(caseId || ''));
}

function algorithmTrainerCaseNeedsReview(item) {
  const stats = algorithmTrainerStats[item.id] || { success: 0, total: 0, streak: 0 };
  if ((stats.total || 0) === 0) return false;
  const accuracy = (stats.success || 0) / stats.total;
  return accuracy < 0.85 || (stats.streak || 0) === 0;
}

function algorithmTrainerCaseNeedsReviewQueue(item, cases = algorithmTrainerCasesForSet()) {
  const stats = algorithmTrainerStats[item.id] || {};
  if ((stats.total || 0) === 0) return true;
  if (algorithmTrainerCaseNeedsReview(item)) return true;
  if (algorithmTrainerCaseIsStale(stats)) return true;
  return algorithmTrainerCaseIsSlow(item, cases);
}

function algorithmTrainerReviewReason(item) {
  const stats = algorithmTrainerStats[item.id] || {};
  if ((stats.total || 0) === 0) return '未练';
  if (algorithmTrainerCaseNeedsReview(item)) return '准确率或连续掌握不足';
  if (algorithmTrainerCaseIsStale(stats)) return '超过 7 天未练';
  if (algorithmTrainerCaseIsSlow(item, algorithmTrainerCasesForSet())) return '计时慢于本组平均';
  return '';
}

function algorithmTrainerCaseIsStale(stats = {}) {
  const updatedAt = Date.parse(stats.updatedAt || '');
  if (!Number.isFinite(updatedAt)) return true;
  return Date.now() - updatedAt >= 7 * 24 * 60 * 60 * 1000;
}

function algorithmTrainerCaseIsSlow(item, cases) {
  const stats = algorithmTrainerStats[item.id] || {};
  const count = Math.max(0, Number(stats.timedCount) || 0);
  const totalMs = Number(stats.timedTotalMs);
  if (count < 2 || !Number.isFinite(totalMs)) return false;
  const averageMs = totalMs / count;
  const setAverageMs = algorithmTrainerTimedSetAverage(cases);
  return Number.isFinite(setAverageMs) && averageMs > setAverageMs * 1.18;
}

function algorithmTrainerTimedSetAverage(cases) {
  const averages = cases
    .map((item) => {
      const stats = algorithmTrainerStats[item.id] || {};
      const count = Math.max(0, Number(stats.timedCount) || 0);
      const totalMs = Number(stats.timedTotalMs);
      return count > 0 && Number.isFinite(totalMs) ? totalMs / count : null;
    })
    .filter((value) => Number.isFinite(value));
  if (averages.length < 3) return null;
  return averages.reduce((sum, value) => sum + value, 0) / averages.length;
}

function algorithmTrainerCurrentCase(cases = algorithmTrainerCasesForSet()) {
  return cases.find((item) => item.id === algorithmTrainerCurrentId && item.set === algorithmTrainerSet) || null;
}

function algorithmTrainerProgressText(stats = {}) {
  const total = Math.max(0, Number(stats.total) || 0);
  const success = Math.max(0, Number(stats.success) || 0);
  if (total === 0) return '未练';
  const accuracy = Math.round((success / total) * 100);
  const streak = Math.max(0, Number(stats.streak) || 0);
  return streak > 1 ? `${accuracy}% · 连${streak}` : `${accuracy}% · ${success}/${total}`;
}

function algorithmTrainerTotals(cases) {
  return cases.reduce((total, item) => {
    const stats = algorithmTrainerStats[item.id] || {};
    total.success += stats.success || 0;
    total.total += stats.total || 0;
    return total;
  }, { success: 0, total: 0 });
}

function loadAlgorithmTrainerCustomCases() {
  try {
    const parsed = JSON.parse(localStorage.getItem('trainTimer.algorithmTrainerCustomCases') || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeAlgorithmTrainerCustomCase)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeAlgorithmTrainerCustomCase(item, index) {
  if (!item || typeof item !== 'object') return null;
  const name = String(item.name || item.case || item.label || '').trim().slice(0, 80);
  const algorithm = String(item.algorithm || item.alg || item.moves || '').trim().replace(/\s+/g, ' ').slice(0, 220);
  if (!name || !algorithm) return null;
  const rawId = String(item.id || '').trim();
  return {
    id: rawId.startsWith('custom-') ? rawId : `custom-import-${index}`,
    set: 'custom',
    name,
    group: String(item.group || item.category || item.set || 'Custom').trim().slice(0, 80) || 'Custom',
    algorithm,
    hint: String(item.hint || '').trim().slice(0, 160),
  };
}

function saveAlgorithmTrainerCustomCases() {
  localStorage.setItem('trainTimer.algorithmTrainerCustomCases', JSON.stringify(algorithmTrainerCustomCases));
}

function loadAlgorithmTrainerStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem('trainTimer.algorithmTrainerStats') || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAlgorithmTrainerStats() {
  localStorage.setItem('trainTimer.algorithmTrainerStats', JSON.stringify(algorithmTrainerStats));
}

function loadAlgorithmTrainerStarredIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem('trainTimer.algorithmTrainerStarredIds') || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map((id) => String(id || '')).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function saveAlgorithmTrainerStarredIds() {
  localStorage.setItem('trainTimer.algorithmTrainerStarredIds', JSON.stringify([...algorithmTrainerStarredIds]));
}

function renderStatsDialog() {
  if (!elements.statsDialog.open) return;
  const statsData = currentStatsData();
  const summary = summarizeSolves(statsData.solves);
  elements.statsDialogMeta.textContent = `${statsData.label} · ${summary.count} 条成绩`;
  elements.copyStatsSummaryButton.disabled = summary.count === 0;
  renderStatsTrendChart(statsData.solves, statsData.scope === 'session' ? '最近' : statsData.shortLabel);
  renderStatsDistributionChart(statsData.solves, statsData.scope === 'session' ? '当前会话' : statsData.shortLabel);
  renderStatsInsights(statsData.solves, summary);
  renderStatsRecords(statsData.solves, { selected: statsData.scope !== 'session' });
  elements.statsSessionOverviewPanel.hidden = statsData.scope !== 'session';
  if (statsData.scope !== 'session') elements.sessionOverviewList.replaceChildren();
  else renderSessionOverview();

  const rows = [
    ['总次数', summary.count],
    ['有效成绩', summary.validCount],
    ['DNF', summary.dnfCount],
    ['+2', summary.plus2Count],
    ['蓝牙成绩', summary.bluetoothSolveCount],
    ['最佳', timeOrDash(summary.best)],
    ['最差', timeOrDash(summary.worst)],
    ['平均', timeOrDash(summary.average)],
    ['标准差', timeOrDash(summary.standardDeviation)],
    ['平均转动', numberOrDash(summary.averageBluetoothMoveCount, 1)],
    ['平均 TPS', numberOrDash(summary.averageBluetoothTps, 3)],
    ['最佳 TPS', numberOrDash(summary.bestBluetoothTps, 3)],
    ['最近', timeOrDash(summary.latest)],
    ['mo3', timeOrDash(summary.mo3)],
    ['ao5', timeOrDash(summary.ao5)],
    ['ao12', timeOrDash(summary.ao12)],
    ['ao50', timeOrDash(summary.ao50)],
    ['ao100', timeOrDash(summary.ao100)],
    ['最佳 mo3', timeOrDash(summary.bestMo3)],
    ['最佳 ao5', timeOrDash(summary.bestAo5)],
    ['最佳 ao12', timeOrDash(summary.bestAo12)],
    ['最佳 ao50', timeOrDash(summary.bestAo50)],
    ['最佳 ao100', timeOrDash(summary.bestAo100)],
  ];

  elements.statsDetailGrid.replaceChildren(
    ...rows.map(([label, value]) => {
      const item = document.createElement('div');
      item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
      return item;
    }),
  );
}

function renderStatsInsights(sessionSolves, summary) {
  const insights = buildStatsInsights(sessionSolves, summary);
  elements.statsInsights.replaceChildren(
    ...insights.map((insight) => {
      const item = document.createElement('div');
      item.className = `stats-insight ${insight.tone || 'neutral'}`;
      item.innerHTML = `
        <span>${escapeHtml(insight.label)}</span>
        <strong>${escapeHtml(insight.value)}</strong>
        <em>${escapeHtml(insight.detail)}</em>
      `;
      return item;
    }),
  );
}

function buildStatsInsights(sessionSolves, summary) {
  return [
    buildRecentTrendInsight(sessionSolves),
    buildConsistencyInsight(summary),
    buildPenaltyInsight(summary),
    buildBluetoothInsight(summary),
  ];
}

function buildRecentTrendInsight(sessionSolves) {
  const validTimes = sessionSolves
    .map((solve) => effectiveDurationMs(solve))
    .filter((value) => Number.isFinite(value));
  if (validTimes.length < 10) {
    return {
      label: '近期趋势',
      value: `${validTimes.length}/10`,
      detail: '至少 10 个有效成绩后对比最近 5 把',
      tone: 'neutral',
    };
  }

  const recent = averageNumber(validTimes.slice(-5));
  const previous = averageNumber(validTimes.slice(-10, -5));
  const diff = recent - previous;
  const faster = diff < -1;
  const slower = diff > 1;
  return {
    label: '近期趋势',
    value: faster ? `快 ${formatTime(Math.abs(diff))}` : (slower ? `慢 ${formatTime(diff)}` : '持平'),
    detail: `最近 5 把 ${formatTime(recent)} · 前 5 把 ${formatTime(previous)}`,
    tone: faster ? 'good' : (slower ? 'warning' : 'neutral'),
  };
}

function buildConsistencyInsight(summary) {
  if (!Number.isFinite(summary.standardDeviation) || !Number.isFinite(summary.average)) {
    return {
      label: '稳定性',
      value: '-',
      detail: '还没有足够的有效成绩',
      tone: 'neutral',
    };
  }
  const ratio = summary.average > 0 ? summary.standardDeviation / summary.average : 0;
  return {
    label: '稳定性',
    value: formatTime(summary.standardDeviation),
    detail: ratio < 0.08 ? '波动很低' : (ratio < 0.16 ? '波动正常' : '建议优先稳定节奏'),
    tone: ratio < 0.08 ? 'good' : (ratio < 0.16 ? 'neutral' : 'warning'),
  };
}

function buildPenaltyInsight(summary) {
  if (!summary.count) {
    return {
      label: '清洁度',
      value: '-',
      detail: '暂无成绩',
      tone: 'neutral',
    };
  }
  const penaltyCount = (summary.dnfCount || 0) + (summary.plus2Count || 0);
  const rate = penaltyCount / summary.count;
  return {
    label: '清洁度',
    value: `${Math.round(rate * 100)}%`,
    detail: `DNF ${summary.dnfCount || 0} · +2 ${summary.plus2Count || 0}`,
    tone: rate === 0 ? 'good' : (rate <= 0.08 ? 'neutral' : 'warning'),
  };
}

function buildBluetoothInsight(summary) {
  if (!summary.bluetoothSolveCount) {
    return {
      label: '蓝牙效率',
      value: '-',
      detail: '连接蓝牙魔方后显示 TPS',
      tone: 'neutral',
    };
  }
  const averageTps = numberOrDash(summary.averageBluetoothTps, 2);
  return {
    label: '蓝牙效率',
    value: `${averageTps} TPS`,
    detail: `最佳 ${numberOrDash(summary.bestBluetoothTps, 2)} · ${summary.bluetoothSolveCount} 把`,
    tone: Number.isFinite(summary.averageBluetoothTps) && summary.averageBluetoothTps >= 4 ? 'good' : 'neutral',
  };
}

function currentStatsData() {
  if (statsScope === 'selected') {
    const statsSolves = selectedStatsSolves();
    const sessionIds = new Set(statsSolves.map((solve) => solve.sessionId || 'default'));
    const scopeLabel = sessionIds.size > 1 ? `选中成绩 · ${sessionIds.size} 个会话` : '选中成绩';
    return { scope: 'selected', shortLabel: '选中', label: scopeLabel, solves: statsSolves };
  }

  if (statsScope === 'listed') {
    const statsSolves = filteredAllSolves();
    const sessionIds = new Set(statsSolves.map((solve) => solve.sessionId || 'default'));
    const baseSolves = allSolvesBaseSolves();
    const scopeLabel = allSolvesFilterActive()
      ? `当前筛选列表 · ${statsSolves.length} / ${baseSolves.length}`
      : (sessionIds.size > 1 ? `当前列表 · ${sessionIds.size} 个会话` : '当前列表');
    return { scope: 'listed', shortLabel: '列表', label: scopeLabel, solves: statsSolves };
  }

  const currentSession = sessions.find((session) => session.id === currentSessionId);
  return {
    scope: 'session',
    shortLabel: '最近',
    label: currentSession?.name || currentSessionId,
    solves: filteredSolves(),
  };
}

function selectedStatsSolves() {
  return solves.filter((solve) => selectedSolveIds.has(solve.id));
}

function renderSessionOverview() {
  if (!elements.statsDialog.open) return;

  const rows = sessions.map((session) => {
    const sessionSolves = solvesForSession(session.id);
    const summary = summarizeSolves(sessionSolves);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = session.id === currentSessionId ? 'session-overview-row active' : 'session-overview-row';
    item.dataset.sessionId = session.id;
    item.innerHTML = `
      <strong>${escapeHtml(session.name)}</strong>
      <span>${summary.count} 把</span>
      <span>${timeOrDash(summary.best)}</span>
      <span>${timeOrDash(summary.average)}</span>
      <span>${timeOrDash(summary.ao5)}</span>
      <span>${timeOrDash(summary.latest)}</span>
    `;
    return item;
  });

  elements.sessionOverviewList.replaceChildren(
    sessionOverviewHeader(),
    ...rows,
  );
}

function sessionOverviewHeader() {
  const header = document.createElement('div');
  header.className = 'session-overview-head';
  header.innerHTML = `
    <span>会话</span>
    <span>次数</span>
    <span>最佳</span>
    <span>平均</span>
    <span>ao5</span>
    <span>最近</span>
  `;
  return header;
}

function renderStatsRecords(sessionSolves, options = {}) {
  elements.statsRecordHint.textContent = options.selected
    ? '选中集合内的最佳统计，平均不跳转到会话明细'
    : '点击查看成绩或平均明细';
  const records = [
    bestSingleRecord(sessionSolves),
    bestMeanRecord(sessionSolves, 3),
    bestAverageRecord(sessionSolves, 5),
    bestAverageRecord(sessionSolves, 12),
    bestAverageRecord(sessionSolves, 50),
    bestAverageRecord(sessionSolves, 100),
  ].filter(Boolean);

  if (records.length === 0) {
    elements.statsRecordList.innerHTML = '<div class="stats-record-empty">暂无可定位纪录</div>';
    return;
  }

  elements.statsRecordList.replaceChildren(
    ...records.map((record) => {
      const endSolve = sessionSolves[record.endIndex];
      const startNumber = record.startIndex + 1;
      const endNumber = record.endIndex + 1;
      const range = startNumber === endNumber ? `#${endNumber}` : `#${startNumber}-#${endNumber}`;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'stats-record-item';
      if (record.type === 'single') {
        item.dataset.detailId = endSolve?.id || '';
      } else if (!options.selected) {
        item.dataset.averageId = endSolve?.id || '';
        item.dataset.averageKind = record.type.startsWith('mo') ? 'mean' : 'average';
        item.dataset.averageSize = record.type.replace(/^\D+/, '');
      } else {
        item.disabled = true;
        item.title = '选中统计里的平均按当前选中集合计算';
      }
      item.innerHTML = `
        <span>${escapeHtml(record.label)}</span>
        <strong>${timeOrDash(record.value)}</strong>
        <em>${escapeHtml(range)} · ${escapeHtml(endSolve ? new Date(endSolve.createdAt).toLocaleString() : '-')}</em>
      `;
      return item;
    }),
  );
}

function handleStatsRecordClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const averageButton = target?.closest('[data-average-id]');
  if (averageButton?.dataset.averageId) {
    elements.statsDialog.close();
    openAverageDialog(
      averageButton.dataset.averageId,
      Number(averageButton.dataset.averageSize),
      averageButton.dataset.averageKind,
    );
    return;
  }

  const button = target?.closest('[data-detail-id]');
  if (!button?.dataset.detailId) return;
  elements.statsDialog.close();
  openSolveDialog(button.dataset.detailId);
}

async function handleSessionOverviewClick(event) {
  const button = event.target.closest('[data-session-id]');
  if (!button?.dataset.sessionId || button.dataset.sessionId === currentSessionId) return;
  await selectSession(button.dataset.sessionId);
}

async function copyStatsSummary() {
  const statsData = currentStatsData();
  const summary = summarizeSolves(statsData.solves);
  const text = buildStatsSummary(statsData.label, summary, statsData.solves);
  try {
    await navigator.clipboard.writeText(text);
    elements.copyStatsSummaryButton.textContent = '已复制';
    setTimeout(() => {
      elements.copyStatsSummaryButton.textContent = '复制统计';
    }, 900);
  } catch {
    alert(text);
  }
}

function renderStatsTrendChart(sessionSolves, chartLabel = '最近') {
  const canvas = elements.statsTrendChart;
  const context = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const chartSolves = sessionSolves.slice(-50);
  const startIndex = Math.max(0, sessionSolves.length - chartSolves.length);
  const points = chartSolves
    .map((solve, index) => ({
      index,
      solve,
      value: statsChartValueAt(sessionSolves, startIndex + index, statsChartMode),
    }))
    .filter((point) => Number.isFinite(point.value));
  renderStatsChartModeControls();
  const modeLabel = statsChartLabels[statsChartMode] || '单次';
  elements.statsChartTitle.textContent = `${modeLabel} 趋势`;

  if (points.length === 0) {
    drawEmptyTrendChart(context, width, height, modeLabel);
    elements.statsChartMeta.textContent = `${chartLabel} ${chartSolves.length} 把 · ${modeLabel} 暂无有效数据`;
    return;
  }

  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = { top: 18, right: 18, bottom: 28, left: 52 };
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);
  const valueRange = Math.max(1, maxValue - minValue);
  const yMin = Math.max(0, minValue - valueRange * 0.12);
  const yMax = maxValue + valueRange * 0.12;

  const xFor = (index) => {
    if (chartSolves.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (chartSolves.length - 1)) * plotWidth;
  };
  const yFor = (value) => padding.top + ((yMax - value) / Math.max(1, yMax - yMin)) * plotHeight;

  drawChartGrid(context, width, height, padding, yMin, yMax);

  const lineGradient = context.createLinearGradient(padding.left, 0, width - padding.right, 0);
  lineGradient.addColorStop(0, '#00adb5');
  lineGradient.addColorStop(1, '#8dffbe');
  const fillGradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  fillGradient.addColorStop(0, 'rgba(0, 173, 181, 0.18)');
  fillGradient.addColorStop(1, 'rgba(0, 173, 181, 0)');

  context.beginPath();
  points.forEach((point, index) => {
    const x = xFor(point.index);
    const y = yFor(point.value);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.lineTo(xFor(points.at(-1).index), height - padding.bottom);
  context.lineTo(xFor(points[0].index), height - padding.bottom);
  context.closePath();
  context.fillStyle = fillGradient;
  context.fill();

  context.lineWidth = 2.4;
  context.strokeStyle = lineGradient;
  context.beginPath();
  points.forEach((point, index) => {
    const x = xFor(point.index);
    const y = yFor(point.value);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  for (const point of points) {
    const x = xFor(point.index);
    const y = yFor(point.value);
    context.beginPath();
    context.fillStyle = point.solve.penalty === '+2' ? '#ffcc66' : '#00d6de';
    context.arc(x, y, 3.4, 0, Math.PI * 2);
    context.fill();
  }

  const dnfCount = chartSolves.filter((solve) => solve.penalty === 'dnf').length;
  const latestPoint = points.at(-1);
  const bestValue = statsChartMode === 'tps' ? Math.max(...values) : Math.min(...values);
  elements.statsChartMeta.textContent = `${chartLabel} ${chartSolves.length} 把 · ${modeLabel} 有效 ${points.length} · 最佳 ${statsChartValueText(bestValue)} · 当前 ${statsChartValueText(latestPoint.value)} · DNF ${dnfCount}`;
}

function renderStatsDistributionChart(sessionSolves, chartLabel = '当前会话') {
  const canvas = elements.statsDistributionChart;
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const values = sessionSolves
    .map((solve) => effectiveDurationMs(solve))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const dnfCount = sessionSolves.filter((solve) => solve.penalty === 'dnf').length;
  if (values.length < 2) {
    drawEmptyTrendChart(context, width, height, '分布');
    if (elements.statsDistributionMeta) {
      elements.statsDistributionMeta.textContent = `${chartLabel} · 有效 ${values.length} · 至少 2 个有效成绩后显示分布`;
    }
    return;
  }

  const minValue = values[0];
  const maxValue = values.at(-1);
  const median = percentileValue(values, 0.5);
  const bucketCount = Math.min(10, Math.max(4, Math.round(Math.sqrt(values.length))));
  const range = Math.max(1, maxValue - minValue);
  const step = Math.max(1, Math.ceil(range / bucketCount));
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: minValue + index * step,
    end: index === bucketCount - 1 ? maxValue + 1 : minValue + (index + 1) * step,
    count: 0,
  }));
  for (const value of values) {
    const index = Math.min(bucketCount - 1, Math.floor((value - minValue) / step));
    buckets[index].count += 1;
  }

  const padding = { top: 18, right: 16, bottom: 32, left: 42 };
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const gap = Math.min(8, Math.max(3, plotWidth / bucketCount * 0.12));
  const barWidth = Math.max(4, plotWidth / bucketCount - gap);

  drawDistributionGrid(context, width, height, padding, maxCount);
  const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, 'rgba(0, 214, 222, 0.9)');
  gradient.addColorStop(1, 'rgba(0, 173, 181, 0.22)');

  buckets.forEach((bucket, index) => {
    const barHeight = (bucket.count / maxCount) * plotHeight;
    const x = padding.left + index * (plotWidth / bucketCount) + gap / 2;
    const y = height - padding.bottom - barHeight;
    context.fillStyle = gradient;
    roundedCanvasRect(context, x, y, barWidth, barHeight, 5);
    context.fill();

    if (bucket.count > 0) {
      context.fillStyle = 'rgba(245, 245, 247, 0.78)';
      context.font = '11px Inter, system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillText(String(bucket.count), x + barWidth / 2, Math.max(padding.top + 10, y - 4));
    }
  });

  const markerX = padding.left + Math.min(1, Math.max(0, (median - minValue) / range)) * plotWidth;
  context.strokeStyle = 'rgba(141, 255, 190, 0.85)';
  context.lineWidth = 1.4;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(markerX, padding.top);
  context.lineTo(markerX, height - padding.bottom + 4);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = 'rgba(141, 255, 190, 0.9)';
  context.font = '11px Inter, system-ui, sans-serif';
  context.textAlign = markerX > width - 70 ? 'right' : 'left';
  context.textBaseline = 'top';
  context.fillText(`中位 ${formatTime(median)}`, markerX + (markerX > width - 70 ? -6 : 6), padding.top + 3);

  context.fillStyle = 'rgba(245, 245, 247, 0.55)';
  context.font = '11px Inter, system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillText(formatTime(minValue), padding.left, height - padding.bottom + 10);
  context.textAlign = 'right';
  context.fillText(formatTime(maxValue), width - padding.right, height - padding.bottom + 10);

  const denseBucket = buckets.reduce((best, bucket) => (bucket.count > best.count ? bucket : best), buckets[0]);
  if (elements.statsDistributionMeta) {
    elements.statsDistributionMeta.textContent = `${chartLabel} · 有效 ${values.length} · DNF ${dnfCount} · 集中 ${formatTime(denseBucket.start)}-${formatTime(Math.max(denseBucket.start, denseBucket.end - 1))}`;
  }
}

function renderStatsChartModeControls() {
  elements.statsChartModeButtons.forEach((button) => {
    const active = button.dataset.statsChartMode === statsChartMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function statsChartValueAt(sessionSolves, index, mode) {
  const solve = sessionSolves[index];
  if (!solve) return null;
  if (mode === 'mo3') return rollingMeanAt(sessionSolves, index, 3);
  if (mode === 'ao5') return rollingAverageAt(sessionSolves, index, 5);
  if (mode === 'ao12') return rollingAverageAt(sessionSolves, index, 12);
  if (mode === 'ao50') return rollingAverageAt(sessionSolves, index, 50);
  if (mode === 'ao100') return rollingAverageAt(sessionSolves, index, 100);
  if (mode === 'tps') return Number.isFinite(solve.bluetoothTps) ? solve.bluetoothTps : null;
  return effectiveDurationMs(solve);
}

function statsChartValueText(value) {
  if (!Number.isFinite(value)) return '-';
  return statsChartMode === 'tps' ? value.toFixed(2) : formatTime(value);
}

function drawChartGrid(context, width, height, padding, yMin, yMax) {
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(255, 255, 255, 0.11)';
  context.strokeRect(padding.left, padding.top, width - padding.left - padding.right, height - padding.top - padding.bottom);

  context.fillStyle = 'rgba(245, 245, 247, 0.55)';
  context.font = '12px Inter, system-ui, sans-serif';
  context.textAlign = 'right';
  context.textBaseline = 'middle';

  for (let line = 0; line <= 3; line += 1) {
    const ratio = line / 3;
    const y = padding.top + ratio * (height - padding.top - padding.bottom);
    const value = yMax - ratio * (yMax - yMin);
    context.strokeStyle = line === 3 ? 'rgba(255, 255, 255, 0.11)' : 'rgba(255, 255, 255, 0.06)';
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(statsChartValueText(value), padding.left - 8, y);
  }
}

function drawEmptyTrendChart(context, width, height, modeLabel = '') {
  context.strokeStyle = 'rgba(255, 255, 255, 0.11)';
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
  context.fillStyle = 'rgba(245, 245, 247, 0.55)';
  context.font = '14px Inter, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`${modeLabel || '趋势'}暂无有效数据`, width / 2, height / 2);
}

function drawDistributionGrid(context, width, height, padding, maxCount) {
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(255, 255, 255, 0.11)';
  context.strokeRect(padding.left, padding.top, width - padding.left - padding.right, height - padding.top - padding.bottom);
  context.fillStyle = 'rgba(245, 245, 247, 0.55)';
  context.font = '11px Inter, system-ui, sans-serif';
  context.textAlign = 'right';
  context.textBaseline = 'middle';

  for (let line = 0; line <= 2; line += 1) {
    const ratio = line / 2;
    const y = padding.top + ratio * (height - padding.top - padding.bottom);
    const value = Math.round(maxCount * (1 - ratio));
    context.strokeStyle = line === 2 ? 'rgba(255, 255, 255, 0.11)' : 'rgba(255, 255, 255, 0.06)';
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(String(value), padding.left - 8, y);
  }
}

function roundedCanvasRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function percentileValue(values, percentile) {
  if (values.length === 0) return null;
  const index = (values.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

function renderExportDialog() {
  if (!elements.exportDialog.open) return;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const sessionCount = filteredSolves().length;
  elements.exportDialogMeta.textContent = `${currentSession?.name || currentSessionId} · 当前会话 ${sessionCount} 条 · 选中 ${selectedSolveIds.size} 条 · 全部 ${solves.length} 条`;
  elements.exportSessionJsonButton.disabled = sessionCount === 0;
  elements.exportSessionCsvButton.disabled = sessionCount === 0;
  elements.exportSessionCstimerButton.disabled = sessionCount === 0;
  elements.exportSessionCstimerJsonButton.disabled = sessionCount === 0;
  elements.exportSelectedJsonButton.disabled = selectedSolveIds.size === 0;
  elements.exportSelectedCsvButton.disabled = selectedSolveIds.size === 0;
  elements.exportSelectedCstimerButton.disabled = selectedSolveIds.size === 0;
  elements.exportSelectedCstimerJsonButton.disabled = selectedSolveIds.size === 0;
  elements.exportAllJsonButton.disabled = solves.length === 0;
  elements.exportAllCsvButton.disabled = solves.length === 0;
  elements.exportAllCstimerButton.disabled = solves.length === 0;
  elements.exportAllCstimerJsonButton.disabled = solves.length === 0;
}

function renderImportDialog() {
  if (!elements.importDialog.open || !pendingImportPreview) return;
  const { fileName, parsed } = pendingImportPreview;
  const incomingSolves = Array.isArray(parsed.solves) ? parsed.solves : [];
  const incomingSessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const duplicateInfo = importDuplicateInfo(incomingSolves);
  const source = importSourceLabel(parsed.source);

  elements.importDialogMeta.textContent = `${source} · ${incomingSolves.length} 条成绩`;
  elements.importPreviewList.replaceChildren(
    importPreviewItem('文件', fileName),
    importPreviewItem('格式', source),
    importPreviewItem('待导入成绩', `${incomingSolves.length} 条`),
    importPreviewItem('待导入会话', `${incomingSessions.length} 个`),
    importPreviewItem('当前数据', `${solves.length} 条成绩 · ${sessions.length} 个会话`),
    importPreviewItem('与当前重复 ID', duplicateInfo.conflicts > 0 ? `${duplicateInfo.conflicts} 条，将自动改名` : '无'),
    importPreviewItem('文件内重复 ID', duplicateInfo.duplicates > 0 ? `${duplicateInfo.duplicates} 个，将自动改名` : '无'),
    importPreviewItem('缺少 ID', duplicateInfo.missing > 0 ? `${duplicateInfo.missing} 条，将自动生成` : '无'),
  );
  elements.appendImportButton.disabled = incomingSolves.length === 0;
  elements.replaceImportButton.disabled = incomingSolves.length === 0;
  elements.replaceImportButton.textContent = `替换全部 ${solves.length} 条`;
}

function importPreviewItem(label, value) {
  const item = document.createElement('div');
  const labelNode = document.createElement('span');
  const valueNode = document.createElement('strong');
  labelNode.textContent = label;
  valueNode.textContent = value;
  item.replaceChildren(labelNode, valueNode);
  return item;
}

function importDuplicateInfo(incomingSolves) {
  const existingIds = new Set(solves.map((solve) => solve.id).filter(Boolean));
  const seen = new Set();
  const duplicates = new Set();
  let conflicts = 0;
  let missing = 0;

  for (const solve of incomingSolves) {
    const id = typeof solve.id === 'string' ? solve.id : '';
    if (!id) {
      missing += 1;
      continue;
    }
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
    if (existingIds.has(id)) conflicts += 1;
  }

  return { conflicts, duplicates: duplicates.size, missing };
}

function importSourceLabel(source) {
  if (source === 'cstimer-csv') return 'csTimer CSV';
  if (source === 'cstimer-json') return 'csTimer JSON';
  if (source === 'csv') return 'TrainTimer CSV';
  if (source === 'json') return 'TrainTimer JSON';
  return '未知格式';
}

function renderMarkPenaltyDialog() {
  if (!elements.markPenaltyDialog.open) return;
  const selectedSolves = solves.filter((solve) => selectedSolveIds.has(solve.id));
  elements.markPenaltyMeta.textContent = `选中 ${selectedSolveIds.size} 条`;
  const penalties = new Set(selectedSolves.map((solve) => solve.penalty));
  if (penalties.size === 1) elements.markPenaltySelect.value = selectedSolves[0]?.penalty || 'ok';
  elements.confirmMarkPenaltyButton.disabled = selectedSolveIds.size === 0;
}

function renderPuzzleSolvesDialog() {
  if (!elements.puzzleSolvesDialog.open) return;
  const selectedSolves = solves.filter((solve) => selectedSolveIds.has(solve.id));
  const puzzles = new Set(selectedSolves.map((solve) => solve.scramblePuzzle || 'three'));
  if (puzzles.size === 1) elements.puzzleSolvesSelect.value = selectedSolves[0]?.scramblePuzzle || 'three';
  const sharedLabel = puzzles.size === 1 ? puzzleLabel(selectedSolves[0]?.scramblePuzzle || 'three') : '';
  elements.puzzleSolvesMeta.textContent = sharedLabel
    ? `选中 ${selectedSolveIds.size} 条 · 当前 ${sharedLabel}`
    : `选中 ${selectedSolveIds.size} 条 · 请选择新的打乱类型`;
  elements.confirmPuzzleButton.disabled = selectedSolveIds.size === 0;
}

function renderTagSolvesDialog() {
  if (!elements.tagSolvesDialog.open) return;
  const selectedSolves = solves.filter((solve) => selectedSolveIds.has(solve.id));
  const tagSets = selectedSolves.map((solve) => formatTags(solve.tags));
  const sharedTags = tagSets.length > 0 && tagSets.every((value) => value === tagSets[0]) ? tagSets[0] : '';
  elements.tagSolvesMeta.textContent = sharedTags
    ? `选中 ${selectedSolveIds.size} 条 · 当前 ${sharedTags}`
    : `选中 ${selectedSolveIds.size} 条 · 输入新标签，留空可清除`;
  elements.tagSolvesInput.value = sharedTags;
  elements.confirmTagButton.disabled = selectedSolveIds.size === 0;
}

function renderCommentSolvesDialog() {
  if (!elements.commentSolvesDialog.open) return;
  const selectedSolves = solves.filter((solve) => selectedSolveIds.has(solve.id));
  const comments = selectedSolves.map((solve) => solve.comment || '');
  const sharedComment = comments.length > 0 && comments.every((value) => value === comments[0]) ? comments[0] : '';
  elements.commentSolvesMeta.textContent = sharedComment
    ? `选中 ${selectedSolveIds.size} 条 · 当前备注相同`
    : `选中 ${selectedSolveIds.size} 条 · 输入新备注，留空可清除`;
  elements.commentSolvesInput.value = sharedComment;
  elements.confirmCommentButton.disabled = selectedSolveIds.size === 0;
}

function renderMoveSolvesDialog() {
  if (!elements.moveSolvesDialog.open) return;
  const selectedSolves = solves.filter((solve) => selectedSolveIds.has(solve.id));
  const selectedSessionIds = new Set(selectedSolves.map((solve) => solve.sessionId || 'default'));
  const sourceLabel = selectedSessionIds.size === 1
    ? sessionNameForId([...selectedSessionIds][0])
    : `${selectedSessionIds.size} 个会话`;
  const targetSessions = sessions.filter((session) => !selectedSolves.every((solve) => (solve.sessionId || 'default') === session.id));
  elements.moveSolvesMeta.textContent = targetSessions.length === 0
    ? '请先新建另一个会话'
    : `${sourceLabel} · 选中 ${selectedSolveIds.size} 条`;
  elements.moveSessionSelect.replaceChildren(
    ...targetSessions.map((session) => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = session.name;
      return option;
    }),
  );
  elements.moveSessionSelect.disabled = targetSessions.length === 0;
  elements.confirmMoveButton.disabled = selectedSolveIds.size === 0 || targetSessions.length === 0;
}

function renderMergeSessionDialog() {
  if (!elements.mergeSessionDialog.open) return;
  const current = sessions.find((session) => session.id === currentSessionId);
  const targetSessions = sessions.filter((session) => session.id !== currentSessionId);
  const sourceCount = current ? solvesForSession(current.id).length : 0;
  elements.mergeSessionMeta.textContent = !current || current.id === 'default'
    ? '默认会话不可作为合并源'
    : `${current.name} · ${sourceCount} 条成绩 · 合并后源会话会删除`;
  elements.mergeSessionSelect.replaceChildren(
    ...targetSessions.map((session) => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = `${session.name} (${solvesForSession(session.id).length} 条)`;
      return option;
    }),
  );
  const canMerge = Boolean(current && current.id !== 'default' && targetSessions.length > 0);
  elements.mergeSessionSelect.disabled = !canMerge;
  elements.confirmMergeSessionButton.disabled = !canMerge;
}

function openManualEntryDialog() {
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  elements.manualEntryMeta.textContent = currentSession?.name || currentSessionId;
  elements.manualTimeInput.value = '';
  elements.manualPenaltySelect.value = 'ok';
  elements.manualDateInput.value = dateTimeLocalValue(new Date());
  elements.manualScrambleInput.value = scramble?.scramble || '';
  elements.manualCommentInput.value = '';
  elements.manualTagsInput.value = '';
  elements.manualEntryError.textContent = '';
  elements.saveManualEntryButton.disabled = false;
  if (!elements.manualEntryDialog.open) elements.manualEntryDialog.showModal();
  elements.manualTimeInput.focus();
}

async function saveManualEntry() {
  let durationMs;
  let createdAt;
  try {
    durationMs = parseTimeInput(elements.manualTimeInput.value);
    createdAt = parseDateTimeLocalInput(elements.manualDateInput.value);
  } catch (error) {
    elements.manualEntryError.textContent = error.message;
    if (durationMs == null) elements.manualTimeInput.focus();
    else elements.manualDateInput.focus();
    return;
  }

  const scrambleText = elements.manualScrambleInput.value.trim();
  const scrambleSource = scrambleText && scrambleText === scramble?.scramble
    ? scramble.source
    : 'manual';

  elements.saveManualEntryButton.disabled = true;
  elements.manualEntryError.textContent = '';

  try {
    const data = await postJson('/api/solves', {
      durationMs,
      createdAt,
      scramble: scrambleText,
      scrambleSource,
      scramblePuzzle: scramble?.puzzle || scramblePuzzle,
      inspectionEnabled: false,
      sessionId: currentSessionId,
      penalty: elements.manualPenaltySelect.value,
      comment: elements.manualCommentInput.value,
      tags: parseTagsInput(elements.manualTagsInput.value),
    });

    solves = data.solves;
    if (data.sessions) sessions = data.sessions;
    selectedSolveIds.clear();
    elements.manualEntryDialog.close();
    render();
    showPbToastForSolve(data.solve);
  } catch (error) {
    elements.manualEntryError.textContent = `保存失败：${error.message}`;
  } finally {
    elements.saveManualEntryButton.disabled = false;
  }
}

function renderHistory() {
  const sessionSolves = filteredSolves();
  const listed = listedHistoryEntries(sessionSolves).slice(0, compactHistoryLimit);
  renderHistoryControls();
  elements.historyRows.replaceChildren(
    ...listed.map((entry) => renderSolveRow(entry.solve, entry.index + 1, sessionSolves, {
      compact: true,
      metrics: solveRowMetrics(sessionSolves, entry.index, entry),
    })),
  );
  requestAnimationFrame(updateHistoryRowsMask);
}

function updateHistoryRowsMask() {
  const rows = elements.historyRows;
  if (!rows) return;
  const maxScrollTop = Math.max(0, rows.scrollHeight - rows.clientHeight);
  const remaining = Math.max(0, maxScrollTop - rows.scrollTop);
  const rawProgress = maxScrollTop <= 1
    ? 1
    : Math.max(0, Math.min(1, 1 - remaining / historyBottomFadeRangePx));
  const progress = 1 - (1 - rawProgress) ** 2;
  rows.style.setProperty('--history-mask-solid', `${(58 + progress * 30).toFixed(1)}%`);
  rows.style.setProperty('--history-mask-soft', `${(78 + progress * 18).toFixed(1)}%`);
  rows.style.setProperty('--history-mask-soft-alpha', (0.34 + progress * 0.66).toFixed(3));
  rows.style.setProperty('--history-mask-end-alpha', progress.toFixed(3));
}

function listedHistoryEntries(sessionSolves) {
  const entries = sessionSolves.map((solve, index) => ({
    solve,
    index,
    single: effectiveDurationMs(solve),
    tps: Number.isFinite(solve.bluetoothTps) ? solve.bluetoothTps : null,
    ao5: rollingAverageAt(sessionSolves, index, 5),
    ao12: rollingAverageAt(sessionSolves, index, 12),
  }));
  if (!historySortKey || !historySortDirection) return entries.slice(-compactHistoryLimit).reverse();
  const direction = historySortDirection === 'desc' ? -1 : 1;
  return entries.sort((left, right) => {
    const leftValue = left[historySortKey];
    const rightValue = right[historySortKey];
    const leftMissing = leftValue == null;
    const rightMissing = rightValue == null;
    if (leftMissing && !rightMissing) return 1;
    if (!leftMissing && rightMissing) return -1;
    if (!leftMissing && !rightMissing && leftValue !== rightValue) {
      const keyDirection = historySortKey === 'tps' ? -direction : direction;
      return (leftValue - rightValue) * keyDirection;
    }
    return right.index - left.index;
  });
}

function cycleHistorySort(key) {
  if (!['single', 'tps', 'ao5', 'ao12'].includes(key)) return;
  if (historySortKey !== key) {
    historySortKey = key;
    historySortDirection = 'asc';
  } else if (historySortDirection === 'asc') {
    historySortDirection = 'desc';
  } else {
    historySortKey = '';
    historySortDirection = '';
  }
  localStorage.setItem('trainTimer.historySortKey', historySortKey);
  localStorage.setItem('trainTimer.historySortDirection', historySortDirection);
  renderHistory();
}

function renderAllSolvesDialog() {
  if (!elements.allSolvesDialog.open) return;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  elements.allSessionsToggle.checked = allSessionsEnabled;
  const baseSolves = allSolvesBaseSolves();
  renderAllSolvesTagFilter(baseSolves);
  const listedSolves = filteredAllSolves();
  const visibleLimit = Math.min(allSolvesVisibleLimit, listedSolves.length);
  const visibleSolves = listedSolves.slice(0, visibleLimit);
  const rowContext = solveRowRenderContext(visibleSolves);
  const scopeLabel = allSessionsEnabled ? `全部会话 · ${sessions.length} 个会话` : (currentSession?.name || currentSessionId);
  const renderProgress = listedSolves.length > visibleLimit ? ` · 已显示 ${visibleLimit}` : '';
  elements.allSolvesMeta.textContent = allSolvesFilterActive()
    ? `${scopeLabel} · 筛选 ${listedSolves.length} / ${baseSolves.length} 条${renderProgress}`
    : `${scopeLabel} · ${baseSolves.length} 条${renderProgress}`;
  elements.allSolvesRows.replaceChildren(
    ...visibleSolves.map((solve) => {
      const rowData = rowContext.get(solve.id);
      const solveSessionSolves = rowData?.sessionSolves || solvesForSession(solve.sessionId);
      const solveNumber = rowData ? rowData.index + 1 : solveSessionSolves.indexOf(solve) + 1;
      return renderSolveRow(solve, solveNumber, solveSessionSolves, {
        showSession: allSessionsEnabled,
        metrics: rowData?.metrics,
      });
    }),
  );
  if (listedSolves.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = allSolvesFilterActive() ? '没有匹配的成绩' : (allSessionsEnabled ? '暂无成绩' : '当前会话暂无成绩');
    elements.allSolvesRows.append(empty);
  } else if (visibleLimit < listedSolves.length) {
    elements.allSolvesRows.append(renderAllSolvesLoadMore(visibleLimit, listedSolves.length));
  }
  renderAllSolvesControls();
}

function solveRowRenderContext(rows) {
  const sessionIds = [...new Set(rows.map((solve) => solve.sessionId || 'default'))];
  const rowIds = new Set(rows.map((solve) => solve.id));
  const context = new Map();
  for (const sessionId of sessionIds) {
    const sessionSolves = solvesForSession(sessionId);
    sessionSolves.forEach((solve, index) => {
      if (rowIds.has(solve.id)) {
        context.set(solve.id, {
          sessionSolves,
          index,
          metrics: solveRowMetrics(sessionSolves, index),
        });
      }
    });
  }
  return context;
}

function renderAllSolvesLoadMore(visibleCount, totalCount) {
  const row = document.createElement('div');
  row.className = 'history-load-more';
  row.innerHTML = `
    <button type="button" data-load-more-solves="1">
      显示更多
      <span>${visibleCount} / ${totalCount}</span>
    </button>
  `;
  return row;
}

function renderAllSolvesTagFilter(baseSolves) {
  const currentValue = allSolvesTagFilter();
  const tagOptions = [...new Set(baseSolves.flatMap((solve) => (
    Array.isArray(solve.tags) ? solve.tags : []
  )).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' }));

  const optionFor = (value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  };

  elements.allSolvesTagFilter.replaceChildren(
    optionFor('all', '全部'),
    optionFor(untaggedFilterValue, '无标签'),
    ...tagOptions.map((tag) => optionFor(tag, tag)),
  );

  elements.allSolvesTagFilter.value = currentValue === untaggedFilterValue || tagOptions.includes(currentValue)
    ? currentValue
    : 'all';
}

function solveRowMetrics(sessionSolves, solveIndex, seed = {}) {
  return {
    ao5: Object.hasOwn(seed, 'ao5') ? seed.ao5 : rollingAverageAt(sessionSolves, solveIndex, 5),
    ao12: Object.hasOwn(seed, 'ao12') ? seed.ao12 : rollingAverageAt(sessionSolves, solveIndex, 12),
    recordMarks: Object.hasOwn(seed, 'recordMarks') ? seed.recordMarks : recordMarksAt(sessionSolves, solveIndex),
  };
}

function renderSolveRow(solve, solveNumber, sessionSolves, options = {}) {
  const solveIndex = Math.max(0, solveNumber - 1);
  const metrics = options.metrics || solveRowMetrics(sessionSolves, solveIndex);
  const ao5 = metrics.ao5;
  const ao12 = metrics.ao12;
  const recordMarks = metrics.recordMarks || [];
  const singleMarks = recordMarks.filter((mark) => mark.type === 'single').slice(0, 1);
  const ao5Marks = recordMarks.filter((mark) => mark.type === 'ao5').slice(0, 1);
  const ao12Marks = recordMarks.filter((mark) => mark.type === 'ao12').slice(0, 1);
  const recordTitle = formatRecordTitle(recordMarks);
  const row = document.createElement('div');
  row.className = recordMarks.length > 0 ? 'history-row has-record' : 'history-row';
  if (options.compact) row.classList.add('compact-history-row');
  const sessionLabel = options.showSession ? sessionNameForSolve(solve) : '';
  const createdAtText = new Date(solve.createdAt).toLocaleString();
  const metadataText = solveRowMetadataText(solve);
  const rowTitle = [recordTitle, sessionLabel, createdAtText, metadataText].filter(Boolean).join(' · ');
  if (rowTitle) row.title = rowTitle;
  row.innerHTML = options.compact ? `
        <span>${solveNumber}</span>
        <span class="time" title="${escapeHtml([solve.duration, formatRecordTitle(singleMarks)].filter(Boolean).join(' · '))}">
          <span>${displaySolveTime(solve)}</span>
          ${renderRecordBadges(singleMarks)}
        </span>
        <span class="row-tps" title="${escapeHtml(solveTpsTitle(solve))}">${escapeHtml(solveTpsText(solve))}</span>
        <span class="rolling-average" title="${escapeHtml(['第 ' + solveNumber + ' 条后的 ao5', formatRecordTitle(ao5Marks)].filter(Boolean).join(' · '))}">
          ${renderAverageButton(solve.id, solveNumber, 5, ao5, ao5Marks)}
        </span>
        <span class="rolling-average" title="${escapeHtml(['第 ' + solveNumber + ' 条后的 ao12', formatRecordTitle(ao12Marks)].filter(Boolean).join(' · '))}">
          ${renderAverageButton(solve.id, solveNumber, 12, ao12, ao12Marks)}
        </span>
        <span class="row-actions">
          <button class="icon-more-button" data-detail-id="${solve.id}" type="button" aria-label="查看第 ${solveNumber} 条详情" title="详情">
            <span aria-hidden="true">•••</span>
          </button>
          ${renderDeleteSolveButton(solve.id, `删除第 ${solveNumber} 条成绩`)}
        </span>
      ` : `
        <span><input class="solve-check" data-id="${solve.id}" type="checkbox" ${selectedSolveIds.has(solve.id) ? 'checked' : ''} aria-label="选择第 ${solveNumber} 条成绩" /></span>
        <span>${solveNumber}</span>
        <span class="time" title="${escapeHtml([solve.duration, formatRecordTitle(singleMarks)].filter(Boolean).join(' · '))}">
          <span>${displaySolveTime(solve)}</span>
          ${renderRecordBadges(singleMarks)}
        </span>
        <span class="row-tps" title="${escapeHtml(solveTpsTitle(solve))}">${escapeHtml(solveTpsText(solve))}</span>
        <span class="rolling-average" title="${escapeHtml(['第 ' + solveNumber + ' 条后的 ao5', formatRecordTitle(ao5Marks)].filter(Boolean).join(' · '))}">
          ${renderAverageButton(solve.id, solveNumber, 5, ao5, ao5Marks)}
        </span>
        <span class="rolling-average" title="${escapeHtml(['第 ' + solveNumber + ' 条后的 ao12', formatRecordTitle(ao12Marks)].filter(Boolean).join(' · '))}">
          ${renderAverageButton(solve.id, solveNumber, 12, ao12, ao12Marks)}
        </span>
        <span>
          <select class="penalty-select" data-id="${solve.id}" aria-label="成绩罚时">
            <option value="ok" ${solve.penalty === 'ok' ? 'selected' : ''}>OK</option>
            <option value="+2" ${solve.penalty === '+2' ? 'selected' : ''}>+2</option>
            <option value="dnf" ${solve.penalty === 'dnf' ? 'selected' : ''}>DNF</option>
          </select>
        </span>
        <span class="row-actions">
          <button class="icon-more-button" data-detail-id="${solve.id}" type="button" aria-label="查看第 ${solveNumber} 条详情" title="详情">
            <span aria-hidden="true">•••</span>
          </button>
          ${renderDeleteSolveButton(solve.id, `删除第 ${solveNumber} 条成绩`)}
        </span>
      `;
  return row;
}

function renderDeleteSolveButton(solveId, label = '删除成绩') {
  return `
    <button class="icon-delete-button" data-delete-id="${escapeHtml(solveId)}" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      ${deleteIconSvg()}
    </button>
  `;
}

function deleteIconSvg() {
  return '<span aria-hidden="true">×</span>';
}

function solveRowMetadataText(solve) {
  const tags = Array.isArray(solve.tags) ? solve.tags.filter(Boolean) : [];
  const shownTags = tags.slice(0, 2).join(', ');
  const tagText = tags.length > 2 ? `${shownTags} +${tags.length - 2}` : shownTags;
  const comment = String(solve.comment || '').trim();
  return [
    puzzleLabel(solve.scramblePuzzle || 'three'),
    solve.timerSource === 'bluetooth' ? '蓝牙停表' : '',
    tagText,
    comment ? `备注 ${comment}` : '',
  ].filter(Boolean).join(' · ');
}

function solveTpsText(solve) {
  return Number.isFinite(solve.bluetoothTps) ? solve.bluetoothTps.toFixed(2) : '-';
}

function solveTpsTitle(solve) {
  if (!Number.isFinite(solve.bluetoothTps)) return '无蓝牙 TPS 数据';
  return `${solve.bluetoothMoveCount ?? 0} 手 · ${solve.bluetoothTps.toFixed(3)} TPS`;
}

function renderAverageButton(solveId, solveNumber, size, value, marks) {
  const disabled = value == null ? 'disabled' : '';
  return `
    <button class="average-detail-button" data-average-id="${escapeHtml(solveId)}" data-average-kind="average" data-average-size="${size}" type="button" ${disabled} aria-label="查看第 ${solveNumber} 条后的 ao${size} 明细">
      <span>${timeOrDash(value)}</span>
      ${renderRecordBadges(marks)}
    </button>
  `;
}

function renderRecordBadges(marks) {
  if (marks.length === 0) return '';
  const badges = marks.map((mark) => (
    `<span class="record-badge ${mark.type === 'single' ? 'single' : 'average'}">${escapeHtml(recordBadgeText(mark))}</span>`
  )).join('');
  return `<span class="record-badges" aria-label="${escapeHtml(formatRecordTitle(marks))}">${badges}</span>`;
}

function recordBadgeText(mark) {
  return mark ? 'PB' : '';
}

function formatRecordTitle(marks) {
  return marks.map((mark) => `${mark.label} ${timeOrDash(mark.value)}`).join(' · ');
}

function renderHistoryControls() {
  renderHistorySortControls();
  const canMoveSelected = selectedSolveIds.size > 0 && sessions.some((session) => session.id !== currentSessionId);
  elements.markSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.selectedStatsButton.disabled = selectedSolveIds.size === 0;
  elements.puzzleSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.tagSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.commentSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.moveSelectedButton.disabled = !canMoveSelected;
  elements.moveSelectedButton.title = sessions.some((session) => session.id !== currentSessionId)
    ? '把选中成绩移动到其他会话'
    : '请先新建另一个会话';
  elements.deleteSelectedButton.disabled = selectedSolveIds.size === 0;
  const canUndoSnapshot = Boolean(pendingImportSnapshot);
  const canUndoDelete = pendingDeletedSolves.length > 0;
  elements.undoDeleteButton.disabled = !canUndoSnapshot && !canUndoDelete;
  if (pendingImportSnapshot?.mode === 'delete-session') {
    elements.undoDeleteButton.textContent = '撤销删会话';
    elements.undoDeleteButton.title = `恢复会话：${pendingImportSnapshot.fileName || '已删除会话'}`;
  } else if (pendingImportSnapshot?.mode === 'move-solves') {
    elements.undoDeleteButton.textContent = '撤销移动';
    elements.undoDeleteButton.title = `恢复移动前的数据：${pendingImportSnapshot.fileName || '选中成绩'}`;
  } else if (pendingImportSnapshot?.mode === 'merge-session') {
    elements.undoDeleteButton.textContent = '撤销合并';
    elements.undoDeleteButton.title = `恢复合并前的数据：${pendingImportSnapshot.fileName || '会话合并'}`;
  } else if (pendingImportSnapshot?.mode === 'mark-penalty') {
    elements.undoDeleteButton.textContent = '撤销标记';
    elements.undoDeleteButton.title = `恢复标记前的数据：${pendingImportSnapshot.fileName || '选中成绩'}`;
  } else if (pendingImportSnapshot?.mode === 'puzzle-solves') {
    elements.undoDeleteButton.textContent = '撤销类型';
    elements.undoDeleteButton.title = `恢复打乱类型修改前的数据：${pendingImportSnapshot.fileName || '选中成绩'}`;
  } else if (pendingImportSnapshot?.mode === 'tag-solves') {
    elements.undoDeleteButton.textContent = '撤销标签';
    elements.undoDeleteButton.title = `恢复标签修改前的数据：${pendingImportSnapshot.fileName || '选中成绩'}`;
  } else if (pendingImportSnapshot?.mode === 'comment-solves') {
    elements.undoDeleteButton.textContent = '撤销备注';
    elements.undoDeleteButton.title = `恢复备注修改前的数据：${pendingImportSnapshot.fileName || '选中成绩'}`;
  } else if (pendingImportSnapshot?.mode === 'edit-solve') {
    elements.undoDeleteButton.textContent = '撤销编辑';
    elements.undoDeleteButton.title = `恢复编辑前的数据：${pendingImportSnapshot.fileName || '成绩详情'}`;
  } else if (canUndoSnapshot) {
    elements.undoDeleteButton.textContent = '撤销导入';
    elements.undoDeleteButton.title = `恢复导入前的数据：${pendingImportSnapshot.fileName || '导入文件'}`;
  } else {
    elements.undoDeleteButton.textContent = '撤销删除';
    elements.undoDeleteButton.title = canUndoDelete ? `恢复 ${pendingDeletedSolves.length} 条刚删除的成绩` : '没有可撤销的操作';
  }
  elements.clearAllButton.disabled = filteredSolves().length === 0;
  elements.manageSolvesButton.disabled = solves.length === 0;
  if (elements.selectAllSolves) {
    const visibleIds = visibleSolves().map((solve) => solve.id);
    elements.selectAllSolves.checked = visibleIds.length > 0 && visibleIds.every((id) => selectedSolveIds.has(id));
    elements.selectAllSolves.indeterminate = visibleIds.some((id) => selectedSolveIds.has(id)) && !elements.selectAllSolves.checked;
  }
}

function renderHistorySortControls() {
  const labels = { single: '成绩', tps: 'TPS', ao5: 'ao5', ao12: 'ao12' };
  elements.historySortButtons.forEach((button) => {
    const key = button.dataset.historySort || '';
    const active = key === historySortKey && Boolean(historySortDirection);
    button.dataset.direction = active ? historySortDirection : '';
    button.classList.toggle('active', active);
    const arrow = button.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = active ? (historySortDirection === 'asc' ? '↑' : '↓') : '';
    const label = labels[key] || key;
    button.title = active
      ? `${label}排序：${historySortDirection === 'asc' ? '从快到慢' : '从慢到快'}，点击切换`
      : `${label}排序：默认时间顺序，点击按从快到慢排序`;
    button.setAttribute('aria-label', button.title);
  });
}

function renderAllSolvesControls() {
  const sessionIds = filteredAllSolves().map((solve) => solve.id);
  renderAllSolvesDateShortcuts();
  elements.clearAllSolvesFiltersButton.disabled = !allSolvesFilterActive();
  elements.allListedStatsButton.disabled = sessionIds.length === 0;
  elements.allSelectedStatsButton.disabled = selectedSolveIds.size === 0;
  elements.allMarkSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.allPuzzleSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.allTagSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.allCommentSelectedButton.disabled = selectedSolveIds.size === 0;
  const selectedSolves = solves.filter((solve) => selectedSolveIds.has(solve.id));
  const canMoveSelected = selectedSolves.length > 0
    && sessions.some((session) => !selectedSolves.every((solve) => (solve.sessionId || 'default') === session.id));
  elements.allMoveSelectedButton.disabled = !canMoveSelected;
  elements.allDeleteSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.allCopyListButton.disabled = sessionIds.length === 0;
  elements.allExportJsonButton.disabled = sessionIds.length === 0;
  elements.allExportCsvButton.disabled = sessionIds.length === 0;
  elements.allExportCstimerButton.disabled = sessionIds.length === 0;
  elements.allExportCstimerJsonButton.disabled = sessionIds.length === 0;
  elements.selectAllSessionSolves.checked = sessionIds.length > 0 && sessionIds.every((id) => selectedSolveIds.has(id));
  elements.selectAllSessionSolves.indeterminate = sessionIds.some((id) => selectedSolveIds.has(id)) && !elements.selectAllSessionSolves.checked;
}

function renderAllSolvesDateShortcuts() {
  const activePreset = activeQuickDatePreset();
  for (const [preset, button] of [
    ['today', elements.allDateTodayButton],
    ['week', elements.allDateWeekButton],
    ['month', elements.allDateMonthButton],
    ['all', elements.allDateAllButton],
  ]) {
    button.classList.toggle('active', activePreset === preset);
    button.setAttribute('aria-pressed', activePreset === preset ? 'true' : 'false');
  }
}

function renderSelectionControls() {
  renderHistoryControls();
  if (elements.allSolvesDialog.open) renderAllSolvesControls();
  if (elements.exportDialog.open) renderExportDialog();
  if (elements.statsDialog.open) renderStatsDialog();
  if (elements.markPenaltyDialog.open) renderMarkPenaltyDialog();
  if (elements.puzzleSolvesDialog.open) renderPuzzleSolvesDialog();
  if (elements.tagSolvesDialog.open) renderTagSolvesDialog();
  if (elements.commentSolvesDialog.open) renderCommentSolvesDialog();
  if (elements.moveSolvesDialog.open) renderMoveSolvesDialog();
}

function visibleSolves() {
  return filteredSolves().slice(-3).reverse();
}

function filteredSolves() {
  return solves.filter((solve) => solve.sessionId === currentSessionId);
}

function allSolvesBaseSolves() {
  return allSessionsEnabled ? solves : filteredSolves();
}

function solvesForSession(sessionId) {
  const normalizedSessionId = sessionId || 'default';
  return solves.filter((solve) => (solve.sessionId || 'default') === normalizedSessionId);
}

function filteredAllSolves() {
  const query = allSolvesQuery();
  const recordFilter = allSolvesRecordFilter();
  const puzzleFilter = allSolvesPuzzleFilter();
  const penaltyFilter = allSolvesPenaltyFilter();
  const sourceFilter = allSolvesSourceFilter();
  const tagFilter = allSolvesTagFilter();
  const baseSolves = allSolvesBaseSolves();
  const bounds = allSolvesDateBounds();
  let listedSolves = baseSolves;
  if (bounds.from || bounds.to) listedSolves = listedSolves.filter((solve) => solveInDateBounds(solve, bounds));
  if (recordFilter !== 'all') listedSolves = listedSolves.filter((solve) => solveMatchesRecordFilter(solve, recordFilter));
  if (puzzleFilter !== 'all') listedSolves = listedSolves.filter((solve) => (solve.scramblePuzzle || 'three') === puzzleFilter);
  if (penaltyFilter !== 'all') listedSolves = listedSolves.filter((solve) => (solve.penalty || 'ok') === penaltyFilter);
  if (sourceFilter !== 'all') listedSolves = listedSolves.filter((solve) => (solve.timerSource || 'manual') === sourceFilter);
  if (tagFilter === untaggedFilterValue) listedSolves = listedSolves.filter((solve) => !Array.isArray(solve.tags) || solve.tags.length === 0);
  else if (tagFilter !== 'all') listedSolves = listedSolves.filter((solve) => Array.isArray(solve.tags) && solve.tags.includes(tagFilter));
  if (query) listedSolves = listedSolves.filter((solve) => searchableSolveText(solve).includes(query));
  return sortAllSolves(listedSolves);
}

function allSolvesQuery() {
  return elements.allSolvesSearch.value.trim().toLowerCase();
}

function allSolvesRecordFilter() {
  return elements.allSolvesRecordFilter.value || 'all';
}

function allSolvesPuzzleFilter() {
  return elements.allSolvesPuzzleFilter.value || 'all';
}

function allSolvesPenaltyFilter() {
  return elements.allSolvesPenaltyFilter.value || 'all';
}

function allSolvesSourceFilter() {
  return elements.allSolvesSourceFilter.value || 'all';
}

function allSolvesTagFilter() {
  return elements.allSolvesTagFilter.value || 'all';
}

function allSolvesFilterActive() {
  return Boolean(
    allSolvesQuery()
      || elements.allSolvesFromDate.value
      || elements.allSolvesToDate.value
      || allSolvesRecordFilter() !== 'all'
      || allSolvesPuzzleFilter() !== 'all'
      || allSolvesPenaltyFilter() !== 'all'
      || allSolvesSourceFilter() !== 'all'
      || allSolvesTagFilter() !== 'all',
  );
}

function solveMatchesRecordFilter(solve, recordFilter) {
  const recordTypes = solveRecordTypes(solve);
  if (recordFilter === 'any-record') return recordTypes.length > 0;
  return recordTypes.includes(recordFilter);
}

function solveRecordTypes(solve) {
  const sessionSolves = solvesForSession(solve.sessionId);
  const solveIndex = sessionSolves.findIndex((item) => item.id === solve.id);
  return recordMarksAt(sessionSolves, solveIndex).map((mark) => mark.type);
}

function allSolvesDateBounds() {
  const from = parseDateInput(elements.allSolvesFromDate.value);
  const to = parseDateInput(elements.allSolvesToDate.value);
  return {
    from: from ? from.getTime() : null,
    to: to ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime() : null,
  };
}

function quickDateRange(preset) {
  if (preset === 'all') return { from: '', to: '' };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today') {
    const value = dateInputValue(today);
    return { from: value, to: value };
  }

  if (preset === 'week') {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(today);
    start.setDate(today.getDate() + mondayOffset);
    return { from: dateInputValue(start), to: dateInputValue(today) };
  }

  if (preset === 'month') {
    return {
      from: dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: dateInputValue(today),
    };
  }

  return { from: elements.allSolvesFromDate.value, to: elements.allSolvesToDate.value };
}

function activeQuickDatePreset() {
  const current = currentAllSolvesDateRange();
  if (sameDateRange(current, quickDateRange(allSolvesDatePreset))) return allSolvesDatePreset;
  return inferredQuickDatePreset();
}

function inferredQuickDatePreset() {
  const current = currentAllSolvesDateRange();
  for (const preset of ['today', 'week', 'month', 'all']) {
    if (sameDateRange(current, quickDateRange(preset))) return preset;
  }
  return '';
}

function currentAllSolvesDateRange() {
  return {
    from: elements.allSolvesFromDate.value,
    to: elements.allSolvesToDate.value,
  };
}

function sameDateRange(left, right) {
  return left.from === right.from && left.to === right.to;
}

function parseDateInput(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

function dateInputValue(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateTimeLocalValue(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join('T');
}

function parseDateTimeLocalInput(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error('请输入有效的复原时间');
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] == null ? 0 : Number(match[6]);
  const date = new Date(year, month, day, hour, minute, second);
  const isSameDateTime = date.getFullYear() === year
    && date.getMonth() === month
    && date.getDate() === day
    && date.getHours() === hour
    && date.getMinutes() === minute
    && date.getSeconds() === second;
  if (!isSameDateTime) throw new Error('请输入有效的复原时间');
  return date.toISOString();
}

function solveInDateBounds(solve, bounds) {
  const timestamp = new Date(solve.createdAt || 0).getTime();
  if (!Number.isFinite(timestamp)) return false;
  if (bounds.from != null && timestamp < bounds.from) return false;
  if (bounds.to != null && timestamp >= bounds.to) return false;
  return true;
}

function searchableSolveText(solve) {
  return [
    displaySolveTime(solve),
    solve.duration,
    solve.effectiveDuration,
    solve.penalty,
    solve.timerSource,
    Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves.join(' ') : '',
    solve.bluetoothMoveCount,
    solve.bluetoothTps,
    solve.bluetoothDeviceName,
    formatList(solve.bluetoothProtocols),
    formatList(solve.bluetoothSources),
    sessionNameForSolve(solve),
    formatTags(solve.tags),
    solve.comment,
    solve.scramble,
    solve.scrambleSource,
    solve.scramblePuzzle,
    puzzleLabel(solve.scramblePuzzle || 'three'),
    new Date(solve.createdAt).toLocaleString(),
  ].join(' ').toLowerCase();
}

function sessionNameForSolve(solve) {
  return sessionNameForId(solve.sessionId || 'default');
}

function sessionNameForId(sessionId) {
  const session = sessions.find((item) => item.id === sessionId);
  return session?.name || sessionId || 'default';
}

function parseTagsInput(value) {
  const seen = new Set();
  const tags = [];
  for (const tag of String(value || '').split(/[;,，；]/)) {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
  }
  return tags;
}

function formatTags(tags) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

function formatList(values) {
  return Array.isArray(values) ? values.filter(Boolean).join(', ') : '';
}

function sameStringArray(left, right) {
  const leftItems = Array.isArray(left) ? left : [];
  const rightItems = Array.isArray(right) ? right : [];
  return leftItems.length === rightItems.length && leftItems.every((item, index) => item === rightItems[index]);
}

function sortAllSolves(inputSolves) {
  const sortBy = elements.allSolvesSortBy.value;
  const direction = elements.allSolvesSortDirection.value === 'asc' ? 1 : -1;
  return [...inputSolves].sort((left, right) => {
    const result = compareSortValues(sortValue(left, sortBy), sortValue(right, sortBy));
    if (result !== 0) return result * direction;
    return (new Date(left.createdAt || 0) - new Date(right.createdAt || 0)) * -1;
  });
}

function sortValue(solve, sortBy) {
  if (sortBy === 'duration') return effectiveDurationMs(solve) ?? Number.POSITIVE_INFINITY;
  if (sortBy === 'penalty') return { ok: 0, '+2': 1, dnf: 2 }[solve.penalty] ?? 0;
  if (sortBy === 'puzzle') return puzzleLabel(solve.scramblePuzzle || 'three');
  if (sortBy === 'source') return solve.timerSource === 'bluetooth' ? '蓝牙' : '手动';
  if (sortBy === 'session') return sessionNameForSolve(solve);
  if (sortBy === 'tags') return formatTags(solve.tags);
  if (sortBy === 'comment') return solve.comment || '';
  return new Date(solve.createdAt || 0).getTime();
}

function compareSortValues(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'zh-CN', { numeric: true, sensitivity: 'base' });
}

function latestSessionSolve() {
  return filteredSolves().at(-1) || null;
}

function downloadTextFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = safeExportFilename(filename.replace(/\.[^.]+$/, '')) + filename.slice(filename.lastIndexOf('.'));
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function stageDeletedSolves(deletedSolves) {
  pendingDeletedSolves = deletedSolves.map((solve) => ({ ...solve }));
  pendingImportSnapshot = null;
}

function createHistorySnapshot(mode, fileName) {
  return {
    solves: solves.map(cloneHistoryItem),
    sessions: sessions.map(cloneHistoryItem),
    currentSessionId,
    mode,
    fileName,
  };
}

function cloneHistoryItem(item) {
  return JSON.parse(JSON.stringify(item));
}

function renderPreviewLoading() {
  elements.cubeNet.className = 'cube-net preview-loading';
  elements.cubeNet.textContent = '预览加载中';
}

function renderTnoodleCubeSvg(svgText) {
  const documentFragment = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = documentFragment.querySelector('svg');
  if (!svg || documentFragment.querySelector('parsererror')) {
    renderLocalScramblePreview(scramble?.scramble || '', scramble?.puzzle || scramblePuzzle);
    return;
  }

  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'TNoodle 打乱结果预览');
  svg.classList.add('cube-svg');
  softenTnoodleCubeSvg(svg);
  elements.cubeNet.className = 'cube-net official-preview';
  elements.cubeNet.replaceChildren(document.importNode(svg, true));
}

function softenTnoodleCubeSvg(svg) {
  svg.querySelectorAll('rect').forEach((rect) => {
    rect.setAttribute('fill', previewStickerColor(rect.getAttribute('fill')));
    rect.setAttribute('stroke', 'none');
    rect.setAttribute('fill-opacity', '0.82');
    rect.setAttribute('rx', '0.7');
    rect.setAttribute('ry', '0.7');
  });
}

function previewStickerColor(color) {
  return previewStickerColors.get(String(color || '').toLowerCase()) || color || '#8e8e93';
}

function renderLocalScramblePreview(scrambleText, puzzle = 'three') {
  if (puzzle !== 'three') {
    renderPreviewUnavailable(`${puzzleLabel(puzzle)} 预览需要 TNoodle draw`);
    return;
  }

  try {
    renderCubeNet(scrambleText);
  } catch {
    renderPreviewUnavailable('当前打乱无法用本地 3x3 预览解析');
  }
}

function renderPreviewUnavailable(message) {
  elements.cubeNet.className = 'cube-net preview-loading';
  elements.cubeNet.textContent = message;
}

function renderCubeNet(scrambleText) {
  const faces = cubeStateFromScramble(scrambleText);
  renderCubeFacesNet(elements.cubeNet, faces, 'cube-net');
}

function renderCubeFacesNet(container, faces, baseClass) {
  const fragment = document.createDocumentFragment();

  container.className = `${baseClass} sticker-preview`;
  container.replaceChildren();

  for (const [face, [xOffset, yOffset]] of Object.entries(facePositions)) {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const sticker = document.createElement('div');
        sticker.className = 'sticker';
        sticker.title = `${face}${row + 1}${col + 1}`;
        sticker.style.background = previewStickerColor(faces[face][row][col].color);
        sticker.style.gridColumn = `${xOffset + col + 1}`;
        sticker.style.gridRow = `${yOffset + row + 1}`;
        fragment.append(sticker);
      }
    }
  }

  container.append(fragment);
}

function formatTime(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  return `${seconds}.${String(millis).padStart(3, '0')}`;
}

function displaySolveTime(solve) {
  if (solve.penalty === 'dnf') return 'DNF';
  if (solve.penalty === '+2') return `${formatTime(solve.durationMs + 2000)}+`;
  return solve.duration || formatTime(solve.durationMs);
}

function puzzleLabel(puzzle) {
  return puzzleLabels.get(puzzle) || puzzle || '3x3';
}

function timeOrDash(value) {
  return value == null ? '-' : formatTime(value);
}

function numberOrDash(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function currentInspectionPenalty() {
  if (!activeInspectionUsed || inspectionStartedAt === 0) return 'ok';
  return inspectionPenaltyForElapsed((performance.now() - inspectionStartedAt) / 1000);
}

function inspectionPenaltyForElapsed(elapsedSeconds) {
  if (elapsedSeconds >= inspectionDnfSeconds) return 'dnf';
  if (elapsedSeconds >= inspectionSeconds) return '+2';
  return 'ok';
}

function inspectionDisplayForElapsed(elapsedSeconds) {
  if (elapsedSeconds >= inspectionDnfSeconds) return 'DNF';
  if (elapsedSeconds >= inspectionSeconds) return '+2';
  return Math.max(0, inspectionSeconds - elapsedSeconds).toFixed(1);
}

function parseTimeInput(value) {
  const text = String(value).trim().replace(',', '.');
  if (!text) throw new Error('请输入成绩，例如 12.345 或 1:02.345');

  const minutesMatch = text.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (minutesMatch) {
    const minutes = Number(minutesMatch[1]);
    const seconds = Number(minutesMatch[2]);
    if (seconds >= 60) throw new Error('冒号后的秒数必须小于 60');
    return minutes * 60000 + seconds * 1000 + fractionToMs(minutesMatch[3]);
  }

  const secondsMatch = text.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (secondsMatch) {
    return Number(secondsMatch[1]) * 1000 + fractionToMs(secondsMatch[2]);
  }

  throw new Error('成绩格式无效，请使用 12.345 或 1:02.345');
}

function fractionToMs(fraction = '') {
  return Number(fraction.padEnd(3, '0'));
}

function shouldIgnoreTimerKey(event) {
  if (document.querySelector('dialog[open]')) return true;
  const target = event.target;
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function summarizeSolves(inputSolves) {
  if (inputSolves.length === 0) {
    return {
      count: 0,
      validCount: 0,
      dnfCount: 0,
      plus2Count: 0,
      bluetoothSolveCount: 0,
      best: null,
      worst: null,
      average: null,
      standardDeviation: null,
      averageBluetoothMoveCount: null,
      averageBluetoothTps: null,
      bestBluetoothTps: null,
      latest: null,
      mo3: null,
      ao5: null,
      ao12: null,
      ao50: null,
      ao100: null,
      bestMo3: null,
      bestAo5: null,
      bestAo12: null,
      bestAo50: null,
      bestAo100: null,
    };
  }
  const dnfCount = inputSolves.filter((solve) => solve.penalty === 'dnf').length;
  const plus2Count = inputSolves.filter((solve) => solve.penalty === '+2').length;
  const bluetoothStats = summarizeBluetoothSolves(inputSolves);
  const times = inputSolves.map((solve) => effectiveDurationMs(solve)).filter((value) => Number.isFinite(value));
  const latest = effectiveDurationMs(inputSolves.at(-1));
  if (times.length === 0) {
    return {
      count: inputSolves.length,
      validCount: 0,
      dnfCount,
      plus2Count,
      ...bluetoothStats,
      best: null,
      worst: null,
      average: null,
      standardDeviation: null,
      averageBluetoothMoveCount: bluetoothStats.averageBluetoothMoveCount,
      averageBluetoothTps: bluetoothStats.averageBluetoothTps,
      bestBluetoothTps: bluetoothStats.bestBluetoothTps,
      latest,
      mo3: null,
      ao5: null,
      ao12: null,
      ao50: null,
      ao100: null,
      bestMo3: null,
      bestAo5: null,
      bestAo12: null,
      bestAo50: null,
      bestAo100: null,
    };
  }
  const average = times.reduce((sum, value) => sum + value, 0) / times.length;
  const variance = times.reduce((sum, value) => sum + (value - average) ** 2, 0) / times.length;
  return {
    count: inputSolves.length,
    validCount: times.length,
    dnfCount,
    plus2Count,
    ...bluetoothStats,
    best: Math.min(...times),
    worst: Math.max(...times),
    average,
    standardDeviation: Math.sqrt(variance),
    latest,
    mo3: meanOfLast(inputSolves, 3),
    ao5: averageOfLast(inputSolves, 5),
    ao12: averageOfLast(inputSolves, 12),
    ao50: averageOfLast(inputSolves, 50),
    ao100: averageOfLast(inputSolves, 100),
    bestMo3: bestMeanOf(inputSolves, 3),
    bestAo5: bestAverageOf(inputSolves, 5),
    bestAo12: bestAverageOf(inputSolves, 12),
    bestAo50: bestAverageOf(inputSolves, 50),
    bestAo100: bestAverageOf(inputSolves, 100),
  };
}

function summarizeBluetoothSolves(inputSolves) {
  const bluetoothSolves = inputSolves.filter((solve) => Number.isFinite(solve.bluetoothMoveCount) && solve.bluetoothMoveCount > 0);
  const moveCounts = bluetoothSolves.map((solve) => solve.bluetoothMoveCount);
  const tpsValues = bluetoothSolves.map((solve) => solve.bluetoothTps).filter((value) => Number.isFinite(value));
  return {
    bluetoothSolveCount: bluetoothSolves.length,
    averageBluetoothMoveCount: moveCounts.length > 0 ? averageNumber(moveCounts) : null,
    averageBluetoothTps: tpsValues.length > 0 ? averageNumber(tpsValues) : null,
    bestBluetoothTps: tpsValues.length > 0 ? Math.max(...tpsValues) : null,
  };
}

function averageNumber(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageOfLast(inputSolves, size) {
  if (inputSolves.length < size) return null;
  return averageOfWindow(inputSolves.slice(-size));
}

function bestAverageOf(inputSolves, size) {
  if (inputSolves.length < size) return null;
  const averages = [];
  for (let index = 0; index <= inputSolves.length - size; index += 1) {
    const average = averageOfWindow(inputSolves.slice(index, index + size));
    if (average != null) averages.push(average);
  }
  return averages.length === 0 ? null : Math.min(...averages);
}

function meanOfLast(inputSolves, size) {
  if (inputSolves.length < size) return null;
  return meanOfWindow(inputSolves.slice(-size));
}

function bestMeanOf(inputSolves, size) {
  if (inputSolves.length < size) return null;
  const means = [];
  for (let index = 0; index <= inputSolves.length - size; index += 1) {
    const mean = meanOfWindow(inputSolves.slice(index, index + size));
    if (mean != null) means.push(mean);
  }
  return means.length === 0 ? null : Math.min(...means);
}

function averageOfWindow(inputSolves) {
  const values = inputSolves.map(effectiveDurationMs);
  if (values.filter((value) => value == null).length > 1) return null;
  const sorted = [...values].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  const trimmed = sorted.slice(1, -1);
  if (trimmed.some((value) => value == null)) return null;
  return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
}

function meanOfWindow(inputSolves) {
  const values = inputSolves.map(effectiveDurationMs);
  if (values.some((value) => value == null)) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function effectiveDurationMs(solve) {
  if (solve.penalty === 'dnf') return null;
  return solve.durationMs + (solve.penalty === '+2' ? 2000 : 0);
}

async function getJson(url) {
  const response = await fetch(apiUrl(url));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function postJson(url, body) {
  return requestJson(url, {
    method: 'POST',
    body,
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(apiUrl(url), {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function apiUrl(url) {
  const text = String(url || '');
  if (!apiOrigin || /^[a-z][a-z\d+.-]*:/i.test(text)) return text;
  return `${apiOrigin}${text.startsWith('/') ? text : `/${text}`}`;
}

function beep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
