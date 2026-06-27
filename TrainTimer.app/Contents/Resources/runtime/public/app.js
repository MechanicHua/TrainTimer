import { applyMoveToFacelets, applyMovesToFacelets, cubeFaceletSignature, cubeStateFromScramble, faceletsFromScramble, facesFromFacelets as cubeFacesFromFacelets, isSolvedFaces, isSolvedFacelets as cubeIsSolvedFacelets, parseMoveToken, parseScramble, relativeFaceletsForScrambleTargetFacelets, shortCorrectionMovesForRelativeFacelets, solvedFaceletString, warmShortCorrectionSearch } from './cube-state.js?v=20260602-facelet-engine';
import { algorithmTrainerBuiltInCasesForSet, algorithmTrainerCaseBelongsToSet, algorithmTrainerCases, algorithmTrainerSetMembers } from './algorithm-trainer-cases.js?v=20260528-gan-latency';
import { algorithmTrainerAlgorithmIsValid, algorithmTrainerAlgorithmStepCount, algorithmTrainerSetupText, cleanAlgorithmTrainerAlgorithm } from './algorithm-trainer-utils.js?v=20260528-gan-latency';
import { bluetoothMovePacketSignature, decodeBatteryLevel, decodeBluetoothMoves } from './bluetooth-moves.js?v=20260528-gan-latency';
import { cfopStagesForSave, cfopStageTemplate, solveCfopAnalysis, solveMoveRecords } from './cfop-analysis.js?v=20260601-correction-perf';
import { opEventsForSave } from './op-analysis.js?v=20260603-op-analysis';
import { opCaseSvgMarkup } from './op-case-svg.js?v=20260603-op-poster-diagrams';
import { buildOpFormulaLibrary } from './op-formula-library.js?v=20260603-op-formula-library';
import { opCaseSamplesForSolves, summarizeOpStats } from './op-stats.js?v=20260603-op-stats';
import { createExportPayload, exportHistoryForSolves, safeExportFilename, selectedExportHistory, solvesToCsv, solvesToCstimerCsv, solvesToCstimerJson, solvesToTextTable } from './solves-export.js?v=20260528-gan-latency';
import { decodeGanBluetoothPacketFast } from './gan-bluetooth-fast.js?v=20260601-gan-scratch';
import { extractGanMacFromManufacturerData, ganManufacturerDataOptions } from './gan-mac.js?v=20260601-gan-mac-cics';
import {
  ganBluetoothIsDuplicateMovePacket,
  ganBluetoothMoveCounterDelta,
  ganBluetoothMovesFromDecoded,
  ganBluetoothNextMoveCounter,
} from './gan-move-history.js?v=20260528-gan-latency';
import {
  ganGyroQuaternionToCube3dBasisInto,
  ganGyroVelocityToCube3dBasisInto,
  shouldAcceptGyroRawSample,
} from './gyro-orientation.js?v=20260601-gyro-filtered-hotpath';
import { countMoveSteps, logicalMoveSequence } from './move-metrics.js?v=20260528-gan-latency';
import { inspectionDisplayForElapsed, inspectionPenaltyForElapsed, inspectionReminderSeconds, inspectionSeconds } from './inspection.js?v=20260528-gan-latency';
import { parseSolveImport } from './solves-import.js?v=20260528-gan-latency';
import { buildStatsSummary } from './stats-summary.js?v=20260528-gan-latency';
import { buildSolveSummary } from './solve-summary.js?v=20260528-gan-latency';
import { bestAverageRecord, bestMeanRecord, bestSingleRecord, chronologicalSolves, recordMarksAt, rollingAverageAt, rollingAverageDetailAt, rollingMeanAt, rollingMeanDetailAt } from './rolling-averages.js?v=20260601-correction-perf';
import { replayDelayBeforeMove, replayMoveAnimationDelay } from './replay-timing.js?v=20260603-replay-timing';

const localApiOrigin = 'http://127.0.0.1:3211';
const localHttpHost = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
const apiOrigin = localHttpHost ? '' : localApiOrigin;
const holdToStartMs = 500;
const timerDisplayFrameMs = 1000 / 30;
const inspectionDisplayFrameMs = 50;
const holdDisplayFrameMs = 1000 / 30;
const algorithmTrainerTimerFrameMs = 1000 / 30;
const reminderSeconds = new Set(inspectionReminderSeconds);
const compactHistoryLimit = Number.POSITIVE_INFINITY;
const allSolvesRenderBatchSize = 180;
const bluetoothNextSolveGestureWindowMs = 700;
const historyBottomFadeRangePx = 180;
const cube3dMoveFrameMs = 1000 / 60;
const cube3dGyroFrameMs = 1000 / 45;
const cube3dGyroCalmFrameMs = 1000 / 30;
const cube3dGyroSettleFrameMs = 1000 / 24;
const cube3dDirtyFrameMs = 1000 / 45;
const cube3dIdleFrameMs = 1000 / 30;
const cube3dGyroActiveWindowMs = 180;
const cube3dGyroSmoothingMs = 14;
const cube3dGyroFastSmoothingMs = 7;
const cube3dGyroPredictionMaxMs = 36;
const cube3dGyroPredictionMaxRatio = 0.65;
const cube3dGyroPredictionIntervalMaxMs = 180;
const cube3dPoseEpsilon = 0.0012;
const cube3dPoseDotThreshold = Math.cos(cube3dPoseEpsilon / 2);
const cube3dPoseContinueDotThreshold = Math.cos(cube3dPoseEpsilon);
const cube3dGyroTargetEpsilon = 0.0025;
const cube3dGyroTargetDotThreshold = Math.cos(cube3dGyroTargetEpsilon / 2);
const cube3dGyroFastAngle = 0.08;
const cube3dGyroCalmAngle = 0.018;
const cube3dGyroFastDotThreshold = Math.cos(cube3dGyroFastAngle / 2);
const cube3dGyroCalmDotThreshold = Math.cos(cube3dGyroCalmAngle / 2);
const cube3dGyroFastSmoothingDotThreshold = Math.cos(0.22 / 2);
const cube3dGyroFastVelocity = 0.34;
const cube3dGyroCalmVelocity = 0.08;
const cube3dTelemetryFrameMs = 1000 / 10;
const bluetoothGyroStatusFrameMs = 250;
const bluetoothGanMacBackgroundRetryMs = 2500;
const bluetoothGanMacUnavailableRetryMs = 60000;
const bluetoothGanMissingMacStatusFrameMs = 1000;
const bluetoothGanPacketDrainBudgetMs = 8;
const bluetoothGanFastDecodeFailureLimit = 3;
const bluetoothGanFastDecodeCooldownMs = 10000;
const bluetoothGanFastDecodeWarningMs = 5000;
const scrambleGuideSolverDebounceMs = 0;
const scrambleGuideSolverTimeoutMs = 4000;
const scrambleGuideSolverRetryDelayMs = 260;
const scrambleGuideSolverRetryMaxDelayMs = 1800;
const scrambleGuideSolverMaxRetries = 4;
const scrambleGuideSolverCacheLimit = 64;
const scrambleGuideLocalCorrectionMaxDepth = 8;
const scrambleGuideLocalCorrectionMaxMs = 14;
const scrambleGuideLocalCorrectionMaxNodes = 1000000;
const scrambleGuideLocalCorrectionImmediateWarmupMaxMs = 90;
const scrambleGuideLocalCorrectionWarmupMaxMs = 90;
const scrambleGuideLocalCorrectionWarmupDelayMs = 300;
const scrambleGuideLocalCorrectionWarmupTimeoutMs = 1500;
const scrambleGuideBacktrackCorrectionMaxWrongMoves = 4;
const cube3dTurnDurationMs = 72;
const cube3dDoubleTurnDurationMs = 96;
const cube3dTurnQueueLimit = 3;
const cube3dMaxPixelRatio = 1;
const cube3dDragSensitivity = 0.008;
const bluetoothGyroLogIntervalMs = 500;
const bluetoothGanStateLogIntervalMs = 500;
const bluetoothLogRenderIntervalMs = 120;
const bluetoothHighFrequencyMoveLogIntervalMs = 350;
const bluetoothFeedRowLimit = 12;
const bluetoothDebugLogging = localStorage.getItem('trainTimer.bluetoothDebug') === '1';
const byteHexLookup = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0'));
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
  cfopFull: 'CFOP 全套',
  fourLookLastLayer: '4LLL 入门',
  pll: 'PLL',
  pll2: '2-Look PLL',
  oll: 'OLL 全套',
  oll2: '2-Look OLL',
  f2lFull: 'F2L 全套',
  f2l: 'F2L 入门',
  custom: 'Custom',
};
const algorithmTrainerFocusLabels = {
  all: '全部',
  review: '复习',
  new: '未练',
  weak: '薄弱',
  starred: '收藏',
};
const accentThemeLabels = {
  cyan: '青色',
  blue: '蓝色',
  green: '绿色',
  orange: '橙色',
  pink: '粉色',
  purple: '紫色',
};
const shortcutDefinitions = [
  { id: 'timer', label: '观察 / 准备 / 停表', defaultCode: 'Space' },
  { id: 'cancel', label: '退出观察 / 本把 DNF', defaultCode: 'Escape' },
  { id: 'next', label: '下一把', defaultCode: 'KeyN' },
  { id: 'scramble', label: '新打乱', defaultCode: 'KeyR' },
  { id: 'lockScramble', label: '锁定打乱', defaultCode: 'KeyL' },
  { id: 'copyScramble', label: '复制打乱', defaultCode: 'KeyC' },
  { id: 'trainer', label: '算法训练', defaultCode: 'KeyT' },
  { id: 'inspection', label: '观察开关', defaultCode: 'KeyI' },
  { id: 'stats', label: '统计详情', defaultCode: 'KeyS' },
  { id: 'allSolves', label: '全部成绩', defaultCode: 'KeyA' },
  { id: 'preferences', label: '偏好', defaultCode: 'KeyP' },
  { id: 'lastOk', label: '上一把 OK', defaultCode: 'KeyO' },
  { id: 'lastPlusTwo', label: '上一把 +2', defaultCode: 'Digit2', aliases: ['Numpad2'] },
  { id: 'lastDnf', label: '上一把 DNF', defaultCode: 'KeyD' },
  { id: 'deleteLast', label: '删除上一把', defaultCode: 'Delete', aliases: ['Backspace'] },
];
const shortcutDefinitionById = new Map(shortcutDefinitions.map((definition) => [definition.id, definition]));
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
const bluetoothGanManufacturerData = ganManufacturerDataOptions;
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
const normalizedBluetoothUuidCache = new Map();
const shortBluetoothUuidCache = new Map();
const bluetoothUuidLabelCache = new Map();
const emptyBluetoothMoves = Object.freeze([]);
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
  timerShortcutGrid: document.querySelector('#timerShortcutGrid'),
  resetShortcutsButton: document.querySelector('#resetShortcutsButton'),
  hideTimerToggle: document.querySelector('#hideTimerToggle'),
  timerFreezeSelect: document.querySelector('#timerFreezeSelect'),
  bluetooth3dPreviewToggle: document.querySelector('#bluetooth3dPreviewToggle'),
  bluetooth3dGyroToggle: document.querySelector('#bluetooth3dGyroToggle'),
  accentThemeSelect: document.querySelector('#accentThemeSelect'),
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
  algorithmTrainerEditor: document.querySelector('#algorithmTrainerEditor'),
  algorithmTrainerEditorTitle: document.querySelector('#algorithmTrainerEditorTitle'),
  algorithmTrainerEditorMeta: document.querySelector('#algorithmTrainerEditorMeta'),
  algorithmTrainerEditorName: document.querySelector('#algorithmTrainerEditorName'),
  algorithmTrainerEditorGroup: document.querySelector('#algorithmTrainerEditorGroup'),
  algorithmTrainerEditorAlgorithm: document.querySelector('#algorithmTrainerEditorAlgorithm'),
  algorithmTrainerEditorHint: document.querySelector('#algorithmTrainerEditorHint'),
  algorithmTrainerEditorError: document.querySelector('#algorithmTrainerEditorError'),
  algorithmTrainerEditorSaveButton: document.querySelector('#algorithmTrainerEditorSaveButton'),
  algorithmTrainerEditorCancelButton: document.querySelector('#algorithmTrainerEditorCancelButton'),
  algorithmTrainerOverview: document.querySelector('#algorithmTrainerOverview'),
  algorithmTrainerCard: document.querySelector('.algorithm-trainer-card'),
  algorithmTrainerName: document.querySelector('#algorithmTrainerName'),
  algorithmTrainerGroup: document.querySelector('#algorithmTrainerGroup'),
  algorithmTrainerRevealButton: document.querySelector('#algorithmTrainerRevealButton'),
  algorithmTrainerStarButton: document.querySelector('#algorithmTrainerStarButton'),
  algorithmTrainerScore: document.querySelector('#algorithmTrainerScore'),
  algorithmTrainerFeedback: document.querySelector('#algorithmTrainerFeedback'),
  algorithmTrainerAlg: document.querySelector('#algorithmTrainerAlg'),
  algorithmTrainerPreview: document.querySelector('#algorithmTrainerPreview'),
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
  historyCfopPanel: document.querySelector('#historyCfopPanel'),
  historyCfopToggle: document.querySelector('#historyCfopToggle'),
  historyCfopTitle: document.querySelector('#historyCfopTitle'),
  historyCfopMeta: document.querySelector('#historyCfopMeta'),
  historyCfopBody: document.querySelector('#historyCfopBody'),
  historyCfopStages: document.querySelector('#historyCfopStages'),
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
  statsOpPanel: document.querySelector('#statsOpPanel'),
  statsOpMeta: document.querySelector('#statsOpMeta'),
  statsOpList: document.querySelector('#statsOpList'),
  statsOpLibraryMeta: document.querySelector('#statsOpLibraryMeta'),
  statsOpFormulaList: document.querySelector('#statsOpFormulaList'),
  statsOpFormulaDetail: document.querySelector('#statsOpFormulaDetail'),
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
  pbToastQueue: document.querySelector('#pbToastQueue'),
};

let appState = 'loading';
let scramble = null;
let solves = [];
let sessions = [];
let fullHistoryLoaded = false;
let fullHistoryRequestId = 0;
let scrambleLoadRequestId = 0;
let scrambleLoadPromise = null;
let nextSolvePromise = null;
let historyPartial = false;
let historyTotal = 0;
let bootstrapSessionSummaries = null;
let inspectionEnabled = localStorage.getItem('trainTimer.inspection') === '1';
let hideTimerWhileSolving = localStorage.getItem('trainTimer.hideTimerWhileSolving') === '1';
let timerFreezeMs = normalizeTimerFreezeMs(localStorage.getItem('trainTimer.timerFreezeMs'));
let bluetooth3dPreviewEnabled = localStorage.getItem('trainTimer.bluetooth3dPreviewEnabled') === '1';
let bluetooth3dGyroEnabled = localStorage.getItem('trainTimer.bluetooth3dGyroEnabled') === '1';
if (!bluetooth3dPreviewEnabled) bluetooth3dGyroEnabled = false;
let accentTheme = normalizeAccentTheme(localStorage.getItem('trainTimer.accentTheme'));
let confirmDeleteSolves = localStorage.getItem('trainTimer.confirmDeleteSolves') !== '0';
let keyboardShortcuts = loadKeyboardShortcuts();
let recordingShortcutId = '';
let currentSessionId = localStorage.getItem('trainTimer.session') || 'default';
let scramblePuzzle = localStorage.getItem('trainTimer.scramblePuzzle') || 'three';
let scrambleLocked = localStorage.getItem('trainTimer.scrambleLocked') === '1';
let allSessionsEnabled = localStorage.getItem('trainTimer.allSessions') === '1';
let allSolvesDatePreset = 'all';
let allSolvesVisibleLimit = allSolvesRenderBatchSize;
let statsChartMode = localStorage.getItem('trainTimer.statsChartMode') || 'single';
if (!statsChartModes.has(statsChartMode)) statsChartMode = 'single';
let selectedOpFormulaCaseKey = localStorage.getItem('trainTimer.selectedOpFormulaCaseKey') || '';
let historySortKey = localStorage.getItem('trainTimer.historySortKey') || '';
let historySortDirection = localStorage.getItem('trainTimer.historySortDirection') || '';
if (!['single', 'tps', 'ao5', 'ao12'].includes(historySortKey) || !['asc', 'desc'].includes(historySortDirection)) {
  historySortKey = '';
  historySortDirection = '';
}
let historyCfopCollapsed = localStorage.getItem('trainTimer.historyCfopCollapsed') === '1';
let algorithmTrainerCustomCases = loadAlgorithmTrainerCustomCases();
let algorithmTrainerSet = localStorage.getItem('trainTimer.algorithmTrainerSet') || 'pll';
if (!algorithmTrainerSetExists(algorithmTrainerSet)) algorithmTrainerSet = 'pll';
let algorithmTrainerFocus = localStorage.getItem('trainTimer.algorithmTrainerFocus') || 'all';
if (!Object.hasOwn(algorithmTrainerFocusLabels, algorithmTrainerFocus)) algorithmTrainerFocus = 'all';
let algorithmTrainerGroup = localStorage.getItem('trainTimer.algorithmTrainerGroup') || 'all';
let algorithmTrainerSearch = localStorage.getItem('trainTimer.algorithmTrainerSearch') || '';
let algorithmTrainerCurrentId = localStorage.getItem('trainTimer.algorithmTrainerCurrentId') || '';
let algorithmTrainerStats = loadAlgorithmTrainerStats();
let algorithmTrainerStarredIds = loadAlgorithmTrainerStarredIds();
let algorithmTrainerAlgorithmHidden = localStorage.getItem('trainTimer.algorithmTrainerAlgorithmHidden') === '1';
let algorithmTrainerFeedback = null;
let algorithmTrainerFeedbackTimer = 0;
let algorithmTrainerRenderedCaseId = '';
let algorithmTrainerEditorMode = '';
let algorithmTrainerEditorId = '';
let algorithmTrainerTimerStartedAt = 0;
let algorithmTrainerTimerFrame = 0;
let startedAt = 0;
let timerStartedAtMs = 0;
let timerStartedAtIsoTime = '';
let inspectionStartedAt = 0;
let activeInspectionUsed = false;
let inspectionBluetoothStartBlockedUntil = 0;
let holdStartedAt = 0;
let holdConfirmed = false;
let timerFrame = null;
let inspectionFrame = null;
let holdFrame = null;
let inspectionEntryTimer = 0;
let inspectionSessionId = 0;
let inspectionEntrySessionId = 0;
let holdReturnState = 'ready';
let reminded = new Set();
let activePenalty = 'ok';
let finishSource = 'manual';
let selectedSolveIds = new Set();
let historySelectionAnchorId = null;
let pendingDeletedSolves = [];
let pendingImportSnapshot = null;
let pendingImportPreview = null;
let currentDetailSolveId = null;
let currentAverageDetail = null;
let solveReplayTimer = 0;
let solveReplayStep = -1;
let solveReplayPlaying = false;
let solveReplayPreviewActive = false;
let solveReplayFacelets = '';
let solveReplayPreviewLabel = '';
let solveReplayFocusedOpKey = '';
let solveReplayFocusedOpManual = false;
let statsScope = 'session';
let statsTrendChartRenderState = null;
let statsTrendChartHoverIndex = -1;
let statsTrendChartModel = null;
let statsDistributionChartRenderState = null;
let statsDistributionChartHoverIndex = -1;
let statsDistributionChartModel = null;
let statsChartTooltip = null;
let statsChartDocumentPointerTracking = false;
let pbToastQueue = [];
let pbToastActive = false;
let pbToastTimer = 0;
let pbConfettiTimer = 0;
const pbToastVisibleMs = 3600;
const pbToastExitMs = 200;
let scrambleCopyHintTimer = 0;
let bluetoothDevice = null;
let bluetoothDeviceDisconnectHandler = null;
let bluetoothReconnectDevices = [];
let bluetoothSubscriptions = [];
let bluetoothLog = [];
let bluetoothMoves = [];
let bluetoothStateCorrections = [];
let bluetoothSolved = false;
let bluetoothSolvedByStatePacket = false;
let bluetoothSolveFacelets = '';
let bluetoothSolveCubeValid = false;
let bluetoothMoveDerivedFaces = null;
let bluetoothMoveDerivedFacelets = '';
let bluetoothMoveDerivedSignature = '';
let bluetoothMoveDerivedStateTime = 0;
let bluetoothMoveDerivedSolved = false;
let bluetoothMovesVersion = 0;
let bluetoothMoveSequenceVersion = -1;
let bluetoothMoveSequenceCache = [];
let bluetoothMoveTailTextVersion = -1;
let bluetoothMoveTailTextCache = '';
let bluetoothMoveTextVersion = -1;
let bluetoothMoveTextCache = '';
let bluetoothMoveStepCountVersion = -1;
let bluetoothMoveStepCountCache = 0;
let bluetoothGyro = null;
let bluetoothGyroLastUpdateAt = 0;
let bluetoothGyroReferenceInverse = null;
let bluetoothGyroLastBasisQuaternion = null;
let bluetoothPendingGyro = null;
let bluetoothGyroUpdateFrame = 0;
let bluetoothGyroLoadPromise = null;
let bluetoothLastAcceptedGyroRaw = null;
let bluetoothLastAcceptedGyroAt = 0;
const bluetoothGyroRawScratch = { qw: 1, qx: 0, qy: 0, qz: 0, vx: 0, vy: 0, vz: 0 };
const bluetoothGyroMappedQuaternionScratch = { x: 0, y: 0, z: 0, w: 1 };
let bluetoothLastMoveText = '-';
let bluetoothPhysicalFacelets = '';
let bluetoothPhysicalFaces = null;
let bluetoothPhysicalSignature = '';
let bluetoothPhysicalSolved = false;
let bluetoothPhysicalStateTime = '';
let bluetoothPhysicalStateReceivedAt = 0;
let bluetoothMovesRenderKey = '';
let bluetoothMovesRenderFrame = 0;
let bluetoothMovesRenderPendingOptions = null;
let bluetoothStatePreviewRenderKey = '';
let bluetoothFeedRenderKey = '';
let bluetoothFeedRenderedRowCount = -1;
let bluetoothFeedEmptyRowNode = null;
let bluetoothFeedRowNodes = [];
let bluetoothFeedRowKeys = [];
let bluetoothLogDialogRenderKey = '';
let bluetoothLogDialogRenderedRowCount = -1;
let bluetoothLogDialogEmptyRowNode = null;
let bluetoothLogDialogRowNodes = [];
let bluetoothLogDialogRowKeys = [];
let bluetoothLogRenderTimer = 0;
let bluetoothLogRenderFrame = 0;
let bluetoothLogLastRenderAt = 0;
let bluetoothLogTimeSecond = -1;
let bluetoothLogTimeText = '';
let bluetoothHighFrequencyMoveLogAt = 0;
let bluetoothBatteryLevel = null;
let bluetoothGanMac = '';
let bluetoothGanSession = null;
let bluetoothGanMacReadPromise = null;
let bluetoothGanMacReadRetryAt = 0;
let bluetoothGanPendingInit = null;
let bluetoothGanLastMoveCounter = null;
let bluetoothGanLastStateCounter = null;
let bluetoothGanLastDecodedStateSignature = '';
let bluetoothGanPacketSequence = 0;
let bluetoothGanLatestAppliedGyroSequence = 0;
let bluetoothGanDecodeWarning = '';
let bluetoothGanFastDecodeDisabledUntil = 0;
let bluetoothGanFastDecodeFailureCount = 0;
let bluetoothGanFastDecodeLastWarningAt = 0;
let bluetoothGanMacPromptAllowed = true;
let bluetoothGanMacPromptInFlight = null;
let bluetoothGanMacPromptDismissed = false;
let bluetoothGanLastStateLogAt = 0;
let bluetoothGanLastStateLogSignature = '';
let bluetoothGanLastStatusTitleAt = 0;
let bluetoothGanMissingMacStatusAt = 0;
const bluetoothGanPacketQueue = [];
let bluetoothGanPacketQueueHead = 0;
let bluetoothGanPacketQueueDraining = false;
let bluetoothStatusTextKey = '';
let bluetoothStatusTitleKey = '';
let lastBluetoothMovePacketSignature = '';
let scrambleGuideMoves = [];
let scrambleGuideMovesText = '';
let scrambleGuideInputMoves = [];
let scrambleGuideRoute = [];
let scrambleGuideRouteByFacelets = new Map();
let scrambleGuideRouteIndex = 0;
let scrambleGuideRouteStateMatched = false;
let scrambleGuideTargetFaces = null;
let scrambleGuideTargetSignature = '';
let scrambleGuideTargetFacelets = '';
let scrambleGuideTrackingFaces = null;
let scrambleGuideTrackingFacelets = '';
const scrambleGuideParsedMoveCache = new Map();
let scrambleGuideCorrectPrefix = 0;
let scrambleGuidePartialIndex = null;
let scrambleGuideErrorIndex = null;
let scrambleGuideErrorMove = '';
let scrambleGuideLastMatchedInputLength = 0;
let scrambleGuideLastMatchedFacelets = '';
let scrambleGuideCompleted = false;
let scrambleGuideSupported = false;
let scrambleGuideAwaitingSyncedState = false;
let scrambleGuideSolverCacheKey = '';
let scrambleGuideSolverCacheMoves = [];
const scrambleGuideSolverCache = new Map();
let scrambleGuideSolverLoadingKey = '';
let scrambleGuideSolverActiveKey = '';
let scrambleGuideSolverErrorKey = '';
let scrambleGuideSolverError = '';
let scrambleGuideSolverQueuedKey = '';
let scrambleGuideSolverQueuedFacelets = '';
let scrambleGuideSolverTimer = 0;
let scrambleGuideSolverRetryTimer = 0;
let scrambleGuideSolverRetryKey = '';
let scrambleGuideSolverRetryFacelets = '';
let scrambleGuideSolverRetryCount = 0;
let scrambleGuideSolverActiveStartedAt = 0;
let scrambleGuideSolverAbortController = null;
let scrambleGuideLocalSolverWarmupScheduled = false;
let scrambleGuideLocalSolverWarmed = false;
let scrambleGuideServerSolverWarmupScheduled = false;
let scrambleGuideServerSolverWarmed = false;
let scrambleGuideCorrectionSnapshotKey = '';
let scrambleGuideCorrectionSnapshotValue = null;
let scrambleGuideCorrectionRenderFrame = 0;
let scrambleGuideCorrectionRouteByFacelets = new Map();
let scrambleGuideCorrectionRouteScrambleKey = '';
let scrambleGuideCorrectionRouteSourceFacelets = '';
let scrambleTextRenderKey = '';
let scrambleGuideStructureKey = '';
let scrambleGuideMoveNodes = [];
let scrambleGuideMoveNodeStates = [];
let scrambleGuideRenderedVisualState = null;
let scrambleGuideMetaRenderKey = '';
let scrambleSourceRenderKey = '';
let bluetoothNextSolveGestureCandidate = null;
let bluetoothNextSolveGestureFlushTimer = 0;
let bluetoothNextSolveGestureLoading = false;
let previewScrambleText = '';
let previewRequestId = 0;
const previewCache = new Map();
let previewModeRenderKey = '';
let statsOverviewRenderKey = '';
let sessionsRenderKey = '';
let quickActionsRenderKey = '';
let historyRowsRenderKey = '';
let historyControlsRenderKey = '';
let historyCfopRenderKey = '';
const sessionMetricsCache = new Map();
let filteredSolvesCacheRef = null;
let filteredSolvesCacheSessionId = '';
let filteredSolvesCache = [];
const solvesForSessionCache = new Map();
const sessionMetricsSignatureCache = new WeakMap();
let THREE = null;
let threeModulePromise = null;
let cube3d = null;
let cube3dInitPromise = null;
let cube3dLastFacesSignature = '';
let cube3dLastMetaText = '';
let cube3dTelemetryTextKey = '';
let cube3dLastMoveText = '';
let cube3dMovePulseTimer = 0;
let cube3dMovePulseFrame = 0;
let cube3dAnimationFrame = 0;
let cube3dAnimationTimer = 0;
let cube3dTelemetryFrame = 0;
let cube3dTelemetryTimer = 0;
let cube3dTelemetryLastRenderAt = 0;
let timerFocusTransitionTimer = 0;
let timerDisplayLayoutTimer = 0;
let timerDisplayFitKey = '';
let timerDisplayMeasureKey = '';
let timerDisplayTextKey = '';
const bluetooth3dCanvasHomeParent = elements.bluetooth3dCanvas?.parentElement || null;
const bluetooth3dCanvasHomeNextSibling = elements.bluetooth3dCanvas?.nextSibling || null;
let bluetooth3dFocusHost = null;
let performanceCounters = createPerformanceCounters();

applyAccentTheme();
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
elements.bluetooth3dPreviewToggle.addEventListener('change', updateTimerSettingsFromControls);
elements.bluetooth3dGyroToggle.addEventListener('change', updateTimerSettingsFromControls);
elements.bluetooth3dCanvas?.addEventListener('pointerdown', handleBluetoothCube3dPointerDown);
elements.bluetooth3dCanvas?.addEventListener('pointermove', handleBluetoothCube3dPointerMove);
elements.bluetooth3dCanvas?.addEventListener('pointerup', handleBluetoothCube3dPointerEnd);
elements.bluetooth3dCanvas?.addEventListener('pointercancel', handleBluetoothCube3dPointerEnd);
elements.bluetooth3dCanvas?.addEventListener('lostpointercapture', handleBluetoothCube3dPointerEnd);
elements.timerShortcutGrid?.addEventListener('click', handleShortcutGridClick);
elements.resetShortcutsButton?.addEventListener('click', resetKeyboardShortcuts);
elements.accentThemeSelect.addEventListener('change', updateTimerSettingsFromControls);
elements.confirmDeleteToggle.addEventListener('change', updateTimerSettingsFromControls);
elements.algorithmTrainerButton.addEventListener('click', openAlgorithmTrainerDialog);
elements.algorithmTrainerSet.addEventListener('change', () => {
  closeAlgorithmTrainerEditor({ render: false });
  algorithmTrainerSet = elements.algorithmTrainerSet.value || 'pll';
  if (!algorithmTrainerSetExists(algorithmTrainerSet)) algorithmTrainerSet = 'pll';
  algorithmTrainerSearch = '';
  elements.algorithmTrainerSearch.value = '';
  localStorage.setItem('trainTimer.algorithmTrainerSet', algorithmTrainerSet);
  localStorage.setItem('trainTimer.algorithmTrainerSearch', algorithmTrainerSearch);
  chooseNextAlgorithmTrainerCase();
});
elements.algorithmTrainerFocus.addEventListener('change', () => {
  closeAlgorithmTrainerEditor({ render: false });
  algorithmTrainerFocus = elements.algorithmTrainerFocus.value || 'all';
  if (!Object.hasOwn(algorithmTrainerFocusLabels, algorithmTrainerFocus)) algorithmTrainerFocus = 'all';
  localStorage.setItem('trainTimer.algorithmTrainerFocus', algorithmTrainerFocus);
  chooseNextAlgorithmTrainerCase();
});
elements.algorithmTrainerGroupFilter.addEventListener('change', () => {
  closeAlgorithmTrainerEditor({ render: false });
  algorithmTrainerGroup = elements.algorithmTrainerGroupFilter.value || 'all';
  localStorage.setItem('trainTimer.algorithmTrainerGroup', algorithmTrainerGroup);
  chooseNextAlgorithmTrainerCase();
});
elements.algorithmTrainerSearch.addEventListener('input', handleAlgorithmTrainerSearchInput);
elements.algorithmTrainerSearch.addEventListener('change', handleAlgorithmTrainerSearchInput);
elements.algorithmTrainerSearch.addEventListener('search', handleAlgorithmTrainerSearchInput);
elements.algorithmTrainerNextButton.addEventListener('click', chooseNextAlgorithmTrainerCase);
elements.algorithmTrainerPassButton.addEventListener('click', () => recordAlgorithmTrainerResult(true));
elements.algorithmTrainerFailButton.addEventListener('click', () => recordAlgorithmTrainerResult(false));
elements.algorithmTrainerTimerButton.addEventListener('click', toggleAlgorithmTrainerTimer);
elements.algorithmTrainerRevealButton.addEventListener('click', toggleAlgorithmTrainerAlgorithmHidden);
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
elements.algorithmTrainerOverview.addEventListener('click', handleAlgorithmTrainerOverviewClick);
elements.algorithmTrainerEditorSaveButton.addEventListener('click', saveAlgorithmTrainerEditor);
elements.algorithmTrainerEditorCancelButton.addEventListener('click', () => closeAlgorithmTrainerEditor());
elements.algorithmTrainerEditor.addEventListener('keydown', handleAlgorithmTrainerEditorKeyDown);
[
  elements.algorithmTrainerEditorName,
  elements.algorithmTrainerEditorGroup,
  elements.algorithmTrainerEditorAlgorithm,
  elements.algorithmTrainerEditorHint,
].forEach((input) => {
  input.addEventListener('input', renderAlgorithmTrainerEditorValidation);
});
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
elements.statsTrendChart?.addEventListener('pointermove', handleStatsTrendChartPointerMove);
elements.statsTrendChart?.addEventListener('pointerleave', handleStatsTrendChartPointerLeave);
elements.statsDistributionChart?.addEventListener('pointermove', handleStatsDistributionChartPointerMove);
elements.statsDistributionChart?.addEventListener('pointerleave', handleStatsDistributionChartPointerLeave);
elements.statsOpFormulaList?.addEventListener('click', handleStatsOpFormulaCaseClick);
elements.statsOpFormulaDetail?.addEventListener('click', handleStatsOpSampleClick);
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
  statsTrendChartHoverIndex = -1;
  statsDistributionChartHoverIndex = -1;
  stopStatsChartPointerTracking();
  hideStatsChartTooltip();
});
elements.timerSettingsDialog.addEventListener('close', () => {
  recordingShortcutId = '';
  renderShortcutSettings();
});
elements.algorithmTrainerDialog.addEventListener('keydown', handleAlgorithmTrainerKeyDown);
elements.algorithmTrainerDialog.addEventListener('close', () => {
  cancelAlgorithmTrainerTimer();
  clearAlgorithmTrainerFeedback();
  closeAlgorithmTrainerEditor({ render: false });
});
elements.allSolvesDialog.addEventListener('close', () => {
  selectedSolveIds.clear();
  render();
});
elements.importDialog.addEventListener('close', () => {
  pendingImportPreview = null;
});
elements.selectAllSolves?.addEventListener('change', toggleSelectAllSolves);
elements.historyCfopToggle?.addEventListener('click', toggleHistoryCfopPanel);
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
document.addEventListener('visibilitychange', handleDocumentVisibilityChange);

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
  async setBluetoothGyroForTest(quaternion = { x: 0.2, y: -0.35, z: 0.1, w: 0.91 }, velocity = { x: 1, y: -2, z: 0 }) {
    await updateBluetoothGyro({ quaternion, velocity });
    return this.state();
  },
  setBluetoothFaceletsForTest(facelets = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB') {
    updateBluetoothPhysicalState({ facelets });
    return this.state();
  },
  clearBluetoothFaceletsForTest() {
    resetBluetoothPhysicalState();
    renderScramble();
    renderTimer();
    return this.state();
  },
  setBluetoothFacesFromScrambleForTest(text = '') {
    const facelets = faceletsFromScramble(String(text || ''));
    updateBluetoothPhysicalState({ facelets, protocol: 'debug' });
    return this.state();
  },
  faceletSignatureFromScrambleForTest(text = '') {
    return cubeFaceletSignature(faceletsFromScramble(String(text || '')));
  },
  cube3dStatsForTest() {
    if (!cube3d) return null;
    const instanceColor = cube3d.stickerMesh?.instanceColor?.array || null;
    return {
      renderCount: cube3d.renderCount,
      lastFrameDeltaMs: cube3d.lastFrameDeltaMs,
      needsRender: cube3d.needsRender,
      hasFrame: Boolean(cube3dAnimationFrame),
      hasTimer: Boolean(cube3dAnimationTimer),
      hasPulseFrame: Boolean(cube3dMovePulseFrame),
      hasPulseTimer: Boolean(cube3dMovePulseTimer),
      hasTurnAnimation: Boolean(cube3d.turnAnimation),
      turnQueueLength: cube3d.turnQueue.length,
      hasPendingFaces: Boolean(cube3d.pendingFaces),
      lastFacesSignature: cube3dLastFacesSignature,
      pendingFacesSignature: cube3d.pendingFacesSignature || '',
      turnTargetSignature: cube3d.turnAnimation?.targetSignature || '',
      queuedTargetSignatures: cube3d.turnQueue.map((item) => item.options?.targetSignature || ''),
      stickerInstances: cube3d.stickers?.size || 0,
      stickerDrawCalls: cube3d.stickerMesh ? 1 : 0,
      stickerMaterialVertexColors: Boolean(cube3d.stickerMesh?.material?.vertexColors),
      instanceColorSample: instanceColor ? Array.from(instanceColor.slice(0, 18)) : [],
      baseQuaternion: {
        x: cube3d.baseQuaternion.x,
        y: cube3d.baseQuaternion.y,
        z: cube3d.baseQuaternion.z,
        w: cube3d.baseQuaternion.w,
      },
      groupQuaternion: {
        x: cube3d.group.quaternion.x,
        y: cube3d.group.quaternion.y,
        z: cube3d.group.quaternion.z,
        w: cube3d.group.quaternion.w,
      },
      dragging: cube3d.dragPointerId != null,
      gyroAgeMs: bluetoothGyro ? performance.now() - bluetoothGyroLastUpdateAt : null,
    };
  },
  performanceStatsForTest() {
    return performanceStatsSnapshot();
  },
  resetPerformanceStatsForTest() {
    resetPerformanceCounters();
    return performanceStatsSnapshot();
  },
  startTimingForTest(elapsedMs = 0) {
    if (appState !== 'timing') startTiming();
    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    if (elapsed > 0) {
      startedAt = performance.now() - elapsed;
      timerStartedAtMs = Date.now() - Math.round(elapsed);
      timerStartedAtIsoTime = new Date(timerStartedAtMs).toISOString();
    }
    renderTimingTimerTick();
    return this.state();
  },
  startInspectionForTest(options = {}) {
    startInspection(options);
    return this.state();
  },
  stopTimingForTest() {
    if (appState === 'timing') {
      clearTimerTick();
      appState = 'ready';
      startedAt = 0;
      timerStartedAtMs = 0;
      timerStartedAtIsoTime = '';
      render();
    }
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
    scheduleScrambleGuideLocalSolverWarmupWhenUseful();
    scheduleScrambleGuideServerSolverWarmupWhenUseful();
    renderBluetoothFeed();
    return this.state();
  },
  async setBluetooth3dPreviewForTest(enabled = true, gyroEnabled = true) {
    bluetooth3dPreviewEnabled = Boolean(enabled);
    bluetooth3dGyroEnabled = bluetooth3dPreviewEnabled && Boolean(gyroEnabled);
    localStorage.setItem('trainTimer.bluetooth3dPreviewEnabled', bluetooth3dPreviewEnabled ? '1' : '0');
    localStorage.setItem('trainTimer.bluetooth3dGyroEnabled', bluetooth3dGyroEnabled ? '1' : '0');
    if (!bluetooth3dGyroEnabled) resetBluetoothGyro();
    renderPreviewMode();
    renderTimerSettingsDialog();
    if (bluetooth3dPreviewEnabled) await ensureBluetoothCube3dReady();
    return this.state();
  },
  async runBluetoothGyroBurstForTest(options = {}) {
    const count = Math.max(1, Math.min(1000, Math.round(Number(options.count) || 120)));
    const intervalMs = Math.max(0, Math.min(50, Number(options.intervalMs) || 0));
    const amplitude = Number.isFinite(Number(options.amplitude)) ? Number(options.amplitude) : 0.004;
    const fastEvery = Math.max(0, Math.round(Number(options.fastEvery) || 0));
    const fastAngle = Number.isFinite(Number(options.fastAngle)) ? Number(options.fastAngle) : 0.06;
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const quaternionForAngle = (angle) => ({
      x: 0,
      y: Math.sin(angle / 2),
      z: 0,
      w: Math.cos(angle / 2),
    });
    for (let index = 0; index < count; index += 1) {
      const fast = fastEvery > 0 && index > 0 && index % fastEvery === 0;
      const angle = fast ? fastAngle : amplitude * Math.sin(index / 3);
      await updateBluetoothGyro({
        quaternion: quaternionForAngle(angle),
        velocity: fast ? { x: 40, y: 0, z: 0 } : { x: 0, y: 0, z: 0 },
      });
      if (intervalMs > 0 && index < count - 1) await wait(intervalMs);
    }
    await wait(80);
    return {
      performance: performanceStatsSnapshot(),
      cube3d: this.cube3dStatsForTest(),
    };
  },
  state() {
    return {
      appState,
      bluetoothMoveCount: bluetoothMoveStepCount(),
      bluetoothMoves: bluetoothMoveSequence(),
      bluetoothStateCorrections: bluetoothStateCorrectionSequence(),
      bluetoothMetadata: bluetoothSolveMetadata(),
      bluetoothGyro,
      bluetooth3dPreviewEnabled,
      bluetooth3dGyroEnabled,
      bluetoothPhysicalFacelets,
      bluetoothReconnectDevices: bluetoothReconnectDevices.length,
      bluetoothSolved,
      inspection: {
        startedAt: inspectionStartedAt,
        sessionId: inspectionSessionId,
        entrySessionId: inspectionEntrySessionId,
        entryValue: document.body.dataset.inspectionEnter || '',
      },
      bluetoothState: elements.bluetoothStateMeta.textContent,
      statsChartDocumentPointerTracking,
      performance: performanceStatsSnapshot(),
      scrambleGuide: {
        supported: scrambleGuideSupported,
        completed: scrambleGuideCompleted,
        moves: scrambleGuideMoves,
        inputMoves: scrambleGuideInputMoves,
        correctPrefix: scrambleGuideCorrectPrefix,
        partialIndex: scrambleGuidePartialIndex,
        errorIndex: scrambleGuideErrorIndex,
        errorMove: scrambleGuideErrorMove,
        routeIndex: scrambleGuideRouteIndex,
        routeStateMatched: scrambleGuideRouteStateMatched,
        targetSignature: scrambleGuideTargetSignature,
        syncedSignature: cubeFaceletSignature(scrambleGuideSyncedFacelets()),
        awaitingSyncedState: scrambleGuideAwaitingSyncedState,
        correctionSolver: {
          activeKey: scrambleGuideSolverActiveKey,
          queuedKey: scrambleGuideSolverQueuedKey,
          loadingKey: scrambleGuideSolverLoadingKey,
          retryKey: scrambleGuideSolverRetryKey,
          retryCount: scrambleGuideSolverRetryCount,
          retryPending: Boolean(scrambleGuideSolverRetryTimer),
          cacheSize: scrambleGuideSolverCache.size,
          routeCacheSize: scrambleGuideCorrectionRouteByFacelets.size,
          routeSourceMatchesCurrent: scrambleGuideCorrectionRouteSourceFacelets === scrambleGuideSyncedFacelets(),
          routeHasCurrent: Boolean(scrambleGuideCorrectionRouteEntry(scrambleGuideSyncedFacelets())),
          routeCurrentMoves: (scrambleGuideCorrectionRouteMoves(scrambleGuideSyncedFacelets()) || []).join(' '),
        },
        correctionMoves: scrambleGuideCachedCorrectionMoves() || [],
        correction: (scrambleGuideCachedCorrectionMoves() || []).join(' '),
      },
      bluetoothGan: {
        mac: bluetoothGanMac,
        protocol: bluetoothGanSession?.protocol || '',
        label: bluetoothGanSession?.label || '',
        moveCounter: bluetoothGanLastMoveCounter,
        stateCounter: bluetoothGanLastStateCounter,
        fastDecodeDisabledMs: Math.max(0, Math.round(bluetoothGanFastDecodeDisabledUntil - performance.now())),
        fastDecodeFailures: bluetoothGanFastDecodeFailureCount,
      },
      bluetoothAvailability: bluetoothAvailability(),
      bluetoothRequest: bluetoothRequestSummary(bluetoothRequestOptions(false)),
      bluetoothOptionalServices,
      scrambleLocked,
    };
  },
};

function createPerformanceCounters() {
  return {
    startedAt: performance.now(),
    renderTimerCalls: 0,
    timerDisplayTicks: 0,
    inspectionDisplayTicks: 0,
    algorithmTrainerTimerTicks: 0,
    bluetoothMovesRenders: 0,
    bluetoothMovesRenderScheduled: 0,
    bluetoothMovesRenderCoalesced: 0,
    bluetoothLogEvents: 0,
    bluetoothFeedRenders: 0,
    bluetoothFeedRowUpdates: 0,
    bluetoothLogDialogRenders: 0,
    bluetoothLogDialogRowUpdates: 0,
    bluetoothMoveLogSkipped: 0,
    ganPackets: 0,
    ganInlinePackets: 0,
    ganInlineSyncPackets: 0,
    ganInlineAsyncPackets: 0,
    ganQueuedPackets: 0,
    ganProcessedQueuedPackets: 0,
    ganSyncProcessedPackets: 0,
    ganAsyncProcessedPackets: 0,
    ganPacketDrainYields: 0,
    ganPacketQueueMaxDepth: 0,
    ganPacketQueueErrors: 0,
    ganMacFastPathHits: 0,
    ganGyroFastPathPackets: 0,
    ganSkippedGyroPackets: 0,
    ganSkippedBackloggedGyroPackets: 0,
    ganAcceptedGyroSamples: 0,
    ganRejectedGyroSamples: 0,
    ganSkippedUnchangedStatePackets: 0,
    cube3dMoveFrames: 0,
    cube3dGyroFastFrames: 0,
    cube3dGyroCalmFrames: 0,
    cube3dGyroSettleFrames: 0,
    cube3dDirtyFrames: 0,
    cube3dStickerUpdates: 0,
    cube3dMovePulseFrames: 0,
    cube3dMovePulseCoalesced: 0,
    scrambleTextRenders: 0,
    scrambleGuideMetaRenders: 0,
    scrambleGuideNodeUpdates: 0,
    scrambleGuideLocalSolverHits: 0,
    scrambleGuideLocalSolverMisses: 0,
    scrambleGuideLocalSolverSkipped: 0,
    scrambleGuideCorrectionDeferredRenders: 0,
    scrambleGuidePhysicalSyncSkips: 0,
    scrambleGuideLocalSolverTotalMs: 0,
    scrambleGuideLocalSolverLastMs: 0,
    scrambleGuideLocalSolverMaxMs: 0,
    scrambleGuideLocalSolverWarmups: 0,
    scrambleGuideLocalSolverWarmupMs: 0,
    scrambleGuideServerSolverWarmups: 0,
    scrambleGuideServerSolverWarmupErrors: 0,
    scrambleGuideServerSolverWarmupMs: 0,
    scrambleGuideSolverRequests: 0,
    scrambleGuideSolverCompleted: 0,
    scrambleGuideSolverErrors: 0,
    scrambleGuideSolverAborted: 0,
    scrambleGuideSolverCoalesced: 0,
    scrambleGuideSolverRetries: 0,
    scrambleGuideSolverTotalWallMs: 0,
    scrambleGuideSolverLastWallMs: 0,
    scrambleGuideSolverMaxWallMs: 0,
  };
}

function resetPerformanceCounters() {
  performanceCounters = createPerformanceCounters();
  if (cube3d) {
    cube3d.renderCount = 0;
    cube3d.lastFrameDeltaMs = 0;
  }
}

function incrementPerformanceCounter(key, amount = 1) {
  if (!Object.hasOwn(performanceCounters, key)) return;
  performanceCounters[key] += amount;
}

function recordScrambleGuideSolverWallTime(durationMs, success) {
  performanceCounters.scrambleGuideSolverLastWallMs = durationMs;
  performanceCounters.scrambleGuideSolverMaxWallMs = Math.max(
    performanceCounters.scrambleGuideSolverMaxWallMs,
    durationMs,
  );
  if (success) {
    performanceCounters.scrambleGuideSolverCompleted += 1;
    performanceCounters.scrambleGuideSolverTotalWallMs += durationMs;
  } else {
    performanceCounters.scrambleGuideSolverErrors += 1;
  }
}

function recordScrambleGuideLocalSolver(durationMs, hit) {
  performanceCounters.scrambleGuideLocalSolverLastMs = durationMs;
  performanceCounters.scrambleGuideLocalSolverMaxMs = Math.max(
    performanceCounters.scrambleGuideLocalSolverMaxMs,
    durationMs,
  );
  performanceCounters.scrambleGuideLocalSolverTotalMs += durationMs;
  if (hit) performanceCounters.scrambleGuideLocalSolverHits += 1;
  else performanceCounters.scrambleGuideLocalSolverMisses += 1;
}

function recordScrambleGuideLocalSolverWarmup(durationMs, warmed) {
  performanceCounters.scrambleGuideLocalSolverWarmups += 1;
  performanceCounters.scrambleGuideLocalSolverWarmupMs = durationMs;
  if (warmed) scrambleGuideLocalSolverWarmed = true;
}

function recordScrambleGuideServerSolverWarmup(durationMs, warmed) {
  performanceCounters.scrambleGuideServerSolverWarmups += 1;
  performanceCounters.scrambleGuideServerSolverWarmupMs = durationMs;
  if (warmed) scrambleGuideServerSolverWarmed = true;
}

function recordScrambleGuideServerSolverWarmupError() {
  performanceCounters.scrambleGuideServerSolverWarmupErrors += 1;
}

function warmScrambleGuideLocalSolver(maxMs = scrambleGuideLocalCorrectionWarmupMaxMs) {
  if (scrambleGuideLocalSolverWarmed) return true;
  const startedAt = performance.now();
  let warmed = false;
  try {
    warmed = warmShortCorrectionSearch({
      maxDepth: scrambleGuideLocalCorrectionMaxDepth,
      maxMs,
      maxNodes: scrambleGuideLocalCorrectionMaxNodes,
    });
  } catch {
    warmed = false;
  }
  recordScrambleGuideLocalSolverWarmup(performance.now() - startedAt, warmed);
  return warmed;
}

function scheduleScrambleGuideLocalSolverWarmup(options = {}) {
  if (scrambleGuideLocalSolverWarmupScheduled || scrambleGuideLocalSolverWarmed) return;
  scrambleGuideLocalSolverWarmupScheduled = true;
  const warm = () => {
    scrambleGuideLocalSolverWarmupScheduled = false;
    warmScrambleGuideLocalSolver();
  };
  if (!options.immediate && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warm, { timeout: scrambleGuideLocalCorrectionWarmupTimeoutMs });
    return;
  }
  window.setTimeout(warm, options.immediate ? 0 : scrambleGuideLocalCorrectionWarmupDelayMs);
}

function scheduleScrambleGuideLocalSolverWarmupWhenUseful() {
  if (!scrambleGuideSupported || !bluetoothScrambleGuideActive()) return;
  scheduleScrambleGuideLocalSolverWarmup();
}

function scheduleScrambleGuideServerSolverWarmupWhenUseful() {
  if (
    !scrambleGuideSupported
    || !bluetoothScrambleGuideActive()
    || scrambleGuideServerSolverWarmupScheduled
    || scrambleGuideServerSolverWarmed
  ) return;
  scrambleGuideServerSolverWarmupScheduled = true;
  const startedAt = performance.now();
  postJson('/api/cube-correction/warmup', {})
    .then((result) => {
      recordScrambleGuideServerSolverWarmup(
        performance.now() - startedAt,
        result?.warmed === true,
      );
    })
    .catch(() => {
      recordScrambleGuideServerSolverWarmupError();
    })
    .finally(() => {
      scrambleGuideServerSolverWarmupScheduled = false;
    });
}

function performanceStatsSnapshot() {
  const elapsedMs = Math.max(1, performance.now() - performanceCounters.startedAt);
  const elapsedSeconds = elapsedMs / 1000;
  const rate = (count) => Number((count / elapsedSeconds).toFixed(2));
  const solverAverage = performanceCounters.scrambleGuideSolverCompleted > 0
    ? performanceCounters.scrambleGuideSolverTotalWallMs / performanceCounters.scrambleGuideSolverCompleted
    : 0;
  return {
    elapsedMs: Math.round(elapsedMs),
    ratesPerSecond: {
      ganPackets: rate(performanceCounters.ganPackets),
      ganInlinePackets: rate(performanceCounters.ganInlinePackets),
      ganInlineSyncPackets: rate(performanceCounters.ganInlineSyncPackets),
      ganInlineAsyncPackets: rate(performanceCounters.ganInlineAsyncPackets),
      ganQueuedPackets: rate(performanceCounters.ganQueuedPackets),
      ganProcessedQueuedPackets: rate(performanceCounters.ganProcessedQueuedPackets),
      ganSyncProcessedPackets: rate(performanceCounters.ganSyncProcessedPackets),
      ganAsyncProcessedPackets: rate(performanceCounters.ganAsyncProcessedPackets),
      ganPacketDrainYields: rate(performanceCounters.ganPacketDrainYields),
      ganMacFastPathHits: rate(performanceCounters.ganMacFastPathHits),
      ganGyroFastPathPackets: rate(performanceCounters.ganGyroFastPathPackets),
      ganSkippedGyroPackets: rate(performanceCounters.ganSkippedGyroPackets),
      ganSkippedBackloggedGyroPackets: rate(performanceCounters.ganSkippedBackloggedGyroPackets),
      ganAcceptedGyroSamples: rate(performanceCounters.ganAcceptedGyroSamples),
      ganRejectedGyroSamples: rate(performanceCounters.ganRejectedGyroSamples),
      ganSkippedUnchangedStatePackets: rate(performanceCounters.ganSkippedUnchangedStatePackets),
      cube3dMoveFrames: rate(performanceCounters.cube3dMoveFrames),
      cube3dGyroFastFrames: rate(performanceCounters.cube3dGyroFastFrames),
      cube3dGyroCalmFrames: rate(performanceCounters.cube3dGyroCalmFrames),
      cube3dGyroSettleFrames: rate(performanceCounters.cube3dGyroSettleFrames),
      cube3dDirtyFrames: rate(performanceCounters.cube3dDirtyFrames),
      cube3dStickerUpdates: rate(performanceCounters.cube3dStickerUpdates),
      cube3dMovePulseFrames: rate(performanceCounters.cube3dMovePulseFrames),
      cube3dMovePulseCoalesced: rate(performanceCounters.cube3dMovePulseCoalesced),
      bluetoothLogEvents: rate(performanceCounters.bluetoothLogEvents),
      bluetoothFeedRenders: rate(performanceCounters.bluetoothFeedRenders),
      bluetoothFeedRowUpdates: rate(performanceCounters.bluetoothFeedRowUpdates),
      bluetoothLogDialogRowUpdates: rate(performanceCounters.bluetoothLogDialogRowUpdates),
      bluetoothMoveLogSkipped: rate(performanceCounters.bluetoothMoveLogSkipped),
      bluetoothMovesRenders: rate(performanceCounters.bluetoothMovesRenders),
      bluetoothMovesRenderScheduled: rate(performanceCounters.bluetoothMovesRenderScheduled),
      bluetoothMovesRenderCoalesced: rate(performanceCounters.bluetoothMovesRenderCoalesced),
      timerDisplayTicks: rate(performanceCounters.timerDisplayTicks),
      inspectionDisplayTicks: rate(performanceCounters.inspectionDisplayTicks),
      algorithmTrainerTimerTicks: rate(performanceCounters.algorithmTrainerTimerTicks),
      scrambleTextRenders: rate(performanceCounters.scrambleTextRenders),
      scrambleGuideMetaRenders: rate(performanceCounters.scrambleGuideMetaRenders),
      scrambleGuideNodeUpdates: rate(performanceCounters.scrambleGuideNodeUpdates),
      scrambleGuideLocalSolverHits: rate(performanceCounters.scrambleGuideLocalSolverHits),
      scrambleGuideLocalSolverMisses: rate(performanceCounters.scrambleGuideLocalSolverMisses),
      scrambleGuideLocalSolverSkipped: rate(performanceCounters.scrambleGuideLocalSolverSkipped),
      scrambleGuideCorrectionDeferredRenders: rate(performanceCounters.scrambleGuideCorrectionDeferredRenders),
      scrambleGuidePhysicalSyncSkips: rate(performanceCounters.scrambleGuidePhysicalSyncSkips),
      scrambleGuideServerSolverWarmups: rate(performanceCounters.scrambleGuideServerSolverWarmups),
      scrambleGuideServerSolverWarmupErrors: rate(performanceCounters.scrambleGuideServerSolverWarmupErrors),
      scrambleGuideSolverRetries: rate(performanceCounters.scrambleGuideSolverRetries),
      cube3dRenders: rate(cube3d?.renderCount || 0),
      renderTimerCalls: rate(performanceCounters.renderTimerCalls),
    },
    totals: {
      ...performanceCounters,
      cube3dRenders: cube3d?.renderCount || 0,
      cube3dHasFrame: Boolean(cube3dAnimationFrame),
      cube3dHasTimer: Boolean(cube3dAnimationTimer),
      ganPacketQueueLength: ganBluetoothPacketQueueLength(),
      ganPacketQueueBackingLength: bluetoothGanPacketQueue.length,
      scheduledBluetoothLogRender: Boolean(bluetoothLogRenderFrame || bluetoothLogRenderTimer),
    },
    solver: {
      localHits: performanceCounters.scrambleGuideLocalSolverHits,
      localMisses: performanceCounters.scrambleGuideLocalSolverMisses,
      localSkipped: performanceCounters.scrambleGuideLocalSolverSkipped,
      localAverageMs: Number((
        performanceCounters.scrambleGuideLocalSolverHits + performanceCounters.scrambleGuideLocalSolverMisses > 0
          ? performanceCounters.scrambleGuideLocalSolverTotalMs
            / (performanceCounters.scrambleGuideLocalSolverHits + performanceCounters.scrambleGuideLocalSolverMisses)
          : 0
      ).toFixed(3)),
      localLastMs: Number(performanceCounters.scrambleGuideLocalSolverLastMs.toFixed(3)),
      localMaxMs: Number(performanceCounters.scrambleGuideLocalSolverMaxMs.toFixed(3)),
      localWarmups: performanceCounters.scrambleGuideLocalSolverWarmups,
      localWarmupMs: Number(performanceCounters.scrambleGuideLocalSolverWarmupMs.toFixed(3)),
      localWarmed: scrambleGuideLocalSolverWarmed,
      serverWarmups: performanceCounters.scrambleGuideServerSolverWarmups,
      serverWarmupErrors: performanceCounters.scrambleGuideServerSolverWarmupErrors,
      serverWarmupMs: Number(performanceCounters.scrambleGuideServerSolverWarmupMs.toFixed(3)),
      serverWarmed: scrambleGuideServerSolverWarmed,
      requests: performanceCounters.scrambleGuideSolverRequests,
      completed: performanceCounters.scrambleGuideSolverCompleted,
      errors: performanceCounters.scrambleGuideSolverErrors,
      aborted: performanceCounters.scrambleGuideSolverAborted,
      coalesced: performanceCounters.scrambleGuideSolverCoalesced,
      retries: performanceCounters.scrambleGuideSolverRetries,
      retryPending: Boolean(scrambleGuideSolverRetryTimer),
      retryCount: scrambleGuideSolverRetryCount,
      averageWallMs: Number(solverAverage.toFixed(3)),
      lastWallMs: Number(performanceCounters.scrambleGuideSolverLastWallMs.toFixed(3)),
      maxWallMs: Number(performanceCounters.scrambleGuideSolverMaxWallMs.toFixed(3)),
    },
  };
}

document.addEventListener('keydown', handleShortcutRecordingKeyDown, true);
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
document.addEventListener('click', closeHistoryMenuOnOutsideClick);

await bootstrap();

async function bootstrap() {
  try {
    const data = await getJson(`/api/bootstrap?${new URLSearchParams({ puzzle: scramblePuzzle, historyOnly: '1' }).toString()}`);
    scramble = data.scramble || null;
    solves = Array.isArray(data.solves) ? data.solves : [];
    sessions = Array.isArray(data.sessions) ? data.sessions : [];
    historyPartial = data.historyPartial === true;
    historyTotal = Number.isFinite(Number(data.historyTotal)) ? Math.max(0, Math.round(Number(data.historyTotal))) : solves.length;
    bootstrapSessionSummaries = data.sessionSummaries && typeof data.sessionSummaries === 'object'
      ? data.sessionSummaries
      : null;
    if (!sessions.some((session) => session.id === currentSessionId)) currentSessionId = 'default';
    applyCurrentSessionPuzzle(scramble?.puzzle || scramblePuzzle);
    resetScrambleGuide();
    elements.historyPath.textContent = data.historyPath;
    appState = scramble?.scramble ? 'ready' : 'loading';
    render();
    setBluetoothConnectedState(false);
    void loadScramble({ force: true, markReady: true });
    scheduleFullHistoryLoad();
    void refreshBluetoothReconnectDevices().then(() => autoReconnectBluetoothCube());
  } catch (error) {
    appState = 'error';
    elements.statusText.textContent = '无法连接本地服务';
    elements.statusText.classList.add('error');
    elements.timerHint.textContent = error.message;
  }
}

function scheduleFullHistoryLoad() {
  const loadHistory = () => {
    void loadFullHistoryInBackground();
  };
  if ('requestIdleCallback' in window) {
    window.setTimeout(() => {
      window.requestIdleCallback(loadHistory, { timeout: 3200 });
    }, 1200);
    return;
  }
  window.setTimeout(loadHistory, 1800);
}

async function loadFullHistoryInBackground() {
  const requestId = fullHistoryRequestId + 1;
  fullHistoryRequestId = requestId;
  const solveCountAtStart = solves.length;
  try {
    const data = await getJson('/api/solves');
    if (requestId !== fullHistoryRequestId) return;
    const nextSolves = Array.isArray(data.solves) ? data.solves : solves;
    if (solves.length > solveCountAtStart && solves.length > nextSolves.length) return;
    solves = nextSolves;
    sessions = Array.isArray(data.sessions) ? data.sessions : sessions;
    historyPartial = false;
    historyTotal = solves.length;
    bootstrapSessionSummaries = data.sessionSummaries && typeof data.sessionSummaries === 'object'
      ? data.sessionSummaries
      : null;
    fullHistoryLoaded = true;
    if (data.historyPath) elements.historyPath.textContent = data.historyPath;
    render();
  } catch (error) {
    console.warn('完整历史后台加载失败', error);
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

  if (handleEscapeKey(event)) return;

  if (appState === 'done' && handleDoneQuickAction(event)) return;

  if (shortcutMatches(event, 'lockScramble') && canToggleScrambleLock()) {
    event.preventDefault();
    toggleScrambleLock();
    return;
  }

  if (handleGlobalShortcut(event)) return;

  const timerKey = shortcutMatches(event, 'timer');
  if (!timerKey && appState === 'timing') {
    event.preventDefault();
    finishTiming();
    return;
  }

  if (!timerKey) return;
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

function handleEscapeKey(event) {
  if (!shortcutMatches(event, 'cancel')) return false;

  if (appState === 'inspection' || (appState === 'hold' && holdReturnState === 'inspection')) {
    event.preventDefault();
    cancelInspection();
    return true;
  }

  if (appState === 'timing') {
    event.preventDefault();
    activePenalty = 'dnf';
    finishTiming();
    return true;
  }

  return false;
}

function handleGlobalShortcut(event) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (['timing', 'inspection', 'hold', 'saving', 'loading', 'error'].includes(appState)) return false;

  if (shortcutMatches(event, 'next')) {
    event.preventDefault();
    void nextSolve();
    return true;
  }

  if (shortcutMatches(event, 'scramble') && !scrambleChangeLocked()) {
    event.preventDefault();
    void loadScramble();
    return true;
  }

  if (shortcutMatches(event, 'copyScramble') && scramble?.scramble) {
    event.preventDefault();
    void copyCurrentScramble();
    return true;
  }

  if (shortcutMatches(event, 'trainer')) {
    event.preventDefault();
    openAlgorithmTrainerDialog();
    return true;
  }

  if (shortcutMatches(event, 'inspection') && !elements.inspectionToggle.disabled) {
    event.preventDefault();
    setInspectionEnabled(!inspectionEnabled);
    return true;
  }

  if (shortcutMatches(event, 'stats') && filteredSolves().length > 0) {
    event.preventDefault();
    openStatsDialog();
    return true;
  }

  if (shortcutMatches(event, 'allSolves') && solves.length > 0) {
    event.preventDefault();
    openAllSolvesDialog();
    return true;
  }

  if (shortcutMatches(event, 'preferences')) {
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
  const actions = [
    ['lastOk', () => updateLatestSolvePenalty('ok')],
    ['lastPlusTwo', () => updateLatestSolvePenalty('+2')],
    ['lastDnf', () => updateLatestSolvePenalty('dnf')],
    ['deleteLast', deleteLatestSolve],
  ];
  const action = actions.find(([shortcutId]) => shortcutMatches(event, shortcutId))?.[1];
  if (!action) return false;
  event.preventDefault();
  action();
  return true;
}

function handleKeyUp(event) {
  if (shouldIgnoreTimerKey(event)) return;

  if (!shortcutMatches(event, 'timer')) return;
  event.preventDefault();

  if (appState !== 'hold') return;
  if (performance.now() - holdStartedAt >= holdToStartMs) {
    startTiming();
  } else {
    cancelHold();
  }
}

function shortcutCodeFor(actionId) {
  const definition = shortcutDefinitionById.get(actionId);
  return keyboardShortcuts[actionId] || definition?.defaultCode || '';
}

function shortcutMatches(event, actionId) {
  const definition = shortcutDefinitionById.get(actionId);
  if (!definition || !event?.code) return false;
  const code = shortcutCodeFor(actionId);
  if (event.code === code) return true;
  return code === definition.defaultCode && Array.isArray(definition.aliases) && definition.aliases.includes(event.code);
}

function loadKeyboardShortcuts() {
  const shortcuts = Object.fromEntries(shortcutDefinitions.map((definition) => [definition.id, definition.defaultCode]));
  try {
    const saved = JSON.parse(localStorage.getItem('trainTimer.shortcuts') || '{}');
    if (saved && typeof saved === 'object') {
      for (const definition of shortcutDefinitions) {
        if (typeof saved[definition.id] === 'string' && saved[definition.id]) shortcuts[definition.id] = saved[definition.id];
      }
    }
  } catch {
    // Ignore malformed shortcut preferences and keep defaults.
  }
  return shortcuts;
}

function saveKeyboardShortcuts() {
  localStorage.setItem('trainTimer.shortcuts', JSON.stringify(keyboardShortcuts));
}

function handleShortcutGridClick(event) {
  const button = event.target?.closest?.('[data-shortcut-id]');
  if (!button) return;
  recordingShortcutId = button.dataset.shortcutId || '';
  renderShortcutSettings();
  button.focus();
  elements.timerSettingsMeta.textContent = '按下新的快捷键；Esc 可取消本次设置';
}

function handleShortcutRecordingKeyDown(event) {
  if (!recordingShortcutId) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.code === 'Escape') {
    recordingShortcutId = '';
    renderTimerSettingsDialog();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    elements.timerSettingsMeta.textContent = '快捷键暂只支持单键，不支持 Ctrl / Option / Command 组合';
    return;
  }
  const nextCode = event.code;
  const conflict = shortcutDefinitions.find((definition) => (
    definition.id !== recordingShortcutId && shortcutCodeFor(definition.id) === nextCode
  ));
  if (conflict) {
    elements.timerSettingsMeta.textContent = `快捷键冲突：${shortcutLabel(nextCode)} 已用于「${conflict.label}」`;
    return;
  }
  keyboardShortcuts = {
    ...keyboardShortcuts,
    [recordingShortcutId]: nextCode,
  };
  saveKeyboardShortcuts();
  recordingShortcutId = '';
  renderTimerSettingsDialog();
}

function resetKeyboardShortcuts() {
  keyboardShortcuts = Object.fromEntries(shortcutDefinitions.map((definition) => [definition.id, definition.defaultCode]));
  recordingShortcutId = '';
  saveKeyboardShortcuts();
  renderTimerSettingsDialog();
}

function renderShortcutSettings() {
  if (!elements.timerShortcutGrid) return;
  elements.timerShortcutGrid.replaceChildren(
    ...shortcutDefinitions.map((definition) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'timer-shortcut-button';
      button.dataset.shortcutId = definition.id;
      button.classList.toggle('recording', recordingShortcutId === definition.id);
      button.setAttribute('aria-pressed', recordingShortcutId === definition.id ? 'true' : 'false');
      button.title = recordingShortcutId === definition.id
        ? '按下新的快捷键，Esc 取消'
        : `点击设置「${definition.label}」快捷键`;

      const key = document.createElement('kbd');
      key.textContent = recordingShortcutId === definition.id ? '按键...' : shortcutLabel(shortcutCodeFor(definition.id));
      const label = document.createElement('em');
      label.textContent = definition.label;
      button.append(key, label);
      return button;
    }),
  );
}

function shortcutLabel(code) {
  const labels = {
    Space: 'Space',
    Escape: 'Esc',
    Delete: 'Del',
    Backspace: 'Backspace',
    Enter: 'Enter',
    Tab: 'Tab',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  };
  if (labels[code]) return labels[code];
  const keyMatch = /^Key([A-Z])$/.exec(code);
  if (keyMatch) return keyMatch[1];
  const digitMatch = /^Digit(\d)$/.exec(code);
  if (digitMatch) return digitMatch[1];
  const numpadMatch = /^Numpad(\d)$/.exec(code);
  if (numpadMatch) return `Num ${numpadMatch[1]}`;
  return String(code || '-').replace(/^Numpad/, 'Num ');
}

function clearTimerTick() {
  window.clearTimeout(timerFrame);
  timerFrame = null;
}

function clearInspectionTick() {
  window.clearTimeout(inspectionFrame);
  inspectionFrame = null;
}

function clearHoldTick() {
  window.clearTimeout(holdFrame);
  holdFrame = null;
}

function pageVisible() {
  return document.visibilityState !== 'hidden';
}

function handleDocumentVisibilityChange() {
  if (pageVisible()) {
    resumeVisibleDisplayTicks();
    scheduleBluetoothMovesRender();
    scheduleBluetoothLogRender({ immediate: true });
    markBluetoothCube3dDirty();
    if (bluetoothPendingGyro) scheduleBluetoothGyroUpdate();
    return;
  }
  pauseHiddenDisplayTicks();
  cancelScheduledBluetoothLogRender();
  cancelScheduledBluetoothMovesRender();
  cancelBluetoothGyroUpdate();
  stopBluetoothCube3dAnimation();
  stopBluetoothCube3dTelemetryRender();
}

function resumeVisibleDisplayTicks() {
  if (appState === 'timing') {
    clearTimerTick();
    tickTimer();
  } else if (appState === 'inspection') {
    clearInspectionTick();
    inspectionTick();
  } else if (appState === 'hold') {
    clearHoldTick();
    holdTick();
  } else {
    renderTimer();
  }

  if (algorithmTrainerTimerStartedAt > 0) {
    clearAlgorithmTrainerTimerTick();
    tickAlgorithmTrainerTimer();
  }
}

function pauseHiddenDisplayTicks() {
  clearTimerTick();
  clearInspectionTick();
  clearHoldTick();
  clearAlgorithmTrainerTimerTick();
}

function scheduleInspectionTick(delayMs = inspectionDisplayFrameMs) {
  clearInspectionTick();
  if (!pageVisible()) return;
  inspectionFrame = window.setTimeout(inspectionTick, Math.max(0, delayMs));
}

function scheduleHoldTick(delayMs = holdDisplayFrameMs) {
  clearHoldTick();
  if (!pageVisible()) return;
  holdFrame = window.setTimeout(holdTick, Math.max(0, delayMs));
}

function scheduleTimerTick(delayMs = timerDisplayFrameMs) {
  clearTimerTick();
  if (!pageVisible()) return;
  timerFrame = window.setTimeout(tickTimer, Math.max(0, delayMs));
}

function startInspection(options = {}) {
  const now = performance.now();
  const enteringInspection = appState !== 'inspection' || inspectionStartedAt <= 0;
  appState = 'inspection';
  activeInspectionUsed = true;
  if (options.bluetoothGuardMs) {
    inspectionBluetoothStartBlockedUntil = Math.max(
      inspectionBluetoothStartBlockedUntil,
      now + options.bluetoothGuardMs,
    );
  } else if (enteringInspection) {
    inspectionBluetoothStartBlockedUntil = 0;
  }

  if (enteringInspection) {
    inspectionSessionId += 1;
    inspectionStartedAt = now;
    reminded = new Set();
    activePenalty = 'ok';
    clearInspectionTick();
    triggerInspectionEntryAnimation(inspectionSessionId);
    scheduleInspectionTick();
  }
  renderTimer();
}

function cancelInspection() {
  clearInspectionTick();
  clearHoldTick();
  clearInspectionEntryAnimation();
  inspectionStartedAt = 0;
  inspectionBluetoothStartBlockedUntil = 0;
  activeInspectionUsed = false;
  activePenalty = 'ok';
  holdConfirmed = false;
  holdReturnState = 'ready';
  reminded.clear();
  appState = 'ready';
  render();
}

function triggerInspectionEntryAnimation(sessionId) {
  if (!sessionId || inspectionEntrySessionId === sessionId) return;
  inspectionEntrySessionId = sessionId;
  window.clearTimeout(inspectionEntryTimer);
  inspectionEntryTimer = 0;
  document.body.dataset.inspectionEnter = String(sessionId);
}

function clearInspectionEntryAnimation() {
  window.clearTimeout(inspectionEntryTimer);
  inspectionEntryTimer = 0;
  inspectionEntrySessionId = 0;
  delete document.body.dataset.inspectionEnter;
}

function inspectionTick() {
  if (appState !== 'inspection') return;

  updateInspectionReminders();
  renderInspectionTimerTick();
  scheduleInspectionTick();
}

function renderInspectionTimerTick() {
  incrementPerformanceCounter('inspectionDisplayTicks');
  const elapsed = inspectionElapsedSeconds();
  const penalty = inspectionPenaltyForElapsed(elapsed);
  setElementText(elements.statusText, penalty === 'ok' ? '观察中' : '观察超时');
  setTimerDisplayText(inspectionDisplayForElapsed(elapsed));
  setElementText(
    elements.timerHint,
    penalty === 'ok'
      ? '长按 Space 超过 0.5s，松开开始计时 · Esc 退出观察'
      : `长按 Space 后松开开始计时，本次 ${penalty.toUpperCase()}`,
  );
}

function updateInspectionReminders() {
  if (!activeInspectionUsed || inspectionStartedAt === 0) return;
  const elapsedFloor = Math.floor(inspectionElapsedSeconds());
  if (reminderSeconds.has(elapsedFloor) && !reminded.has(elapsedFloor)) {
    reminded.add(elapsedFloor);
    beep();
  }
}

function inspectionElapsedSeconds() {
  return (performance.now() - inspectionStartedAt) / 1000;
}

function startHold() {
  holdReturnState = appState === 'inspection' ? 'inspection' : 'ready';
  clearInspectionTick();
  clearHoldTick();
  appState = 'hold';
  holdStartedAt = performance.now();
  holdConfirmed = false;
  holdTick();
}

function holdTick() {
  if (appState !== 'hold') return;
  if (holdReturnState === 'inspection') updateInspectionReminders();
  const nextConfirmed = performance.now() - holdStartedAt >= holdToStartMs;
  if (nextConfirmed !== holdConfirmed) {
    holdConfirmed = nextConfirmed;
    renderTimer();
  } else if (!holdConfirmed || holdReturnState === 'inspection') {
    renderTimer();
  }
  scheduleHoldTick();
}

function cancelHold() {
  clearHoldTick();
  appState = holdReturnState;
  holdConfirmed = false;
  if (appState === 'inspection') {
    renderTimer();
    scheduleInspectionTick();
  } else {
    renderTimer();
  }
}

function startTiming() {
  clearBluetoothNextSolveGestureCandidate();
  clearInspectionEntryAnimation();
  clearInspectionTick();
  clearHoldTick();
  clearTimerTick();
  activePenalty = currentInspectionPenalty();
  finishSource = 'manual';
  appState = 'timing';
  startedAt = performance.now();
  timerStartedAtMs = Date.now();
  timerStartedAtIsoTime = new Date(timerStartedAtMs).toISOString();
  armBluetoothSolveTracking();
  renderTimer();
  renderQuickActions();
  renderScramble({ skipBluetooth3dCurrent: true });
  scheduleNextTimingTick();
}

function tickTimer() {
  if (appState !== 'timing') return;
  renderTimingTimerTick();
  scheduleNextTimingTick();
}

function renderTimingTimerTick() {
  incrementPerformanceCounter('timerDisplayTicks');
  const elapsedMs = performance.now() - startedAt;
  setTimerDisplayText(timingDisplayText(elapsedMs));
  setElementText(elements.timerHint, timerDisplayModeHint(elapsedMs) || '按任意键结束本次计时 · Esc 记为 DNF');
}

function scheduleNextTimingTick() {
  if (appState !== 'timing') return;
  const delay = timingTimerTickDelay(performance.now() - startedAt);
  if (delay == null) {
    clearTimerTick();
    return;
  }
  scheduleTimerTick(delay);
}

function timingTimerTickDelay(elapsedMs = performance.now() - startedAt) {
  if (hideTimerWhileSolving) return null;
  if (timerFreezeMs > 0 && elapsedMs < timerFreezeMs) {
    return Math.max(1, timerFreezeMs - elapsedMs + 1);
  }
  return timerDisplayFrameMs;
}

async function finishTiming(options = {}) {
  if (appState !== 'timing') return;
  clearTimerTick();
  const finishedAt = Number.isFinite(options.finishedAt) ? options.finishedAt : performance.now();
  const durationMs = Math.max(0, finishedAt - startedAt);
  const timerFinishedAtMs = timerStartedAtMs > 0 ? timerStartedAtMs + Math.round(durationMs) : Date.now();
  const timerFinishedAtIsoTime = new Date(timerFinishedAtMs).toISOString();
  appState = 'saving';
  setTimerDisplayText(formatTime(durationMs));
  elements.statusText.textContent = finishSource === 'bluetooth' ? '蓝牙复原' : '保存中';
  elements.timerHint.textContent = finishSource === 'bluetooth' ? '检测到已复原，正在写入成绩' : '正在写入成绩';
  await nextPaintOrTimeout();
  render();
  const bluetoothMetadata = bluetoothSolveMetadata();
  const bluetoothMovesForSave = bluetoothMoveSequence();
  const bluetoothMoveLogForSave = bluetoothMoveRecordSequence();
  const bluetoothStateCorrectionsForSave = bluetoothStateCorrectionSequence();
  const cfopStages = cfopStagesForSave({
    scramble: scramble.scramble,
    scramblePuzzle: scramble.puzzle || scramblePuzzle,
    bluetoothMoves: bluetoothMovesForSave,
    bluetoothMoveLog: bluetoothMoveLogForSave,
    bluetoothStateCorrections: bluetoothStateCorrectionsForSave,
    bluetoothSolvedByStatePacket,
  });
  const opEvents = opEventsForSave({
    scramble: scramble.scramble,
    scramblePuzzle: scramble.puzzle || scramblePuzzle,
    timerStartedAt: timerStartedAtIsoTime,
    timerStartedAtMs,
    bluetoothMoves: bluetoothMovesForSave,
    bluetoothMoveLog: bluetoothMoveLogForSave,
    bluetoothStateCorrections: bluetoothStateCorrectionsForSave,
    bluetoothSolvedByStatePacket,
  });

  const data = await postJson('/api/solves', {
    durationMs,
    createdAt: timerFinishedAtIsoTime,
    timerStartedAt: timerStartedAtIsoTime,
    timerStartedAtMs,
    timerFinishedAt: timerFinishedAtIsoTime,
    timerFinishedAtMs,
    scramble: scramble.scramble,
    scrambleSource: scramble.source,
    scramblePuzzle: scramble.puzzle || scramblePuzzle,
    inspectionEnabled: activeInspectionUsed,
    sessionId: currentSessionId,
    penalty: activePenalty,
    timerSource: finishSource,
    bluetoothMoves: bluetoothMovesForSave,
    bluetoothMoveLog: bluetoothMoveLogForSave,
    bluetoothStateCorrections: bluetoothStateCorrectionsForSave,
    bluetoothSolvedByStatePacket,
    cfopStages,
    opEvents,
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
  enqueuePbToasts(marks.map((mark) => ({
    title: pbToastRecordTitle(mark),
    meta: timeOrDash(mark.value),
    celebrate: mark.type === 'single' || mark.type === 'ao5',
  })));
}

function pbToastRecordTitle(mark) {
  const labels = {
    single: '单次 PB',
    mo3: 'mo3 PB',
    ao5: 'ao5 PB',
    ao12: 'ao12 PB',
    ao50: 'ao50 PB',
    ao100: 'ao100 PB',
  };
  return labels[mark?.type] || 'PB';
}

function enqueuePbToasts(items) {
  const nextItems = items
    .filter((item) => item?.title && item?.meta)
    .map((item) => ({
      title: String(item.title),
      meta: String(item.meta),
      celebrate: item.celebrate === true,
    }));
  if (nextItems.length === 0) return;
  pbToastQueue.push(...nextItems);
  updatePbToastQueueIndicator();
  if (!pbToastActive) showNextPbToast();
}

function showNextPbToast() {
  if (!elements.pbToast) return;
  const item = pbToastQueue.shift();
  if (!item) {
    pbToastActive = false;
    updatePbToastQueueIndicator();
    return;
  }
  pbToastActive = true;
  window.clearTimeout(pbToastTimer);
  elements.pbToast.dataset.celebrate = item.celebrate ? 'true' : 'false';
  elements.pbToastTitle.textContent = item.title;
  elements.pbToastMeta.textContent = item.meta;
  elements.pbToast.hidden = false;
  elements.pbToast.classList.remove('visible');
  updatePbToastQueueIndicator();
  if (item.celebrate) launchPbConfetti();
  requestAnimationFrame(() => elements.pbToast.classList.add('visible'));
  pbToastTimer = window.setTimeout(() => {
    elements.pbToast.classList.remove('visible');
    pbToastTimer = window.setTimeout(() => {
      elements.pbToast.hidden = true;
      showNextPbToast();
    }, pbToastExitMs);
  }, pbToastVisibleMs);
}

function updatePbToastQueueIndicator() {
  if (!elements.pbToastQueue) return;
  const queuedCount = pbToastQueue.length;
  elements.pbToastQueue.hidden = queuedCount === 0;
  elements.pbToastQueue.textContent = queuedCount > 0 ? `+${queuedCount}` : '';
}

function launchPbConfetti() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  window.clearTimeout(pbConfettiTimer);
  document.querySelector('.pb-confetti')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'pb-confetti';
  overlay.setAttribute('aria-hidden', 'true');
  const colors = ['#00c7d9', '#34c759', '#ffcc00', '#ff375f', '#64d2ff', '#bf5af2', '#ff9f0a'];
  const pieceCount = Math.min(126, Math.max(72, Math.round(window.innerWidth / 12)));
  const maxDistance = Math.max(240, Math.min(window.innerWidth, 1180) * 0.58);
  const fallDistance = Math.max(380, window.innerHeight * 0.72);

  for (let index = 0; index < pieceCount; index += 1) {
    const piece = document.createElement('i');
    piece.className = 'pb-confetti-piece';
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * maxDistance;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance * 0.58 - 90 - Math.random() * 120;
    const wind = (Math.random() - 0.5) * 220;
    const width = 7 + Math.random() * 9;
    const height = 10 + Math.random() * 18;
    const rotateStart = Math.round(Math.random() * 360);
    const rotateEnd = Math.round((Math.random() > 0.5 ? 1 : -1) * (540 + Math.random() * 720));
    piece.style.setProperty('--dx', `${dx.toFixed(1)}px`);
    piece.style.setProperty('--dy', `${dy.toFixed(1)}px`);
    piece.style.setProperty('--end-x', `${(dx + wind).toFixed(1)}px`);
    piece.style.setProperty('--end-y', `${(dy + fallDistance + Math.random() * 180).toFixed(1)}px`);
    piece.style.setProperty('--rotate-start', `${rotateStart}deg`);
    piece.style.setProperty('--rotate-mid', `${rotateStart + rotateEnd}deg`);
    piece.style.setProperty('--rotate-fall', `${Math.round(rotateStart + rotateEnd * 1.35)}deg`);
    piece.style.setProperty('--delay', `${(Math.random() * 120).toFixed(0)}ms`);
    piece.style.setProperty('--width', `${width.toFixed(1)}px`);
    piece.style.setProperty('--height', `${height.toFixed(1)}px`);
    piece.style.setProperty('--color', colors[index % colors.length]);
    overlay.append(piece);
  }

  document.body.append(overlay);
  pbConfettiTimer = window.setTimeout(() => {
    overlay.remove();
    pbConfettiTimer = 0;
  }, 2100);
}

async function nextSolve() {
  if (nextSolvePromise) return nextSolvePromise;
  nextSolvePromise = runNextSolve();
  try {
    return await nextSolvePromise;
  } finally {
    nextSolvePromise = null;
  }
}

async function runNextSolve() {
  clearBluetoothNextSolveGestureCandidate();
  if (scrambleLocked && scramble?.scramble) {
    resetBluetoothSolveTracking();
    resetScrambleGuide();
  } else {
    await loadScramble();
  }
  activePenalty = 'ok';
  clearInspectionEntryAnimation();
  inspectionStartedAt = 0;
  activeInspectionUsed = false;
  inspectionBluetoothStartBlockedUntil = 0;
  appState = 'ready';
  syncCurrentScrambleGuideState();
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
  if (scrambleLoadPromise && !options.force) return scrambleLoadPromise;
  const requestId = scrambleLoadRequestId + 1;
  scrambleLoadRequestId = requestId;
  scrambleLoadPromise = runLoadScramble(options, requestId);
  try {
    return await scrambleLoadPromise;
  } finally {
    if (scrambleLoadPromise && requestId === scrambleLoadRequestId) scrambleLoadPromise = null;
  }
}

async function runLoadScramble(options = {}, requestId = scrambleLoadRequestId) {
  applyCurrentSessionPuzzle();
  clearBluetoothNextSolveGestureCandidate();
  elements.scrambleButton.disabled = true;
  try {
    const data = await postJson('/api/scramble', { puzzle: scramblePuzzle });
    if (requestId !== scrambleLoadRequestId) return;
    scramble = data.scramble;
    scramblePuzzle = scramble.puzzle || sessionPuzzleForId(currentSessionId, scramblePuzzle);
    localStorage.setItem('trainTimer.scramblePuzzle', scramblePuzzle);
    activeInspectionUsed = false;
    clearInspectionEntryAnimation();
    inspectionStartedAt = 0;
    inspectionBluetoothStartBlockedUntil = 0;
    resetBluetoothSolveTracking();
    resetScrambleGuide();
    syncCurrentScrambleGuideState();
    if (options.markReady && appState === 'loading') appState = 'ready';
    render();
  } catch (error) {
    if (options.markReady && appState === 'loading') {
      appState = 'error';
      elements.statusText.textContent = '打乱加载失败';
      elements.statusText.classList.add('error');
      elements.timerHint.textContent = error.message;
    } else {
      throw error;
    }
  } finally {
    if (requestId === scrambleLoadRequestId) {
      elements.scrambleButton.disabled = scrambleLocked || ['timing', 'inspection', 'hold', 'saving'].includes(appState);
    }
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
  const deletionContext = solveDeletionContext([solve]);
  const data = await requestJson(`/api/solves/${encodeURIComponent(id)}`, { method: 'DELETE' });
  stageDeletedSolves([solve]);
  solves = data.solves;
  selectedSolveIds.delete(id);
  if (currentDetailSolveId === id) elements.solveDialog.close();
  await renderAfterSolveDeletion(deletionContext);
}

async function deleteCurrentDetailSolve() {
  if (!currentDetailSolveId) return;
  await deleteSolve(currentDetailSolveId);
}

async function deleteLatestSolve() {
  const solve = latestSessionSolve();
  if (!solve || !confirmSolveDeletion(`删除上一把 ${displaySolveTime(solve)}？`)) return;
  const deletionContext = solveDeletionContext([solve]);
  const data = await requestJson(`/api/solves/${encodeURIComponent(solve.id)}`, { method: 'DELETE' });
  stageDeletedSolves([solve]);
  solves = data.solves;
  selectedSolveIds.delete(solve.id);
  if (currentDetailSolveId === solve.id) elements.solveDialog.close();
  await renderAfterSolveDeletion(deletionContext);
}

async function deleteSelectedSolves() {
  const ids = [...selectedSolveIds];
  if (ids.length === 0) return;
  if (!confirmSolveDeletion(`删除选中的 ${ids.length} 条成绩？`)) return;
  const deleted = solves.filter((solve) => selectedSolveIds.has(solve.id));
  const deletionContext = solveDeletionContext(deleted);
  const data = await postJson('/api/solves/delete', { ids });
  stageDeletedSolves(deleted);
  solves = data.solves;
  selectedSolveIds.clear();
  if (ids.includes(currentDetailSolveId)) elements.solveDialog.close();
  await renderAfterSolveDeletion(deletionContext);
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
  const deletionContext = solveDeletionContext(deleted);
  const data = await postJson('/api/solves/delete', { ids });
  stageDeletedSolves(deleted);
  solves = data.solves;
  selectedSolveIds.clear();
  if (ids.includes(currentDetailSolveId)) elements.solveDialog.close();
  await renderAfterSolveDeletion(deletionContext);
}

function solveDeletionContext(deletedSolves) {
  return {
    appState,
    latestSolveId: latestSessionSolve()?.id || '',
    deletedIds: new Set((Array.isArray(deletedSolves) ? deletedSolves : [])
      .map((solve) => solve?.id)
      .filter(Boolean)),
  };
}

function shouldPrepareNextSolveAfterDeletion(context) {
  return context?.appState === 'done'
    && Boolean(context.latestSolveId)
    && context.deletedIds instanceof Set
    && context.deletedIds.has(context.latestSolveId);
}

async function renderAfterSolveDeletion(context) {
  if (!shouldPrepareNextSolveAfterDeletion(context)) {
    render();
    return;
  }
  await prepareNextSolveAfterDeletedLatest();
}

async function prepareNextSolveAfterDeletedLatest() {
  resetBluetoothNextSolveGesture();
  resetBluetoothSolveTracking();
  resetScrambleGuide();
  activePenalty = 'ok';
  clearInspectionEntryAnimation();
  inspectionStartedAt = 0;
  activeInspectionUsed = false;
  inspectionBluetoothStartBlockedUntil = 0;
  appState = 'ready';
  syncCurrentScrambleGuideState();
  if (scrambleLocked) {
    render();
    return;
  }
  try {
    await loadScramble({ force: true });
  } catch (error) {
    addBluetoothLog('错误', '删除后加载新打乱失败', error.message || String(error));
    render();
  }
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

function toggleHistoryCfopPanel() {
  historyCfopCollapsed = !historyCfopCollapsed;
  localStorage.setItem('trainTimer.historyCfopCollapsed', historyCfopCollapsed ? '1' : '0');
  renderHistoryCfopPanel();
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
  startStatsChartPointerTracking();
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
  startStatsChartPointerTracking();
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
  startStatsChartPointerTracking();
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
    event.target.closest('.history-row')?.classList.toggle('selected', event.target.checked);
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
  if (id) {
    deleteSolve(id);
    return;
  }

  const row = target?.closest('.compact-history-row[data-solve-id]');
  if (row) handleCompactHistoryRowSelection(event, row);
}

function handleCompactHistoryRowSelection(event, row) {
  const id = row.dataset.solveId;
  if (!id) return;

  const ids = compactHistoryEntries().map((entry) => entry.solve.id);
  const index = ids.indexOf(id);
  if (index < 0) return;

  if (event.shiftKey && historySelectionAnchorId && ids.includes(historySelectionAnchorId)) {
    const anchorIndex = ids.indexOf(historySelectionAnchorId);
    const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
    const rangeIds = ids.slice(from, to + 1);
    selectedSolveIds = event.metaKey || event.ctrlKey
      ? new Set([...selectedSolveIds, ...rangeIds])
      : new Set(rangeIds);
  } else if (event.metaKey || event.ctrlKey) {
    if (selectedSolveIds.has(id)) selectedSolveIds.delete(id);
    else selectedSolveIds.add(id);
    historySelectionAnchorId = id;
  } else {
    selectedSolveIds = new Set([id]);
    historySelectionAnchorId = id;
  }

  renderHistory();
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
  if (currentDetailSolveId !== id) stopSolveReplay();
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
  const bluetoothMoveCount = solve.bluetoothMoveCount ?? (Array.isArray(solve.bluetoothMoves) ? countMoveSteps(solve.bluetoothMoves) : 0);
  const bluetoothTps = Number.isFinite(solve.bluetoothTps) ? `${solve.bluetoothTps.toFixed(3)} TPS` : 'TPS -';
  const bluetoothDevice = solve.bluetoothDeviceName || '';
  const bluetoothProtocols = formatList(solve.bluetoothProtocols);
  const bluetoothSources = formatList(solve.bluetoothSources);
  const bluetoothDetail = [bluetoothDevice, bluetoothProtocols].filter(Boolean).join(' · ');
  const positionText = solveIndex >= 0 ? `第 ${solveNumber} / ${sessionSolves.length} 条` : '未知位置';
  elements.solveDetailMeta.textContent = `${sessionNameForSolve(solve)} · ${positionText} · ${new Date(solve.createdAt).toLocaleString()} · ${timerSource} · ${puzzleLabel(solve.scramblePuzzle || 'three')} · ${solve.inspectionEnabled ? '开启观察' : '无观察'} · ${bluetoothMoveCount} 步 · ${bluetoothTps}${bluetoothDetail ? ` · ${bluetoothDetail}` : ''} · ${solve.scrambleSource || 'unknown'}`;
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
  const cfopDisplay = cfopDisplayForSolve(solve, analysis);
  const displayedStages = cfopDisplay.hasData ? cfopDisplay.stages : analysis.stages;
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

  const stageText = analysis.finalSolved || displayedStages.some((stage) => stage.key === 'pll' && stage.completed)
    ? '已复原'
    : '未复原';
  const sourceText = solve.bluetoothDeviceName || (solve.timerSource === 'bluetooth' ? '蓝牙魔方' : '');
  const cfopText = analysis.bottomFace ? `CFOP 底面 ${analysis.bottomFace}${analysis.confidence ? ` · 判断${analysis.confidence}` : ''}` : '';
  elements.solveDetailBluetoothStats.textContent = '完整解法';
  elements.solveBluetoothReplayMeta.textContent = [
    `${records.length} 步`,
    Number.isFinite(solve.bluetoothTps) ? `${solve.bluetoothTps.toFixed(3)} TPS` : '',
    stageText,
    cfopText,
    sourceText,
  ].filter(Boolean).join(' · ');

  const opEvents = opDisplayEventsForSolve(solve);
  elements.solveCfopStages.replaceChildren(
    ...displayedStages.map((stage) => renderCfopStageCard(stage)),
    ...opEvents.map((event) => renderOpEventCard(event)),
  );
  elements.solveDetailBluetoothMoves.replaceChildren(
    ...records.map((record, index) => renderSolveMoveChip(record, index, opEvents)),
  );
  updateSolveReplayHighlight();
}

function renderCfopStageCard(stage) {
  const card = document.createElement('div');
  const skipKind = cfopOpSkipKind(stage);
  card.className = `solve-cfop-card ${stage.completed ? 'completed' : 'pending'}${skipKind ? ' op-skip' : ''}`;
  const timeText = skipKind ? '跳过' : (Number.isFinite(stage.durationMs) ? formatTime(stage.durationMs) : '--');
  const nameText = skipKind === 'oll' ? '跳 O' : (skipKind === 'pll' ? '跳 P' : stage.name);
  const tpsText = skipKind ? `${skipKind.toUpperCase()} Skip` : (Number.isFinite(stage.tps) ? `${stage.tps.toFixed(2)} TPS` : 'TPS --');
  const observationText = Number.isFinite(stage.observationMs) ? ` · 观察 ${formatTime(stage.observationMs)}` : '';
  card.innerHTML = `
    <strong>${escapeHtml(stage.label)}</strong>
    <span>${escapeHtml(nameText)}</span>
    <em>${stage.completed ? escapeHtml(timeText) : '未完成'}</em>
    <small>${stage.turns} 步 · ${escapeHtml(tpsText)}${escapeHtml(observationText)}</small>
  `;
  return card;
}

function cfopOpSkipKind(stage) {
  if (!stage?.completed || Number(stage.turns) !== 0) return '';
  if (stage.key === 'oll' || stage.label === 'O') return 'oll';
  if (stage.key === 'pll' || stage.label === 'P') return 'pll';
  return '';
}

function opEventKey(event) {
  return [
    event?.kind || '',
    event?.caseId || '',
    event?.startStep ?? '',
    event?.endStep ?? '',
  ].join(':');
}

function opEventForStep(opEvents, stepNumber) {
  const step = Number(stepNumber);
  if (!Number.isFinite(step)) return null;
  return (Array.isArray(opEvents) ? opEvents : []).find((event) => {
    const start = Number(event?.startStep);
    const end = Number(event?.endStep);
    return Number.isFinite(start) && Number.isFinite(end) && step >= start && step <= end;
  }) || null;
}

function opMoveChipLabel(event) {
  const kind = String(event?.kind || '').toUpperCase();
  const label = event?.pdfLabel || event?.name || event?.caseId || '';
  return [kind, label].filter(Boolean).join(' ');
}

function opEventRangeText(event) {
  const start = Number(event?.startStep);
  const end = Number(event?.endStep);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  return start === end ? `第 ${start} 步` : `第 ${start}-${end} 步`;
}

function renderOpEventCard(event) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'solve-cfop-card completed op-event-card';
  card.dataset.opEventKey = opEventKey(event);
  card.dataset.opStartStep = String(event.startStep || '');
  card.dataset.opEndStep = String(event.endStep || '');
  const kind = String(event.kind || '').toUpperCase();
  const label = event.pdfLabel ? `${event.name || event.caseId} · ${event.pdfLabel}` : (event.name || event.caseId);
  const timeText = Number.isFinite(event.durationMs) ? formatTime(event.durationMs) : '--';
  const tpsText = Number.isFinite(event.tps) ? `${event.tps.toFixed(2)} TPS` : 'TPS --';
  const observationText = Number.isFinite(event.observationMs) ? ` · 观察 ${formatTime(event.observationMs)}` : '';
  const formulaText = Array.isArray(event.moves) && event.moves.length > 0 ? event.moves.join(' ') : event.algorithm || '';
  const formulaStatus = event.formulaAccepted === true
    ? ''
    : opFormulaReasonText(event.formulaReason);
  const rangeText = opEventRangeText(event);
  const diagram = opCaseSvgMarkup(event.kind, event.caseId, {
    className: 'op-case-diagram op-case-diagram-thumb',
    idPrefix: `op-event-${opEventKey(event)}`,
    title: opCaseVisualTitle(kind, label),
  });
  if (diagram) card.classList.add('has-op-diagram');
  card.title = [
    `${kind} ${label}`,
    rangeText,
    formulaStatus,
    formulaText,
  ].filter(Boolean).join(' · ');
  card.innerHTML = `
    ${diagram ? `<div class="op-event-card-diagram">${diagram}</div>` : ''}
    <div class="op-event-card-body">
      <strong>${escapeHtml(kind)}</strong>
      <span>${escapeHtml(label)}</span>
      <em>${escapeHtml(timeText)}</em>
      <small>${escapeHtml(rangeText ? `${rangeText} · ` : '')}${Number(event.turns) || 0} 步 · ${escapeHtml(tpsText)}${escapeHtml(observationText)}${escapeHtml(formulaStatus ? ` · ${formulaStatus}` : '')}</small>
    </div>
  `;
  card.addEventListener('click', () => jumpToSolveOpEvent(event));
  return card;
}

function opFormulaReasonText(reason) {
  switch (reason) {
    case 'accepted':
    case '':
      return '';
    case 'too-long':
      return '未入库：步骤过长';
    case 'intermediate-op-case':
      return '未入库：疑似多公式';
    case 'oll-not-oriented':
      return '未入库：OLL 未完成';
    case 'oll-not-pll-state':
      return '未入库：OLL 后不是有效 PLL';
    case 'pll-not-solved':
      return '未入库：PLL 未复原';
    case 'invalid-moves':
      return '未入库：步骤无效';
    case 'ambiguous-start-state':
      return '未入库：状态不唯一';
    case 'stage-fallback':
      return '未入库：阶段回退识别';
    default:
      return reason ? `未入库：${reason}` : '';
  }
}

function opCaseVisualTitle(kind, label) {
  const normalizedKind = String(kind || '').toUpperCase();
  const text = String(label || '').trim();
  if (!normalizedKind || !text) return text || normalizedKind;
  return text.toUpperCase().startsWith(`${normalizedKind} `) ? text : `${normalizedKind} ${text}`;
}

function renderSolveMoveChip(record, index, opEvents = []) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'solve-move-chip';
  button.dataset.replayStep = String(index);
  const stepNumber = index + 1;
  const opEvent = opEventForStep(opEvents, stepNumber);
  if (opEvent) {
    const kind = String(opEvent.kind || '').toLowerCase();
    button.classList.add('op-range', `op-${kind}`);
    button.dataset.opEventKey = opEventKey(opEvent);
    button.dataset.opKind = kind;
    button.dataset.opCase = opEvent.caseId || '';
    if (stepNumber === Number(opEvent.startStep)) {
      button.dataset.opLabel = opMoveChipLabel(opEvent);
      button.classList.add('op-start');
    }
    if (stepNumber === Number(opEvent.endStep)) button.classList.add('op-end');
  }
  const elapsed = Number.isFinite(record.elapsedMs) ? formatTime(record.elapsedMs) : '--';
  const opText = opEvent ? `${opMoveChipLabel(opEvent)} · ${opEventRangeText(opEvent)}` : '';
  button.title = [`第 ${stepNumber} 步`, record.move, elapsed, opText].filter(Boolean).join(' · ');
  button.innerHTML = `<span>${stepNumber}</span><strong>${escapeHtml(record.move)}</strong>`;
  button.addEventListener('click', () => {
    const solve = solves.find((item) => item.id === currentDetailSolveId);
    stopSolveReplay({ keepStep: true });
    solveReplayStep = index;
    solveReplayFocusedOpKey = opEvent ? opEventKey(opEvent) : '';
    solveReplayFocusedOpManual = false;
    showSolveReplayPreview(solve, index + 1);
    updateSolveReplayHighlight();
  });
  return button;
}

function jumpToSolveOpEvent(event) {
  const solve = solves.find((item) => item.id === currentDetailSolveId);
  if (!solve) return;
  const startStep = Number(event?.startStep);
  if (!Number.isFinite(startStep) || startStep < 1) return;
  stopSolveReplay({ keepStep: true });
  solveReplayFocusedOpKey = opEventKey(event);
  solveReplayFocusedOpManual = true;
  const previewStepCount = Math.max(0, Math.round(startStep) - 1);
  solveReplayStep = previewStepCount - 1;
  showSolveReplayPreview(solve, previewStepCount);
  updateSolveReplayHighlight();
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
  if (cube3d?.turnAnimation) completeBluetoothCube3dTurnAnimation(false);
  cancelBluetooth3dMovePulse();
  solveReplayPlaying = true;
  solveReplayFocusedOpManual = false;
  solveReplayStep = solveReplayStep >= 0 && solveReplayStep < records.length ? solveReplayStep : -1;
  elements.solveReplayButton.textContent = '暂停';
  showSolveReplayPreview(solve, Math.max(0, solveReplayStep + 1));
  const nextStepIndex = solveReplayStep + 1;
  const delay = replayDelayBeforeMove(records, nextStepIndex, {
    fallbackDelayMs: 120,
    minimumDelayMs: 120,
  });
  solveReplayTimer = window.setTimeout(() => advanceSolveReplay(solve, records), delay);
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
  const animationDelay = replayMoveAnimationDelay(current.move);
  triggerBluetoothCube3dTurnAnimation(current.move, {
    onComplete: () => showSolveReplayPreview(solve, stepToApply),
  });
  window.setTimeout(() => {
    if (solveReplayPreviewActive && solveReplayStep >= stepToApply - 1) showSolveReplayPreview(solve, stepToApply);
  }, animationDelay);
  const nextStepIndex = solveReplayStep + 1;
  const delay = nextStepIndex < records.length
    ? replayDelayBeforeMove(records, nextStepIndex, {
      fallbackDelayMs: animationDelay,
      minimumDelayMs: animationDelay,
    })
    : animationDelay;
  solveReplayTimer = window.setTimeout(() => advanceSolveReplay(solve, records), delay);
}

function stopSolveReplay(options = {}) {
  clearTimeout(solveReplayTimer);
  solveReplayTimer = 0;
  solveReplayPlaying = false;
  if (!options.keepStep) solveReplayStep = -1;
  if (!options.keepStep) {
    solveReplayFocusedOpKey = '';
    solveReplayFocusedOpManual = false;
  }
  if (elements.solveReplayButton) elements.solveReplayButton.textContent = '播放';
  if (!options.keepStep) clearSolveReplayPreview();
  updateSolveReplayHighlight();
}

function showSolveReplayPreview(solve, stepCount = 0) {
  const records = solveMoveRecords(solve);
  try {
    solveReplayFacelets = applyMovesToFacelets(
      faceletsFromScramble(solve?.scramble || ''),
      records.slice(0, Math.max(0, stepCount)).map((record) => record.move),
    );
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
  solveReplayFacelets = '';
  solveReplayPreviewLabel = '';
  renderPreviewMode();
}

function updateSolveReplayHighlight() {
  if (!elements.solveDetailBluetoothMoves) return;
  const solve = solves.find((item) => item.id === currentDetailSolveId);
  const opEvents = opDisplayEventsForSolve(solve);
  const activeOpEvent = opEventForStep(opEvents, solveReplayStep + 1);
  if (activeOpEvent && (!solveReplayFocusedOpManual || solveReplayPlaying)) {
    solveReplayFocusedOpKey = opEventKey(activeOpEvent);
    solveReplayFocusedOpManual = false;
  }
  if (solveReplayPlaying && !activeOpEvent) {
    solveReplayFocusedOpKey = '';
    solveReplayFocusedOpManual = false;
  }
  const chips = elements.solveDetailBluetoothMoves.querySelectorAll('.solve-move-chip');
  chips.forEach((chip, index) => {
    const active = index === solveReplayStep;
    const focused = chip.dataset.opEventKey && chip.dataset.opEventKey === solveReplayFocusedOpKey;
    chip.classList.toggle('active', active);
    chip.classList.toggle('op-focused', Boolean(focused));
    if (active) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  const cards = elements.solveCfopStages?.querySelectorAll('.op-event-card') || [];
  cards.forEach((card) => {
    const focused = card.dataset.opEventKey && card.dataset.opEventKey === solveReplayFocusedOpKey;
    card.classList.toggle('active', Boolean(focused));
  });
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
  bluetoothGanMacPromptAllowed = true;
  const quickMacTimeout = options.auto ? 2400 : 1800;
  await startBluetoothGanMacBackgroundRead(bluetoothDevice, quickMacTimeout, { force: true });
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
  bluetoothGanMacPromptAllowed = true;
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
  bluetoothPhysicalSignature = '';
  bluetoothPhysicalSolved = false;
  bluetoothPhysicalStateReceivedAt = 0;
  bluetoothPhysicalStateTime = '';
  bluetoothGanMac = cachedBluetoothGanMac(device, { includeLast: false });
  bluetoothGanSession = null;
  bluetoothGanMacReadPromise = null;
  bluetoothGanMacReadRetryAt = 0;
  bluetoothGanPendingInit = null;
  bluetoothGanLastMoveCounter = null;
  bluetoothGanLastStateCounter = null;
  bluetoothGanLastDecodedStateSignature = '';
  bluetoothGanDecodeWarning = '';
  resetGanFastDecodeState();
  resetGanBluetoothPacketQueue();
  bluetoothGanMacPromptInFlight = null;
  bluetoothGanMacPromptDismissed = false;
  bluetoothGanLastStateLogAt = 0;
  bluetoothGanLastStateLogSignature = '';
  bluetoothGanLastStatusTitleAt = 0;
  bluetoothGanMissingMacStatusAt = 0;
  bluetoothDeviceDisconnectHandler = handleBluetoothDisconnected;
  bluetoothDevice.addEventListener('gattserverdisconnected', bluetoothDeviceDisconnectHandler);
  if (bluetoothGanMac) addBluetoothLog('GAN', '已载入已保存 MAC', bluetoothGanMac);
}

function handleBluetoothDisconnected() {
  cleanupBluetoothSubscriptions();
  resetGanBluetoothPacketQueue();
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
  resetGanBluetoothPacketQueue();
  bluetoothGanMacPromptAllowed = true;
  bluetoothGanMacPromptInFlight = null;
  bluetoothGanMacPromptDismissed = false;
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
    addBluetoothLog('警告', 'GAN manufacturer data 授权不可用', '已退回基础服务扫描；自动读取 GAN MAC 可能需要新版 Chrome');
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
    if (!elements.bluetoothStatus.title) setBluetoothStatusTitle(availability.detail);
  } else {
    setBluetoothDeviceNameStatus('已连接');
  }
  renderBluetoothReconnectButton();
  renderPreviewMode();
  if (connected) scheduleScrambleGuideLocalSolverWarmupWhenUseful();
  if (connected) scheduleScrambleGuideServerSolverWarmupWhenUseful();
}

function setBluetoothStatusText(text, title = '') {
  const nextText = String(text || '');
  if (bluetoothStatusTextKey !== nextText || elements.bluetoothStatus.textContent !== nextText) {
    bluetoothStatusTextKey = nextText;
    elements.bluetoothStatus.textContent = nextText;
  }
  setBluetoothStatusTitle(title);
}

function setBluetoothStatusTitle(title = '') {
  const nextTitle = String(title || '');
  if (bluetoothStatusTitleKey === nextTitle && elements.bluetoothStatus.title === nextTitle) return;
  bluetoothStatusTitleKey = nextTitle;
  elements.bluetoothStatus.title = nextTitle;
}

function setBluetoothDeviceNameStatus(fallback = '已连接', title = '') {
  const name = bluetoothDevice?.name || bluetoothDevice?.id || fallback;
  if (bluetoothStatusTextKey !== name || elements.bluetoothStatus.textContent !== name) {
    bluetoothStatusTextKey = name;
    elements.bluetoothStatus.textContent = name;
  }
  setBluetoothStatusTitle(title || name);
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
    addBluetoothLog('GAN', '浏览器不能读取广播 MAC', 'Chrome 需要开启 chrome://flags/#enable-experimental-web-platform-features 后重启；将使用缓存或手动输入');
    return '';
  }

  setBluetoothDeviceNameStatus('读取 GAN 广播...', '读取 GAN 广播 MAC，用于解密 GAN 加密包');
  addBluetoothLog('GAN', '读取广播 MAC', '正在监听 GAN CIC manufacturer data，用于解密 GAN 加密包');
  return new Promise((resolve) => {
    let done = false;
    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    const finish = (mac = '') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (abortController) abortController.abort();
      device.removeEventListener('advertisementreceived', handleAdvertisement);
      if (mac) {
        if (device === bluetoothDevice) {
          setBluetoothGanMac(mac, device);
          addBluetoothLog('GAN', '已自动读取广播 MAC', mac);
        } else {
          addBluetoothLog('GAN', '忽略旧设备广播 MAC', mac);
        }
      } else {
        addBluetoothLog('GAN', '未读取到广播 MAC', '请确认 Chrome experimental flag 已开启、魔方保持唤醒；后台会继续尝试');
      }
      resolve(mac);
    };
    const handleAdvertisement = (event) => {
      const mac = ganMacFromManufacturerData(event.manufacturerData);
      if (mac) finish(mac);
    };
    const timer = setTimeout(() => finish(''), timeoutMs);
    device.addEventListener('advertisementreceived', handleAdvertisement);
    startBluetoothAdvertisementWatch(device, abortController).catch((error) => {
      if (done || error?.name === 'AbortError') return;
      addBluetoothLog('GAN', '广播读取失败', error.message || String(error));
      finish('');
    });
  });
}

async function startBluetoothAdvertisementWatch(device, abortController) {
  if (!abortController) {
    await device.watchAdvertisements();
    return;
  }
  try {
    await device.watchAdvertisements({ signal: abortController.signal });
  } catch (error) {
    if (error instanceof TypeError || error?.name === 'TypeError') {
      await device.watchAdvertisements();
      return;
    }
    throw error;
  }
}

function startBluetoothGanMacBackgroundRead(device, timeoutMs = 9000, options = {}) {
  if (!isLikelyGanDevice(device) || bluetoothGanMac) return Promise.resolve(bluetoothGanMac);
  if (bluetoothGanMacReadPromise) return bluetoothGanMacReadPromise;
  const now = performance.now();
  if (bluetoothGanMacReadRetryAt > now && options.force !== true) return Promise.resolve('');
  if (typeof device?.watchAdvertisements !== 'function') {
    bluetoothGanMacReadRetryAt = now + bluetoothGanMacUnavailableRetryMs;
  }
  bluetoothGanMacReadPromise = resolveBluetoothGanMacFromAdvertisements(device, timeoutMs)
    .then((mac) => {
      if (mac) {
        bluetoothGanMacReadRetryAt = 0;
        void primePendingGanBluetoothInitialization();
      } else if (options.force !== true && typeof device?.watchAdvertisements === 'function') {
        bluetoothGanMacReadRetryAt = performance.now() + bluetoothGanMacBackgroundRetryMs;
      }
      return mac;
    })
    .finally(() => {
      bluetoothGanMacReadPromise = null;
    });
  return bluetoothGanMacReadPromise;
}

function ganMacFromManufacturerData(manufacturerData) {
  return extractGanMacFromManufacturerData(manufacturerData, bluetoothGanManufacturerData);
}

async function ensureBluetoothGanMac(options = {}) {
  if (bluetoothGanMac) return bluetoothGanMac;
  const cached = cachedBluetoothGanMac(bluetoothDevice);
  if (cached) {
    setBluetoothGanMac(cached, bluetoothDevice);
    return bluetoothGanMac;
  }
  let macReadInFlight = false;
  if (options.waitForAdvertisement) {
    const mac = await startBluetoothGanMacBackgroundRead(bluetoothDevice, options.timeoutMs || 2200, { force: true });
    if (mac) return mac;
  } else if (options.background !== false) {
    void startBluetoothGanMacBackgroundRead(bluetoothDevice, options.timeoutMs || 9000);
    macReadInFlight = Boolean(bluetoothGanMacReadPromise);
  }
  if (options.allowPrompt && bluetoothGanMacPromptAllowed && !macReadInFlight) {
    const prompted = await promptBluetoothGanMacOnce(bluetoothDevice);
    if (prompted) return prompted;
  }
  return '';
}

async function promptBluetoothGanMacOnce(device) {
  if (!isLikelyGanDevice(device) || bluetoothGanMac || bluetoothGanMacPromptDismissed) return bluetoothGanMac;
  if (bluetoothGanMacPromptInFlight) return bluetoothGanMacPromptInFlight;

  bluetoothGanMacPromptInFlight = Promise.resolve().then(() => {
    const fallback = cachedBluetoothGanMac(device) || '';
    const deviceLabel = device?.name || device?.id || 'GAN 蓝牙魔方';
    const input = prompt(
      `${deviceLabel} 需要 MAC 地址解密转动、电量和状态。\n\n如果使用 Chrome，可开启 chrome://flags/#enable-experimental-web-platform-features 后重启浏览器，让 TrainTimer 自动读取广播 MAC。当前没有读到广播 MAC，所以需要输入一次；保存后后续连接会自动使用缓存。\n请输入 6 组十六进制 MAC，例如 01:23:45:67:89:ab。`,
      fallback,
    );
    if (input === null) {
      bluetoothGanMacPromptDismissed = true;
      addBluetoothLog('GAN', '未输入 MAC', '浏览器不能读取广播 MAC，本次无法解析 GAN 加密包');
      return '';
    }

    const normalized = normalizeBluetoothMac(input);
    if (!normalized) {
      bluetoothGanMacPromptDismissed = true;
      addBluetoothLog('GAN', 'MAC 格式无效', '需要 6 组十六进制，例如 01:23:45:67:89:ab');
      alert('GAN MAC 格式无效，请输入 6 组十六进制，例如 01:23:45:67:89:ab。');
      return '';
    }

    setBluetoothGanMac(normalized, device);
    bluetoothGanMacPromptDismissed = false;
    addBluetoothLog('GAN', '已保存 MAC', `${normalized} · 后续连接会自动使用`);
    void primePendingGanBluetoothInitialization();
    return bluetoothGanMac;
  }).finally(() => {
    bluetoothGanMacPromptInFlight = null;
  });

  return bluetoothGanMacPromptInFlight;
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
  bluetoothGanLastStateCounter = null;
  bluetoothGanLastDecodedStateSignature = '';
  bluetoothGanDecodeWarning = '';
  resetGanFastDecodeState();
  resetGanBluetoothPacketQueue();
  bluetoothGanLastStateLogAt = 0;
  bluetoothGanLastStateLogSignature = '';
  bluetoothGanLastStatusTitleAt = 0;

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
    setBluetoothDeviceNameStatus('GAN', '正在读取或等待 GAN MAC，用于解析状态、转动和电量');
    addBluetoothLog('GAN', `${protocol.label} 等待 MAC`, '读到广播 MAC 会自动初始化；读不到时会提示一次并缓存');
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
  const deviceName = bluetoothDevice?.name || '蓝牙魔方';
  if (isGanPacketSource(characteristic.uuid, deviceName)) {
    if (tryProcessGanBluetoothPacketInline(characteristic.uuid, characteristic.value, deviceName)) return;
    enqueueGanBluetoothPacket(characteristic.uuid, characteristic.value, deviceName);
    return;
  }
  try {
    const result = processBluetoothPacket(characteristic.uuid, characteristic.value, deviceName);
    if (isPromiseLike(result)) void result.catch(handleBluetoothPacketError);
  } catch (error) {
    handleBluetoothPacketError(error);
  }
}

function tryProcessGanBluetoothPacketInline(uuid, value, deviceName) {
  if (!shouldProcessGanBluetoothPacketInline(uuid, deviceName)) return false;
  try {
    const result = processBluetoothPacket(uuid, value, deviceName);
    incrementPerformanceCounter('ganInlinePackets');
    if (isPromiseLike(result)) {
      incrementPerformanceCounter('ganInlineAsyncPackets');
      incrementPerformanceCounter('ganAsyncProcessedPackets');
      bluetoothGanPacketQueueDraining = true;
      void result
        .catch(handleBluetoothPacketError)
        .finally(() => {
          bluetoothGanPacketQueueDraining = false;
          if (ganBluetoothPacketQueueLength() > 0) void drainGanBluetoothPacketQueue();
        });
    } else {
      incrementPerformanceCounter('ganInlineSyncPackets');
      incrementPerformanceCounter('ganSyncProcessedPackets');
    }
  } catch (error) {
    handleBluetoothPacketError(error);
  }
  return true;
}

function shouldProcessGanBluetoothPacketInline(uuid, deviceName) {
  if (bluetoothGanPacketQueueDraining || ganBluetoothPacketQueueLength() > 0) return false;
  if (!bluetoothGanMac) return false;
  if (performance.now() < bluetoothGanFastDecodeDisabledUntil) return false;
  const protocol = bluetoothGanSession || bluetoothGanProtocolForCharacteristic(uuid) || bluetoothGanProtocolForDevice(deviceName);
  return protocol?.protocol === 'v2' || protocol?.protocol === 'v3' || protocol?.protocol === 'v4';
}

function enqueueGanBluetoothPacket(uuid, value, deviceName) {
  compactGanBluetoothPacketQueue();
  const cloneQueuedValue = shouldCloneGanBluetoothPacketValueForQueue();
  bluetoothGanPacketQueue.push({
    uuid,
    value: cloneQueuedValue ? cloneBluetoothPacketBytes(value) : value,
    deviceName,
  });
  incrementPerformanceCounter('ganQueuedPackets');
  performanceCounters.ganPacketQueueMaxDepth = Math.max(
    performanceCounters.ganPacketQueueMaxDepth,
    ganBluetoothPacketQueueLength(),
  );
  if (!bluetoothGanPacketQueueDraining) void drainGanBluetoothPacketQueue();
}

function shouldCloneGanBluetoothPacketValueForQueue() {
  return Boolean(
    bluetoothGanPacketQueueDraining
    || ganBluetoothPacketQueueLength() > 0
    || !bluetoothGanMac
  );
}

async function drainGanBluetoothPacketQueue() {
  if (bluetoothGanPacketQueueDraining) return;
  bluetoothGanPacketQueueDraining = true;
  let sliceStartedAt = performance.now();
  try {
    while (ganBluetoothPacketQueueLength() > 0) {
      const packet = bluetoothGanPacketQueue[bluetoothGanPacketQueueHead];
      bluetoothGanPacketQueueHead += 1;
      compactGanBluetoothPacketQueue();
      try {
        const result = processBluetoothPacket(packet.uuid, packet.value, packet.deviceName);
        if (isPromiseLike(result)) {
          incrementPerformanceCounter('ganAsyncProcessedPackets');
          await result;
        } else {
          incrementPerformanceCounter('ganSyncProcessedPackets');
        }
        incrementPerformanceCounter('ganProcessedQueuedPackets');
      } catch (error) {
        handleBluetoothPacketError(error);
      }
      if (
        ganBluetoothPacketQueueLength() > 0
        && performance.now() - sliceStartedAt >= bluetoothGanPacketDrainBudgetMs
      ) {
        incrementPerformanceCounter('ganPacketDrainYields');
        await yieldGanBluetoothPacketDrain();
        sliceStartedAt = performance.now();
      }
    }
  } finally {
    compactGanBluetoothPacketQueue({ force: true });
    bluetoothGanPacketQueueDraining = false;
    if (ganBluetoothPacketQueueLength() > 0) void drainGanBluetoothPacketQueue();
  }
}

function yieldGanBluetoothPacketDrain() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function ganBluetoothPacketQueueLength() {
  return Math.max(0, bluetoothGanPacketQueue.length - bluetoothGanPacketQueueHead);
}

function compactGanBluetoothPacketQueue(options = {}) {
  if (bluetoothGanPacketQueueHead <= 0) return;
  const pending = ganBluetoothPacketQueueLength();
  const shouldCompact = options.force
    || pending === 0
    || bluetoothGanPacketQueueHead >= 64
    || bluetoothGanPacketQueueHead > pending;
  if (!shouldCompact) return;
  if (pending <= 0) {
    bluetoothGanPacketQueue.length = 0;
  } else {
    bluetoothGanPacketQueue.splice(0, bluetoothGanPacketQueueHead);
  }
  bluetoothGanPacketQueueHead = 0;
}

function resetGanBluetoothPacketQueue() {
  bluetoothGanPacketQueue.length = 0;
  bluetoothGanPacketQueueHead = 0;
}

function handleBluetoothPacketError(error) {
  incrementPerformanceCounter('ganPacketQueueErrors');
  const message = error?.message || String(error);
  addBluetoothLog('错误', '蓝牙数据处理失败', message);
  console.warn('Bluetooth packet processing failed', error);
}

function processBluetoothPacket(uuid, value, deviceName) {
  let hex = '';
  const getHex = () => {
    if (!hex) hex = dataViewToHex(value);
    return hex;
  };
  const label = bluetoothUuidLabel(uuid);
  const ganPacket = isGanPacketSource(uuid, deviceName);
  if (isBatteryLevelCharacteristic(uuid)) {
    const batteryLevel = decodeBatteryLevel(value);
    if (updateBluetoothBattery(batteryLevel, label)) {
      setBluetoothStatusTitle(`${uuid} ${getHex()}`);
      return;
    }
  }

  if (ganPacket) {
    return processGanBluetoothPacket(uuid, value, deviceName, getHex, label);
  }

  if (isGiikerBatteryCharacteristic(uuid)) {
    const batteryLevel = decodeGiikerBatteryLevel(value);
    if (updateBluetoothBattery(batteryLevel, label)) {
      setBluetoothStatusTitle(`${uuid} ${getHex()}`);
      addBluetoothLog('数据/电量', label, `${getHex()} · battery=${batteryLevel}%`);
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
  const parsedMoves = duplicateMovePacket ? emptyBluetoothMoves : decoded.moves;
  const hasParsedMoves = parsedMoves.length > 0;
  const moveHandling = hasParsedMoves
    ? handleBluetoothMovesForCurrentState(parsedMoves, label, decoded.protocol || '', deviceName)
    : null;
  const trackingMoves = Boolean(moveHandling?.trackingMoves);
  const rawGanPacket = ganPacket && !hasParsedMoves && decoded.protocol === 'raw';
  const statusDetail = hasParsedMoves
    ? `${parsedMoves.join(' ')} · ${moveHandling?.statusLabel || (trackingMoves ? (bluetoothSolved ? '已复原' : '未复原') : '等待计时')}`
    : (rawGanPacket
      ? `GAN 原始数据 ${shortUuid(uuid)} ${getHex().slice(0, 23)}`
      : (duplicateMovePacket
      ? `${decoded.moves.join(' ')} · 重复状态包`
      : (decoded.batteryLevel != null ? `电量 ${decoded.batteryLevel}%` : `${label} ${getHex().slice(0, 17)}`)));
  const ignoredReason = duplicateMovePacket
    ? '重复状态包'
    : (moveHandling?.ignoredReason || (hasParsedMoves && !trackingMoves ? '等待计时' : ''));
  const packetLogKind = moveHandling?.logKind || (hasParsedMoves
    ? (trackingMoves ? '数据/转动' : '数据/预备转动')
    : (rawGanPacket ? '数据/GAN原始' : (duplicateMovePacket ? '数据/重复' : '数据')));
  const statusTrace = bluetoothDebugLogging || elements.bluetoothLogDialog?.open
    ? `${uuid} ${getHex()}`
    : shortUuid(uuid);
  setBluetoothStatusTitle(`${deviceName} · ${statusDetail} · ${statusTrace}`);
  if (shouldLogBluetoothMoveEvent(packetLogKind, parsedMoves)) {
    const logDetail = logBluetoothPacket(getHex(), decoded, ignoredReason);
    addBluetoothLog(
      packetLogKind,
      label,
      rawGanPacket ? `${logDetail} · GAN 加密包暂未解析为转动` : logDetail,
    );
  }
  if (bluetoothDebugLogging) {
    console.info('Bluetooth cube notification', {
      characteristic: uuid,
      value: getHex(),
      moves: parsedMoves,
      duplicate: duplicateMovePacket,
      tracked: trackingMoves,
    });
  }
}

function handleMissingGanMac(protocol) {
  const now = performance.now();
  if (now - bluetoothGanMissingMacStatusAt >= bluetoothGanMissingMacStatusFrameMs) {
    bluetoothGanMissingMacStatusAt = now;
    setBluetoothStatusTitle('缺少 MAC，不能解密 GAN 状态、转动和电量');
  }
  if (bluetoothGanDecodeWarning !== 'missing-mac') {
    bluetoothGanDecodeWarning = 'missing-mac';
    addBluetoothLog('GAN', `${protocol.label} 等待 MAC`, '已跳过通用 Giiker 解码，避免把加密字节误判成转动');
  }
  void startBluetoothGanMacBackgroundRead(bluetoothDevice, 15000);
}

function processGanBluetoothPacket(uuid, value, deviceName, getHex, label) {
  incrementPerformanceCounter('ganPackets');
  const packetSequence = ++bluetoothGanPacketSequence;
  const packetReceivedAt = performance.now();
  const protocol = bluetoothGanSession || bluetoothGanProtocolForCharacteristic(uuid) || bluetoothGanProtocolForDevice(deviceName);
  if (!protocol) {
    setBluetoothStatusTitle(`${deviceName} · GAN 协议未知`);
    addBluetoothLog('数据/GAN原始', label, `${getHex()} · 未识别 GAN 协议，已跳过通用 Giiker 解码`);
    return;
  }

  let mac = bluetoothGanMac;
  if (mac) incrementPerformanceCounter('ganMacFastPathHits');
  else {
    return ensureBluetoothGanMac({ allowPrompt: true })
      .then((resolvedMac) => processGanBluetoothPacketWithMac(
        uuid,
        value,
        deviceName,
        getHex,
        label,
        protocol,
        packetSequence,
        packetReceivedAt,
        resolvedMac,
      ));
  }
  return processGanBluetoothPacketWithMac(
    uuid,
    value,
    deviceName,
    getHex,
    label,
    protocol,
    packetSequence,
    packetReceivedAt,
    mac,
  );
}

function processGanBluetoothPacketWithMac(
  uuid,
  value,
  deviceName,
  getHex,
  label,
  protocol,
  packetSequence,
  packetReceivedAt,
  mac,
) {
  if (!mac) {
    handleMissingGanMac(protocol);
    return;
  }

  let decoded;
  try {
    const decodedResult = decodeGanBluetoothPacket(protocol, mac, dataViewBytes(value));
    if (isPromiseLike(decodedResult)) {
      return decodedResult
        .then((result) => processDecodedGanBluetoothPacket(
          uuid,
          deviceName,
          getHex,
          label,
          protocol,
          packetSequence,
          packetReceivedAt,
          result,
        ))
        .catch((error) => handleGanBluetoothDecodeError(error, protocol, label));
    }
    decoded = decodedResult;
  } catch (error) {
    handleGanBluetoothDecodeError(error, protocol, label);
    return;
  }

  return processDecodedGanBluetoothPacket(
    uuid,
    deviceName,
    getHex,
    label,
    protocol,
    packetSequence,
    packetReceivedAt,
    decoded,
  );
}

function handleGanBluetoothDecodeError(error, protocol, label) {
  setBluetoothStatusTitle(error.message || String(error));
  addBluetoothLog('错误', `${protocol.label} 解码失败`, `${label} · ${error.message || String(error)}`);
}

function processDecodedGanBluetoothPacket(
  uuid,
  deviceName,
  getHex,
  label,
  protocol,
  packetSequence,
  packetReceivedAt,
  decoded,
) {
  if (shouldSkipGanGyroOnlyPacket(decoded, packetSequence)) return;
  if (isGanGyroOnlyPacket(decoded, emptyBluetoothMoves)) {
    processGanGyroOnlyPacket(
      uuid,
    deviceName,
    getHex,
    label,
    packetReceivedAt,
    decoded,
  );
    return;
  }
  if (decoded?.mode === 'state' && decoded.stateSignature) {
    bluetoothGanLastDecodedStateSignature = decoded.stateSignature;
  }

  const decodedFacelets = typeof decoded.facelets === 'string' ? decoded.facelets : '';
  const physicalStateChanged = Boolean(decodedFacelets && decodedFacelets !== bluetoothPhysicalFacelets);
  const statePacketSolved = trustedGanStatePacketSolved(decoded, decodedFacelets, physicalStateChanged);
  if (statePacketSolved && decoded.stateSolved !== true) decoded = { ...decoded, stateSolved: true };
  else if (!statePacketSolved && decoded.stateSolved === true && appState === 'timing') decoded = { ...decoded, stateSolved: false, stateSolvedUntrusted: true };
  const hasMoveCounter = Number.isInteger(decoded.moveCounter);
  const previousMoveCounter = bluetoothGanLastMoveCounter;
  const duplicateMovePacket = ganBluetoothIsDuplicateMovePacket(decoded, previousMoveCounter);
  const parsedMoves = duplicateMovePacket ? emptyBluetoothMoves : ganBluetoothMovesFromDecoded(decoded, previousMoveCounter);
  const hasParsedMoves = parsedMoves.length > 0;
  maybeRecordGanStateCorrectionForPacket(decoded, decodedFacelets, parsedMoves, statePacketSolved);
  bluetoothGanLastMoveCounter = ganBluetoothNextMoveCounter(previousMoveCounter, decoded, parsedMoves);
  if (hasMoveCounter && decoded.mode === 'state') bluetoothGanLastStateCounter = decoded.moveCounter;
  if (shouldSkipUnchangedGanStatePacket(
    decoded,
    parsedMoves,
    duplicateMovePacket,
    physicalStateChanged,
    statePacketSolved,
    packetReceivedAt,
  )) return;

  const wasTimingBeforeMoves = appState === 'timing';
  const moveHandling = hasParsedMoves
    ? handleBluetoothMovesForCurrentState(parsedMoves, label, decoded.protocol || protocol.label, deviceName, {
      syncedFacelets: decodedFacelets,
    })
    : null;
  const guideSyncedByMove = Boolean(
    decodedFacelets
    && hasParsedMoves
    && moveHandling?.consumed
    && (moveHandling.logKind === '打乱/进度' || moveHandling.logKind === '打乱/错误')
    && appState === 'ready'
    && scrambleGuideTrackingFacelets === decodedFacelets
  );
  const trackingMoves = Boolean(moveHandling?.trackingMoves);
  const stoppedFromMoves = hasParsedMoves && wasTimingBeforeMoves && appState !== 'timing' && bluetoothSolved;
  const stoppedFromStatePacket = statePacketSolved
    && wasTimingBeforeMoves
    && !stoppedFromMoves
    && stopTimingFromBluetoothSolved(packetReceivedAt, { byStatePacket: true });
  const solvedByStatePacket = stoppedFromStatePacket || markGanBluetoothStateSolved(decoded, {
    trusted: statePacketSolved,
  });
  const updatePacketUi = () => {
    if (decoded.batteryLevel != null) updateBluetoothBattery(decoded.batteryLevel, decoded.protocol || protocol.label);
    if (decoded.gyro) void updateBluetoothGyro(decoded.gyro);
    if (decodedFacelets) {
      updateBluetoothPhysicalState(decoded, {
        solved: statePacketSolved,
        receivedAt: packetReceivedAt,
        skipScrambleGuideSync: guideSyncedByMove,
      });
      if (physicalStateChanged || statePacketSolved) {
        syncBluetoothSolveCubeFromGanState(decoded, null, decodedFacelets);
      }
    }
    if (stoppedFromStatePacket) renderBluetoothMoves();
  };
  if (stoppedFromStatePacket || stoppedFromMoves) {
    requestAnimationFrame(updatePacketUi);
  } else {
    updatePacketUi();
  }

  const ignoredReason = duplicateMovePacket
    ? '重复转动包'
    : (moveHandling?.ignoredReason || (hasParsedMoves && !trackingMoves ? '等待计时' : ''));
  const shouldUpdateStatusTitle = shouldUpdateGanBluetoothStatusForPacket(decoded, parsedMoves, duplicateMovePacket, packetReceivedAt);
  if (shouldUpdateStatusTitle) {
    const statusDetail = hasParsedMoves
      ? `${parsedMoves.join(' ')} · ${moveHandling?.statusLabel || (trackingMoves ? (bluetoothSolved ? '已复原' : '未复原') : '等待计时')}`
      : ganBluetoothStatusDetail(decoded, label, getHex, duplicateMovePacket);
    const statusTrace = bluetoothDebugLogging || elements.bluetoothLogDialog?.open
      ? `${uuid} ${getHex()}`
      : shortUuid(uuid);
    setBluetoothStatusTitle(`${deviceName} · ${statusDetail} · ${statusTrace}`);
  }
  if (shouldLogGanBluetoothPacket(decoded, parsedMoves, duplicateMovePacket)) {
    const packetLogKind = moveHandling?.logKind || ganBluetoothLogKind(decoded, parsedMoves, trackingMoves, duplicateMovePacket);
    if (shouldLogBluetoothMoveEvent(packetLogKind, parsedMoves)) {
      addBluetoothLog(
        packetLogKind,
        label,
        ganBluetoothPacketLogDetail(getHex, decoded, ignoredReason, parsedMoves),
      );
    }
  }
  if (!stoppedFromStatePacket && !stoppedFromMoves && solvedByStatePacket) finishTimingFromBluetooth(packetReceivedAt);
  if (bluetoothDebugLogging) {
    console.info('GAN Bluetooth cube notification', {
      characteristic: uuid,
      value: getHex(),
      decoded,
      moves: parsedMoves,
      duplicate: duplicateMovePacket,
      tracked: trackingMoves,
    });
  }
}

function processGanGyroOnlyPacket(
  uuid,
  deviceName,
  getHex,
  label,
  packetReceivedAt,
  decoded,
) {
  const parsedMoves = emptyBluetoothMoves;
  incrementPerformanceCounter('ganGyroFastPathPackets');
  if (decoded?.gyro) void updateBluetoothGyro(decoded.gyro);
  const solvedByStatePacket = markGanBluetoothStateSolved(decoded);
  if (shouldUpdateGanBluetoothStatusForPacket(decoded, parsedMoves, false, packetReceivedAt)) {
    const statusTrace = bluetoothDebugLogging || elements.bluetoothLogDialog?.open
      ? `${uuid} ${getHex()}`
      : shortUuid(uuid);
    setBluetoothStatusTitle(
      `${deviceName} · ${ganBluetoothStatusDetail(decoded, label, getHex, false)} · ${statusTrace}`,
    );
  }
  if (shouldLogGanBluetoothPacket(decoded, parsedMoves, false)) {
    const packetLogKind = ganBluetoothLogKind(decoded, parsedMoves, false, false);
    if (shouldLogBluetoothMoveEvent(packetLogKind, parsedMoves)) {
      addBluetoothLog(
        packetLogKind,
        label,
        ganBluetoothPacketLogDetail(getHex, decoded, '', parsedMoves),
      );
    }
  }
  if (solvedByStatePacket) finishTimingFromBluetooth(packetReceivedAt);
}

function shouldUpdateGanBluetoothStatusForPacket(decoded, parsedMoves = emptyBluetoothMoves, duplicateMovePacket = false, now = performance.now(), options = {}) {
  if (!decoded) return true;
  if (parsedMoves.length > 0) return true;
  if (duplicateMovePacket && Array.isArray(decoded.moves) && decoded.moves.length > 0) return true;
  if (decoded.batteryLevel != null || decoded.mode === 'hardware' || decoded.mode === 'invalid') return true;
  if (!isHighFrequencyGanStatePacket(decoded)) return true;
  return shouldUpdateGanBluetoothStatusTitle(now, options);
}

function shouldSkipUnchangedGanStatePacket(
  decoded,
  parsedMoves = emptyBluetoothMoves,
  duplicateMovePacket = false,
  physicalStateChanged = false,
  statePacketSolved = false,
  now = performance.now(),
) {
  if (decoded?.stateUnchanged && parsedMoves.length === 0) {
    if (decoded.batteryLevel != null || decoded.mode === 'hardware' || decoded.mode === 'invalid') return false;
    if (statePacketSolved && appState === 'timing') return false;
    if (elements.bluetoothLogDialog?.open || bluetoothDebugLogging) return false;
    if (shouldUpdateGanBluetoothStatusForPacket(decoded, parsedMoves, duplicateMovePacket, now, { commit: false })) return false;
    bluetoothPhysicalStateReceivedAt = now;
    incrementPerformanceCounter('ganSkippedUnchangedStatePackets');
    return true;
  }
  if (!decoded?.facelets || physicalStateChanged || parsedMoves.length > 0) return false;
  if (decoded.batteryLevel != null || decoded.mode === 'hardware' || decoded.mode === 'invalid') return false;
  if (statePacketSolved && appState === 'timing') return false;
  if (elements.bluetoothLogDialog?.open || bluetoothDebugLogging) return false;
  if (decoded.gyro && bluetoothGanGyroPayloadNeeded()) return false;
  if (shouldUpdateGanBluetoothStatusForPacket(decoded, parsedMoves, duplicateMovePacket, now, { commit: false })) return false;
  bluetoothPhysicalStateReceivedAt = now;
  incrementPerformanceCounter('ganSkippedUnchangedStatePackets');
  return true;
}

function decodeGanBluetoothPacket(protocol, mac, bytes) {
  const normalizedBytes = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  const needsGyroPayload = bluetoothGanGyroPayloadNeeded();
  const debugPayload = elements.bluetoothLogDialog?.open || bluetoothDebugLogging;
  const stateSignatureFastPath = protocol.protocol === 'v4' && !debugPayload;
  const payload = {
    protocol: protocol.protocol,
    mac,
    keyVersion: protocol.keyVersion || 0,
    bytes: normalizedBytes,
    skipGyroPayload: !needsGyroPayload,
    includeStateSignature: stateSignatureFastPath || debugPayload,
    includeStateDetails: debugPayload,
    includeDecryptedBytes: debugPayload,
    omitRepeatedStateFacelets: stateSignatureFastPath,
    previousStateSignature: bluetoothGanLastDecodedStateSignature,
    previousStateSolved: bluetoothPhysicalSolved,
  };
  const now = performance.now();
  if (now >= bluetoothGanFastDecodeDisabledUntil) {
    try {
      const decoded = decodeGanBluetoothPacketFast(payload);
      if (decoded) {
        bluetoothGanFastDecodeFailureCount = 0;
        bluetoothGanFastDecodeDisabledUntil = 0;
        return decoded;
      }
    } catch (error) {
      handleGanFastDecodeFailure(error, now);
    }
  }
  return postJson('/api/bluetooth/gan/decode', {
    ...payload,
    bytes: [...normalizedBytes],
  });
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === 'function');
}

function handleGanFastDecodeFailure(error, now = performance.now()) {
  bluetoothGanFastDecodeFailureCount += 1;
  const detail = error?.message || String(error);
  if (bluetoothGanFastDecodeFailureCount >= bluetoothGanFastDecodeFailureLimit) {
    bluetoothGanFastDecodeDisabledUntil = now + bluetoothGanFastDecodeCooldownMs;
    bluetoothGanFastDecodeFailureCount = 0;
    if (now - bluetoothGanFastDecodeLastWarningAt >= bluetoothGanFastDecodeWarningMs) {
      bluetoothGanFastDecodeLastWarningAt = now;
      addBluetoothLog('警告', '浏览器本地 GAN 解码连续失败，短暂回退服务端解码', detail);
    }
    return;
  }
  if (now - bluetoothGanFastDecodeLastWarningAt >= bluetoothGanFastDecodeWarningMs) {
    bluetoothGanFastDecodeLastWarningAt = now;
    addBluetoothLog('警告', '浏览器本地 GAN 解码单包失败，已仅回退当前包', detail);
  }
}

function resetGanFastDecodeState() {
  bluetoothGanFastDecodeDisabledUntil = 0;
  bluetoothGanFastDecodeFailureCount = 0;
  bluetoothGanFastDecodeLastWarningAt = 0;
}

function shouldSkipGanGyroOnlyPacket(decoded, packetSequence) {
  if (!isGanGyroOnlyPacket(decoded, emptyBluetoothMoves)) return false;
  if (packetSequence < bluetoothGanLatestAppliedGyroSequence) {
    incrementPerformanceCounter('ganSkippedGyroPackets');
    return true;
  }
  bluetoothGanLatestAppliedGyroSequence = packetSequence;
  if (shouldDropBackloggedGanGyroPacket()) {
    incrementPerformanceCounter('ganSkippedBackloggedGyroPackets');
    return true;
  }
  const shouldSkip = !bluetoothGanGyroPayloadNeeded();
  if (shouldSkip) incrementPerformanceCounter('ganSkippedGyroPackets');
  return shouldSkip;
}

function shouldDropBackloggedGanGyroPacket() {
  return Boolean(
    bluetoothGyroPreviewMode()
    && pageVisible()
    && ganBluetoothPacketQueueLength() > 0
    && !elements.bluetoothLogDialog?.open
    && !bluetoothDebugLogging
  );
}

function bluetoothGanGyroPayloadNeeded() {
  return Boolean(
    (bluetoothGyroPreviewMode() && pageVisible())
    || elements.bluetoothLogDialog?.open
    || bluetoothDebugLogging
  );
}

function isGanGyroOnlyPacket(decoded, parsedMoves = emptyBluetoothMoves) {
  return Boolean(
    (decoded?.mode === 'gyro' || decoded?.gyro)
    && parsedMoves.length === 0
    && (!Array.isArray(decoded.moves) || decoded.moves.length === 0)
    && decoded.batteryLevel == null
    && !decoded.facelets
  );
}

function shouldLogGanBluetoothPacket(decoded, parsedMoves = emptyBluetoothMoves, duplicateMovePacket = false) {
  if (!decoded) return true;
  if (duplicateMovePacket) return false;
  if (parsedMoves.length > 0) return true;
  if (isGanGyroOnlyPacket(decoded, parsedMoves) && !elements.bluetoothLogDialog?.open && !bluetoothDebugLogging) return false;
  if (decoded.batteryLevel != null || decoded.mode === 'hardware' || decoded.mode === 'invalid') return true;
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

function shouldLogBluetoothMoveEvent(kind, parsedMoves = emptyBluetoothMoves, now = performance.now()) {
  if (!parsedMoves.length) return true;
  if (elements.bluetoothLogDialog?.open || bluetoothDebugLogging) return true;
  if (!isHighFrequencyBluetoothMoveLogKind(kind)) return true;
  if (now - bluetoothHighFrequencyMoveLogAt >= bluetoothHighFrequencyMoveLogIntervalMs) {
    bluetoothHighFrequencyMoveLogAt = now;
    return true;
  }
  incrementPerformanceCounter('bluetoothMoveLogSkipped');
  return false;
}

function isHighFrequencyBluetoothMoveLogKind(kind) {
  return kind === '打乱/进度' || kind === '数据/转动' || kind === '数据/预备转动';
}

function shouldUpdateGanBluetoothStatusTitle(now = performance.now(), options = {}) {
  if (bluetoothGanLastStatusTitleAt > 0 && now - bluetoothGanLastStatusTitleAt < bluetoothGyroStatusFrameMs) return false;
  if (options.commit !== false) bluetoothGanLastStatusTitleAt = now;
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

function ganBluetoothStatusDetail(decoded, label, getHex, duplicateMovePacket) {
  if (duplicateMovePacket) return `${decoded.moves.join(' ')} · 重复转动包`;
  if (decoded.batteryLevel != null) return `电量 ${decoded.batteryLevel}%`;
  if (decoded.gyro) return `GAN 陀螺仪 · q=${formatGyroQuaternion(decoded.gyro.quaternion)}`;
  if (decoded.mode === 'state') {
    const stateLabel = decoded.stateSolved === true ? '已复原' : '未复原';
    return `GAN 状态包 · ${stateLabel} · 色块已同步 · counter=${decoded.moveCounter ?? '-'}`;
  }
  if (decoded.mode === 'hardware') return 'GAN 硬件信息';
  if (decoded.mode === 'invalid') return `GAN 解密结果无效 · ${getHex().slice(0, 23)}`;
  return `${label} ${getHex().slice(0, 17)}`;
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
  if (decoded.stateSolvedUntrusted) detail.push('stateSolvedUntrusted=true');
  if (decoded.facelets) detail.push(`facelets=${decoded.facelets}`);
  if (Array.isArray(decoded.decryptedBytes)) detail.push(`decrypted=${bytesToHex(decoded.decryptedBytes)}`);
  if (Array.isArray(decoded.historyMoves) && decoded.historyMoves.length > decoded.moves.length) {
    detail.push(`history=${decoded.historyMoves.join(' ')}`);
  }
  if (Array.isArray(decoded.moves) && decoded.moves.length > 0) detail.push(`moves=${decoded.moves.join(' ')}`);
  if (ignoredReason) detail.push(`未计入=${ignoredReason}`);
  return detail.join(' · ');
}

function ganBluetoothPacketLogDetail(getHex, decoded, ignoredReason = '', parsedMoves = emptyBluetoothMoves) {
  if (bluetoothDebugLogging || elements.bluetoothLogDialog?.open || parsedMoves.length === 0) {
    return ganBluetoothPacketLog(getHex(), decoded, ignoredReason);
  }
  const detail = [];
  if (decoded.protocol) detail.push(`protocol=${decoded.protocol}`);
  if (decoded.mode) detail.push(`mode=${decoded.mode}`);
  if (Number.isInteger(decoded.moveCounter)) detail.push(`counter=${decoded.moveCounter}`);
  if (parsedMoves.length > 0) detail.push(`moves=${parsedMoves.join(' ')}`);
  if (ignoredReason) detail.push(`未计入=${ignoredReason}`);
  return detail.join(' · ');
}

function syncBluetoothSolveCubeFromGanState(decoded, faces = null, facelets = '') {
  const syncedFacelets = String(facelets || decoded?.facelets || '');
  if (appState !== 'timing' || (!faces && !syncedFacelets)) return false;
  if (Number.isInteger(decoded.moveCounter) && Number.isInteger(bluetoothGanLastMoveCounter)) {
    const delta = ganBluetoothMoveCounterDelta(
      decoded.moveCounter,
      bluetoothGanLastMoveCounter,
      decoded.counterModulo,
    );
    if (!Number.isInteger(delta) || delta > 6) return false;
  }

  try {
    const previousFacelets = bluetoothSolveFacelets;
    const nextFacelets = /^[URFDLB]{54}$/.test(syncedFacelets)
      ? syncedFacelets
      : faceletsFromFaces(faces);
    recordBluetoothStateCorrection(decoded, nextFacelets, {
      previousFacelets,
      reason: decoded?.stateSolved === true ? 'state-solved-sync' : 'state-sync',
    });
    bluetoothSolveFacelets = /^[URFDLB]{54}$/.test(syncedFacelets)
      ? syncedFacelets
      : nextFacelets;
    bluetoothSolveCubeValid = true;
    bluetoothMoveDerivedFaces = faces || null;
    bluetoothMoveDerivedFacelets = bluetoothSolveFacelets;
    bluetoothMoveDerivedSignature = cubeFaceletSignature(bluetoothMoveDerivedFacelets);
    bluetoothMoveDerivedStateTime = performance.now();
    bluetoothMoveDerivedSolved = isSolvedFacelets(bluetoothMoveDerivedFacelets);
    return true;
  } catch (error) {
    bluetoothSolveCubeValid = false;
    bluetoothSolveFacelets = '';
    bluetoothMoveDerivedFaces = null;
    bluetoothMoveDerivedFacelets = '';
    bluetoothMoveDerivedSignature = '';
    bluetoothMoveDerivedStateTime = 0;
    bluetoothMoveDerivedSolved = false;
    addBluetoothLog('警告', 'GAN 状态校准失败，继续使用转动包判定', error.message || String(error));
    return false;
  }
}

function maybeRecordGanStateCorrectionForPacket(decoded, facelets = '', parsedMoves = emptyBluetoothMoves, statePacketSolved = false) {
  const text = String(facelets || '').trim().toUpperCase();
  if (appState !== 'timing' || !/^[URFDLB]{54}$/.test(text)) return false;
  const predictedFacelets = predictedBluetoothSolveFaceletsAfterMoves(parsedMoves);
  return recordBluetoothStateCorrection(decoded, text, {
    previousFacelets: predictedFacelets,
    step: bluetoothMoveSequence().length + parsedMoves.length,
    reason: statePacketSolved ? 'state-solved-sync' : 'state-sync',
  });
}

function predictedBluetoothSolveFaceletsAfterMoves(moves = emptyBluetoothMoves) {
  const startFacelets = String(bluetoothSolveFacelets || '');
  if (!/^[URFDLB]{54}$/.test(startFacelets)) return startFacelets;
  if (!Array.isArray(moves) || moves.length === 0) return startFacelets;
  try {
    return applyMovesToFacelets(startFacelets, moves);
  } catch {
    return startFacelets;
  }
}

function trustedGanStatePacketSolved(decoded, decodedFacelets = '', physicalStateChanged = false) {
  if (!decoded) return false;
  const hasFacelets = Boolean(decodedFacelets);
  if (hasFacelets) return isSolvedFacelets(decodedFacelets);
  if (decoded.stateSolved !== true) return false;
  if (bluetoothMoveDerivedSolved && bluetoothMoveDerivedStateTime >= startedAt) return true;
  return Boolean(
    bluetoothPhysicalSolved
    && bluetoothPhysicalFacelets
    && bluetoothPhysicalStateReceivedAt >= startedAt
    && (!physicalStateChanged || isSolvedFacelets(bluetoothPhysicalFacelets))
  );
}

function markGanBluetoothStateSolved(decoded, options = {}) {
  const trusted = options.trusted === true || options.force === true;
  const decodedSolved = decoded?.stateSolved === true;
  if (options.force !== true && (!trusted || !decodedSolved)) return false;
  if (appState !== 'timing') return false;
  bluetoothSolved = true;
  bluetoothSolvedByStatePacket = true;
  if (options.render !== false) scheduleBluetoothMovesRender();
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
  if (bluetoothBatteryLevel === level) return false;
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
  scheduleBluetoothLogRender({ immediate: true });
}

function updateBluetoothGyro(gyro) {
  if (!gyro?.quaternion) return;
  if (!bluetoothGyroPreviewMode() || !pageVisible()) return bluetoothGyro;
  const now = performance.now();
  const raw = bluetoothGyroRawSample(gyro, bluetoothGyroRawScratch);
  if (!raw) return bluetoothGyro;
  if (!shouldAcceptBluetoothGyroSample(raw, now)) {
    incrementPerformanceCounter('ganRejectedGyroSamples');
    return bluetoothGyro;
  }
  rememberAcceptedBluetoothGyroSample(raw, now);
  incrementPerformanceCounter('ganAcceptedGyroSamples');
  bluetoothPendingGyro = gyro;
  if (!THREE || !cube3d) {
    bluetoothGyroLastUpdateAt = now;
    if (!bluetoothGyroLoadPromise) {
      bluetoothGyroLoadPromise = ensureBluetoothCube3dReady()
        .then((ready) => {
          bluetoothGyroLoadPromise = null;
          if (ready) scheduleBluetoothGyroUpdate();
        })
        .catch((error) => {
          bluetoothGyroLoadPromise = null;
          addBluetoothLog('错误', '陀螺仪 3D 依赖加载失败', error.message || String(error));
        });
    }
    return bluetoothGyroLoadPromise;
  }
  scheduleBluetoothGyroUpdate();
}

function shouldAcceptBluetoothGyroSample(raw, now = performance.now()) {
  return shouldAcceptGyroRawSample(raw, bluetoothLastAcceptedGyroRaw, now - bluetoothLastAcceptedGyroAt);
}

function rememberAcceptedBluetoothGyroSample(raw, now = performance.now()) {
  if (!raw) return;
  if (!bluetoothLastAcceptedGyroRaw) {
    bluetoothLastAcceptedGyroRaw = { qw: 1, qx: 0, qy: 0, qz: 0, vx: 0, vy: 0, vz: 0 };
  }
  bluetoothLastAcceptedGyroRaw.qw = raw.qw;
  bluetoothLastAcceptedGyroRaw.qx = raw.qx;
  bluetoothLastAcceptedGyroRaw.qy = raw.qy;
  bluetoothLastAcceptedGyroRaw.qz = raw.qz;
  bluetoothLastAcceptedGyroRaw.vx = raw.vx;
  bluetoothLastAcceptedGyroRaw.vy = raw.vy;
  bluetoothLastAcceptedGyroRaw.vz = raw.vz;
  bluetoothLastAcceptedGyroAt = now;
}

function bluetoothGyroRawSample(gyro, target = {}) {
  const qw = Number(gyro?.quaternion?.w);
  const qx = Number(gyro?.quaternion?.x);
  const qy = Number(gyro?.quaternion?.y);
  const qz = Number(gyro?.quaternion?.z);
  const vx = Number(gyro?.velocity?.x ?? 0);
  const vy = Number(gyro?.velocity?.y ?? 0);
  const vz = Number(gyro?.velocity?.z ?? 0);
  if (
    !Number.isFinite(qw)
    || !Number.isFinite(qx)
    || !Number.isFinite(qy)
    || !Number.isFinite(qz)
    || !Number.isFinite(vx)
    || !Number.isFinite(vy)
    || !Number.isFinite(vz)
  ) return null;
  const length = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
  if (!Number.isFinite(length) || length <= 0) return null;
  target.qw = qw / length;
  target.qx = qx / length;
  target.qy = qy / length;
  target.qz = qz / length;
  target.vx = vx;
  target.vy = vy;
  target.vz = vz;
  return target;
}

function scheduleBluetoothGyroUpdate() {
  if (!bluetoothGyroPreviewMode() || !pageVisible()) {
    bluetoothPendingGyro = null;
    return;
  }
  if (bluetoothGyroUpdateFrame) return;
  bluetoothGyroUpdateFrame = requestAnimationFrame(() => {
    bluetoothGyroUpdateFrame = 0;
    const latestGyro = bluetoothPendingGyro;
    bluetoothPendingGyro = null;
    if (latestGyro && bluetoothGyroPreviewMode() && pageVisible()) applyBluetoothGyroUpdate(latestGyro);
  });
}

function applyBluetoothGyroUpdate(gyro) {
  bluetoothGyroLastUpdateAt = performance.now();
  const basisQuaternion = bluetoothGyroQuaternionFromPacket(gyro.quaternion, cube3d?.gyroPacketQuaternion);
  if (!basisQuaternion) return;
  if (bluetoothGyroLastBasisQuaternion && bluetoothGyroLastBasisQuaternion.dot(basisQuaternion) < 0) {
    basisQuaternion.set(-basisQuaternion.x, -basisQuaternion.y, -basisQuaternion.z, -basisQuaternion.w);
  }
  if (!bluetoothGyroReferenceInverse) {
    bluetoothGyroReferenceInverse = new THREE.Quaternion();
    addBluetoothLog('陀螺仪', '绝对姿态已同步', '白面/黄面朝上由 GAN q 参数直接驱动');
  }
  if (!bluetoothGyroLastBasisQuaternion) bluetoothGyroLastBasisQuaternion = new THREE.Quaternion();
  bluetoothGyroLastBasisQuaternion.copy(basisQuaternion);
  const displayQuaternion = cube3d
    ? cube3d.gyroDisplayQuaternion.copy(cube3d.baseQuaternion).multiply(basisQuaternion)
    : basisQuaternion;
  bluetoothGyro = updateBluetoothGyroState(bluetoothGyro, basisQuaternion, displayQuaternion, gyro);
  if (cube3d?.targetQuaternion) {
    if (updateBluetoothCube3dGyroTarget(displayQuaternion, bluetoothGyroLastUpdateAt)) {
      scheduleBluetoothCube3dAnimation();
    }
  }
  scheduleBluetoothCube3dTelemetryRender();
  return bluetoothGyro;
}

function updateBluetoothGyroState(state, basisQuaternion, displayQuaternion, gyro) {
  const nextState = state || {
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    displayQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    rawQuaternion: null,
    rawVelocity: null,
    raw: null,
    isoTime: '',
  };
  assignQuaternionObject(nextState.quaternion, basisQuaternion);
  assignQuaternionObject(nextState.displayQuaternion, displayQuaternion);
  assignBluetoothGyroVelocity(nextState.velocity, gyro.velocity || {});
  if (bluetoothGyroDebugPayloadEnabled()) {
    nextState.rawQuaternion = assignRawQuaternionObject(nextState.rawQuaternion, gyro.quaternion || {});
    nextState.rawVelocity = gyro.velocity ? assignRawVelocityObject(nextState.rawVelocity, gyro.velocity) : null;
    nextState.raw = gyro.raw ? { ...(nextState.raw || {}), ...gyro.raw } : null;
    nextState.isoTime = new Date().toISOString();
  } else {
    nextState.rawQuaternion = null;
    nextState.rawVelocity = null;
    nextState.raw = null;
    nextState.isoTime = '';
  }
  return nextState;
}

function bluetoothGyroDebugPayloadEnabled() {
  return bluetoothDebugLogging || Boolean(elements.bluetoothLogDialog?.open);
}

function assignQuaternionObject(target, quaternion) {
  target.x = quaternion.x;
  target.y = quaternion.y;
  target.z = quaternion.z;
  target.w = quaternion.w;
  return target;
}

function assignRawQuaternionObject(target, quaternion) {
  const output = target || { x: 0, y: 0, z: 0, w: 1 };
  output.x = Number(quaternion.x);
  output.y = Number(quaternion.y);
  output.z = Number(quaternion.z);
  output.w = Number(quaternion.w);
  return output;
}

function assignRawVelocityObject(target, velocity) {
  const output = target || { x: 0, y: 0, z: 0 };
  output.x = Number(velocity.x);
  output.y = Number(velocity.y);
  output.z = Number(velocity.z);
  return output;
}

function assignBluetoothGyroVelocity(target, velocity = {}) {
  if (ganGyroVelocityToCube3dBasisInto(velocity, target)) return target;
  return assignRawVelocityObject(target, velocity);
}

function updateBluetoothCube3dGyroTarget(displayQuaternion, sampleAt = performance.now()) {
  if (!cube3d) return false;
  if (!bluetooth3dGyroEnabled) {
    cube3d.targetQuaternion.copy(cube3d.baseQuaternion);
    resetBluetoothCube3dGyroSamples();
    cube3d.needsRender = true;
    return true;
  }
  const changed = quaternionAngularDistanceGreater(
    cube3d.group.quaternion,
    displayQuaternion,
    cube3dGyroTargetDotThreshold,
  );
  if (cube3d.gyroHasSample) {
    cube3d.gyroPreviousQuaternion.copy(cube3d.gyroLatestQuaternion);
    cube3d.gyroPreviousSampleAt = cube3d.gyroSampleAt;
    cube3d.gyroHasPreviousSample = true;
  }
  cube3d.gyroLatestQuaternion.copy(displayQuaternion);
  cube3d.gyroSampleAt = sampleAt;
  cube3d.gyroHasSample = true;
  cube3d.gyroPoseTargetFrameAt = -1;
  cube3d.targetQuaternion.copy(displayQuaternion);
  if (changed) cube3d.needsRender = true;
  return changed;
}

function resetBluetoothGyro() {
  bluetoothGyro = null;
  bluetoothGyroLastUpdateAt = 0;
  bluetoothGyroReferenceInverse = null;
  bluetoothGyroLastBasisQuaternion = null;
  bluetoothPendingGyro = null;
  bluetoothLastAcceptedGyroRaw = null;
  bluetoothLastAcceptedGyroAt = 0;
  cancelBluetoothGyroUpdate();
  stopBluetoothCube3dTelemetryRender();
  if (cube3d?.targetQuaternion) cube3d.targetQuaternion.copy(cube3d.baseQuaternion);
  resetBluetoothCube3dGyroSamples();
  cube3dTelemetryTextKey = '';
  markBluetoothCube3dDirty();
  scheduleBluetoothCube3dTelemetryRender({ immediateStatic: false });
}

function cancelBluetoothGyroUpdate() {
  bluetoothPendingGyro = null;
  if (bluetoothGyroUpdateFrame) {
    cancelAnimationFrame(bluetoothGyroUpdateFrame);
    bluetoothGyroUpdateFrame = 0;
  }
}

function resetBluetoothCube3dGyroSamples() {
  if (!cube3d) return;
  cube3d.gyroSampleAt = 0;
  cube3d.gyroPreviousSampleAt = 0;
  cube3d.gyroHasSample = false;
  cube3d.gyroHasPreviousSample = false;
  cube3d.gyroPoseTargetFrameAt = -1;
}

function bluetoothGyroQuaternionFromPacket(quaternion = {}, target = null) {
  const mapped = ganGyroQuaternionToCube3dBasisInto(quaternion, bluetoothGyroMappedQuaternionScratch);
  if (!mapped) return null;
  const output = target || new THREE.Quaternion();
  output.set(mapped.x, mapped.y, mapped.z, mapped.w);
  output.normalize();
  return output;
}

function updateBluetoothPhysicalState(decoded, options = {}) {
  const facelets = String(decoded.facelets || '');
  if (!/^[URFDLB]{54}$/.test(facelets)) return;
  const changed = facelets !== bluetoothPhysicalFacelets;
  const receivedAt = options.receivedAt || performance.now();
  const solved = options.solved === true
    || (options.solved !== false && isSolvedFacelets(facelets));
  if (!changed) {
    if (options.faces && !bluetoothPhysicalFaces) bluetoothPhysicalFaces = options.faces;
    if (options.solved === true) bluetoothPhysicalSolved = true;
    bluetoothPhysicalStateReceivedAt = receivedAt;
    return shouldMaterializeBluetoothPhysicalFaces(options)
      ? materializeBluetoothPhysicalFaces()
      : bluetoothPhysicalFaces;
  }

  bluetoothPhysicalFacelets = decoded.facelets;
  bluetoothPhysicalFaces = options.faces || null;
  bluetoothPhysicalSignature = cubeFaceletSignature(facelets);
  bluetoothPhysicalSolved = solved;
  bluetoothPhysicalStateReceivedAt = receivedAt;
  bluetoothPhysicalStateTime = new Date().toISOString();
  if (appState === 'ready' && bluetoothScrambleGuideActive()) {
    if (options.skipScrambleGuideSync) {
      incrementPerformanceCounter('scrambleGuidePhysicalSyncSkips');
    } else {
      syncScrambleGuideFromSyncedState(bluetoothPhysicalFaces, decoded.protocol || 'GAN 状态包', facelets);
    }
  }
  const faces = shouldMaterializeBluetoothPhysicalFaces(options)
    ? materializeBluetoothPhysicalFaces()
    : null;
  if (options.render === false) {
    if (faces) renderBluetoothCube3dLiveFaces(faces);
    return faces;
  }
  if (faces) renderBluetoothCube3dLiveFaces(faces);
  scheduleBluetoothMovesRender({ skipStatePreview: !elements.bluetoothLogDialog?.open });
  return faces;
}

function shouldMaterializeBluetoothPhysicalFaces(options = {}) {
  return Boolean(
    options.faces
    || bluetoothLivePreviewMode()
    || elements.bluetoothLogDialog?.open
  );
}

function renderBluetoothCube3dLiveFaces(faces = bluetoothPhysicalFaces) {
  if (!faces || !bluetoothLivePreviewMode()) return;
  if (!cube3d) {
    void ensureBluetoothCube3dReady().then((ready) => {
      if (ready) renderBluetoothCube3dLiveFaces(faces);
    });
    return;
  }
  const solved = faces === bluetoothPhysicalFaces ? bluetoothPhysicalSolved : isSolvedFaces(faces);
  renderBluetoothCube3d(faces, `GAN 实时状态 · ${solved ? '已复原' : '未复原'}`, {
    signature: bluetooth3dLiveFacesSignature(faces),
  });
}

function bluetooth3dLiveFacesSignature(faces) {
  if (faces === bluetoothMoveDerivedFaces) return bluetoothMoveDerivedSignature;
  if (faces === bluetoothPhysicalFaces) return bluetoothPhysicalSignature;
  return '';
}

function resetBluetoothPhysicalState() {
  bluetoothPhysicalFacelets = '';
  bluetoothPhysicalFaces = null;
  bluetoothPhysicalSignature = '';
  bluetoothPhysicalSolved = false;
  bluetoothPhysicalStateTime = '';
  bluetoothPhysicalStateReceivedAt = 0;
  renderPreviewMode();
}

function facesFromFacelets(facelets) {
  const text = String(facelets || '');
  if (!/^[URFDLB]{54}$/.test(text)) return null;
  try {
    return cubeFacesFromFacelets(text);
  } catch {
    return null;
  }
}

function isSolvedFacelets(facelets) {
  return cubeIsSolvedFacelets(facelets);
}

function faceletsFromFaces(faces) {
  let facelets = '';
  for (const face of cube3dFaces) {
    const rows = faces?.[face];
    if (!Array.isArray(rows)) {
      facelets += face.repeat(9);
      continue;
    }
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        facelets += rows[row]?.[col]?.face || face;
      }
    }
  }
  return facelets;
}

function openBluetoothLogDialog() {
  renderBluetoothLog();
  if (!elements.bluetoothLogDialog.open) elements.bluetoothLogDialog.showModal();
}

function addBluetoothLog(kind, message, detail = '') {
  incrementPerformanceCounter('bluetoothLogEvents');
  const timestamp = bluetoothLogTimestamp();
  bluetoothLog.unshift({
    time: timestamp.time,
    isoTime: timestamp.isoTime,
    kind,
    message,
    detail,
  });
  if (bluetoothLog.length > 120) bluetoothLog.length = 120;
  scheduleBluetoothLogRender();
}

function bluetoothLogTimestamp(nowMs = Date.now()) {
  const date = new Date(nowMs);
  const second = Math.floor(nowMs / 1000);
  if (second !== bluetoothLogTimeSecond) {
    bluetoothLogTimeSecond = second;
    bluetoothLogTimeText = date.toLocaleTimeString();
  }
  return {
    time: bluetoothLogTimeText,
    isoTime: date.toISOString(),
  };
}

function scheduleBluetoothLogRender(options = {}) {
  if (!pageVisible()) {
    cancelScheduledBluetoothLogRender();
    return;
  }
  if (bluetoothLogRenderTimer || bluetoothLogRenderFrame) return;
  const now = performance.now();
  const elapsed = now - bluetoothLogLastRenderAt;
  const delay = options.immediate || elapsed >= bluetoothLogRenderIntervalMs
    ? 0
    : bluetoothLogRenderIntervalMs - elapsed;
  const queueFrame = () => {
    bluetoothLogRenderTimer = 0;
    if (!bluetoothLogRenderFrame) {
      bluetoothLogRenderFrame = requestAnimationFrame(flushBluetoothLogRender);
    }
  };
  if (delay <= 0) queueFrame();
  else bluetoothLogRenderTimer = window.setTimeout(queueFrame, delay);
}

function flushBluetoothLogRender() {
  bluetoothLogRenderFrame = 0;
  bluetoothLogLastRenderAt = performance.now();
  renderBluetoothFeed();
  if (elements.bluetoothLogDialog?.open) renderBluetoothLog();
}

function cancelScheduledBluetoothLogRender() {
  if (bluetoothLogRenderTimer) {
    window.clearTimeout(bluetoothLogRenderTimer);
    bluetoothLogRenderTimer = 0;
  }
  if (bluetoothLogRenderFrame) {
    cancelAnimationFrame(bluetoothLogRenderFrame);
    bluetoothLogRenderFrame = 0;
  }
}

function renderBluetoothFeed() {
  if (!elements.bluetoothFeedMeta || !elements.bluetoothFeedRows) return;
  const connected = bluetoothDevice?.gatt?.connected ? '已连接' : '未连接';
  const battery = bluetoothBatteryLevel == null ? '' : ` · 电量 ${bluetoothBatteryLevel}%`;
  const firstEntry = bluetoothLog[0];
  const renderKey = [
    connected,
    battery,
    bluetoothLog.length,
    firstEntry?.isoTime || '',
    firstEntry?.kind || '',
    firstEntry?.message || '',
    firstEntry?.detail || '',
  ].join('|');
  if (renderKey === bluetoothFeedRenderKey) return;
  bluetoothFeedRenderKey = renderKey;
  incrementPerformanceCounter('bluetoothFeedRenders');

  elements.bluetoothFeedMeta.textContent = bluetoothLog.length === 0
    ? `${connected}${battery}`
    : `${connected}${battery} · ${bluetoothLog.length} 条`;

  if (bluetoothLog.length === 0) {
    renderBluetoothFeedEmptyRow();
    return;
  }

  const rowCount = Math.min(bluetoothFeedRowLimit, bluetoothLog.length);
  ensureBluetoothFeedRows(rowCount);
  for (let index = 0; index < rowCount; index += 1) {
    updateBluetoothFeedRow(bluetoothFeedRowNodes[index], bluetoothLog[index], index);
  }
  if (bluetoothFeedRenderedRowCount !== rowCount) {
    bluetoothFeedRenderedRowCount = rowCount;
    elements.bluetoothFeedRows.replaceChildren(...bluetoothFeedRowNodes.slice(0, rowCount));
  }
}

function renderBluetoothFeedEmptyRow() {
  if (!bluetoothFeedEmptyRowNode) bluetoothFeedEmptyRowNode = createBluetoothFeedRowNode();
  const key = 'empty|暂无蓝牙命令|等待蓝牙连接或通知数据';
  if (bluetoothFeedRenderedRowCount === 0 && bluetoothFeedRowKeys[0] === key) return;
  bluetoothFeedRenderedRowCount = 0;
  bluetoothFeedRowKeys = [key];
  updateBluetoothFeedNode(bluetoothFeedEmptyRowNode, {
    className: 'bluetooth-feed-row',
    title: '暂无蓝牙命令',
    time: '-',
    kind: '状态',
    message: '暂无蓝牙命令',
    detail: '等待蓝牙连接或通知数据',
  });
  elements.bluetoothFeedRows.replaceChildren(bluetoothFeedEmptyRowNode);
}

function ensureBluetoothFeedRows(rowCount) {
  while (bluetoothFeedRowNodes.length < rowCount) {
    bluetoothFeedRowNodes.push(createBluetoothFeedRowNode());
  }
}

function createBluetoothFeedRowNode() {
  const row = document.createElement('div');
  const time = document.createElement('span');
  const kind = document.createElement('span');
  const message = document.createElement('span');
  const detail = document.createElement('span');
  time.className = 'feed-time';
  kind.className = 'feed-kind';
  message.className = 'feed-message';
  detail.className = 'feed-detail';
  row.append(time, kind, message, detail);
  row.feedTime = time;
  row.feedKind = kind;
  row.feedMessage = message;
  row.feedDetail = detail;
  return row;
}

function updateBluetoothFeedRow(row, entry, index) {
  const detail = [entry.message, entry.detail].filter(Boolean).join(' · ');
  const className = `bluetooth-feed-row ${bluetoothFeedKindClass(entry.kind)}`.trim();
  const title = [entry.isoTime, entry.kind, detail].filter(Boolean).join(' · ');
  const key = [
    className,
    title,
    entry.time,
    entry.kind,
    entry.message || '-',
    entry.detail || entry.message || '-',
  ].join('|');
  if (bluetoothFeedRowKeys[index] === key) return;
  bluetoothFeedRowKeys[index] = key;
  updateBluetoothFeedNode(row, {
    className,
    title,
    time: entry.time,
    kind: entry.kind,
    message: entry.message || '-',
    detail: entry.detail || entry.message || '-',
  });
}

function updateBluetoothFeedNode(row, state) {
  incrementPerformanceCounter('bluetoothFeedRowUpdates');
  if (row.className !== state.className) row.className = state.className;
  if (row.title !== state.title) row.title = state.title;
  if (row.feedTime.textContent !== state.time) row.feedTime.textContent = state.time;
  if (row.feedKind.textContent !== state.kind) row.feedKind.textContent = state.kind;
  if (row.feedMessage.textContent !== state.message) row.feedMessage.textContent = state.message;
  if (row.feedDetail.textContent !== state.detail) row.feedDetail.textContent = state.detail;
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
  const firstEntry = bluetoothLog[0];
  const renderKey = [
    elements.bluetoothLogDialog?.open ? 1 : 0,
    connected,
    battery,
    bluetoothLog.length,
    firstEntry?.isoTime || '',
    firstEntry?.kind || '',
    firstEntry?.message || '',
    firstEntry?.detail || '',
    bluetoothMoveStepCount(),
  ].join('|');
  if (renderKey === bluetoothLogDialogRenderKey) return;
  bluetoothLogDialogRenderKey = renderKey;
  incrementPerformanceCounter('bluetoothLogDialogRenders');

  elements.bluetoothLogMeta.textContent = `${connected} · ${battery} · ${bluetoothLog.length} 条事件 · ${bluetoothMoveStepCount()} 步`;
  renderBluetoothMoves();

  if (bluetoothLog.length === 0) {
    renderBluetoothLogEmptyRow();
    return;
  }

  const rowCount = bluetoothLog.length;
  ensureBluetoothLogDialogRows(rowCount);
  for (let index = 0; index < rowCount; index += 1) {
    updateBluetoothLogDialogRow(bluetoothLogDialogRowNodes[index], bluetoothLog[index], index);
  }
  if (bluetoothLogDialogRenderedRowCount !== rowCount) {
    bluetoothLogDialogRenderedRowCount = rowCount;
    elements.bluetoothLogRows.replaceChildren(...bluetoothLogDialogRowNodes.slice(0, rowCount));
  }
}

function renderBluetoothLogEmptyRow() {
  if (!bluetoothLogDialogEmptyRowNode) bluetoothLogDialogEmptyRowNode = createBluetoothLogDialogRowNode();
  const key = 'empty|-|状态|暂无蓝牙事件';
  if (bluetoothLogDialogRenderedRowCount === 0 && bluetoothLogDialogRowKeys[0] === key) return;
  bluetoothLogDialogRenderedRowCount = 0;
  bluetoothLogDialogRowKeys = [key];
  updateBluetoothLogDialogNode(bluetoothLogDialogEmptyRowNode, {
    title: '',
    timeTitle: '',
    time: '-',
    kind: '状态',
    detail: '暂无蓝牙事件',
  });
  elements.bluetoothLogRows.replaceChildren(bluetoothLogDialogEmptyRowNode);
}

function ensureBluetoothLogDialogRows(rowCount) {
  while (bluetoothLogDialogRowNodes.length < rowCount) {
    bluetoothLogDialogRowNodes.push(createBluetoothLogDialogRowNode());
  }
}

function createBluetoothLogDialogRowNode() {
  const row = document.createElement('div');
  row.className = 'bluetooth-log-row';
  const time = document.createElement('span');
  const kind = document.createElement('span');
  const detail = document.createElement('span');
  row.append(time, kind, detail);
  row.logTime = time;
  row.logKind = kind;
  row.logDetail = detail;
  return row;
}

function updateBluetoothLogDialogRow(row, entry, index) {
  const detail = [entry.message, entry.detail].filter(Boolean).join(' · ');
  const key = [
    entry.isoTime,
    entry.time,
    entry.kind,
    detail,
  ].join('|');
  if (bluetoothLogDialogRowKeys[index] === key) return;
  bluetoothLogDialogRowKeys[index] = key;
  updateBluetoothLogDialogNode(row, {
    title: [entry.isoTime, entry.kind, detail].filter(Boolean).join(' · '),
    timeTitle: entry.isoTime,
    time: entry.time,
    kind: entry.kind,
    detail,
  });
}

function updateBluetoothLogDialogNode(row, state) {
  incrementPerformanceCounter('bluetoothLogDialogRowUpdates');
  if (row.className !== 'bluetooth-log-row') row.className = 'bluetooth-log-row';
  if (row.title !== state.title) row.title = state.title;
  if (row.logTime.title !== state.timeTitle) row.logTime.title = state.timeTitle;
  if (row.logTime.textContent !== state.time) row.logTime.textContent = state.time;
  if (row.logKind.textContent !== state.kind) row.logKind.textContent = state.kind;
  if (row.logDetail.textContent !== state.detail) row.logDetail.textContent = state.detail;
}

function clearBluetoothLog() {
  bluetoothLog = [];
  bluetoothMoves = [];
  bluetoothStateCorrections = [];
  bumpBluetoothMovesVersion();
  bluetoothSolved = false;
  bluetoothSolvedByStatePacket = false;
  bluetoothSolveFacelets = '';
  bluetoothSolveCubeValid = false;
  bluetoothMoveDerivedFaces = null;
  bluetoothMoveDerivedFacelets = '';
  bluetoothMoveDerivedSignature = '';
  bluetoothMoveDerivedStateTime = 0;
  bluetoothMoveDerivedSolved = false;
  lastBluetoothMovePacketSignature = '';
  bluetoothGanLastMoveCounter = null;
  bluetoothGanLastStateCounter = null;
  bluetoothGanLastDecodedStateSignature = '';
  bluetoothGanDecodeWarning = '';
  resetGanFastDecodeState();
  resetGanBluetoothPacketQueue();
  bluetoothGanLastStateLogAt = 0;
  bluetoothGanLastStateLogSignature = '';
  bluetoothGanLastStatusTitleAt = 0;
  bluetoothHighFrequencyMoveLogAt = 0;
  cancelScheduledBluetoothLogRender();
  cancelScheduledBluetoothMovesRender();
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
      stateCounter: bluetoothGanLastStateCounter,
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
    moveCount: bluetoothMoveStepCount(),
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
  const parsedMoves = moves.filter(Boolean);
  if (parsedMoves.length === 0) return;
  const moveReceivedAt = performance.now();
  const cube3dTurnTargets = bluetoothCube3dMoveTargetsFromCurrentSolve(parsedMoves);
  const elapsedMs = appState === 'timing' && startedAt > 0 ? Math.max(0, Math.round(moveReceivedAt - startedAt)) : null;
  const timestampMs = timerStartedAtMs > 0 && elapsedMs != null ? timerStartedAtMs + elapsedMs : Date.now();
  const now = new Date(timestampMs);
  const time = now.toLocaleTimeString();
  const isoTime = now.toISOString();
  const records = Array(parsedMoves.length);
  for (let index = 0; index < parsedMoves.length; index += 1) {
    records[index] = {
      move: parsedMoves[index],
      source,
      protocol,
      deviceName,
      time,
      isoTime,
      elapsedMs,
      timestampMs,
      solveStartedAtMs: timerStartedAtMs || null,
      solveStartedAtIsoTime: timerStartedAtIsoTime,
    };
  }
  for (let index = records.length - 1; index >= 0; index -= 1) bluetoothMoves.unshift(records[index]);
  bumpBluetoothMovesVersion();
  bluetoothSolved = updateBluetoothSolvedFromMoves(parsedMoves);
  bluetoothSolvedByStatePacket = false;
  if (appState === 'timing' && bluetoothSolved) {
    stopTimingFromBluetoothSolved(moveReceivedAt, { byStatePacket: false });
    updateBluetooth3dMoves(parsedMoves, { targets: cube3dTurnTargets });
    scheduleBluetoothMovesRender();
    return;
  }
  updateBluetooth3dMoves(parsedMoves, { targets: cube3dTurnTargets });
  scheduleBluetoothMovesRender();
}

function initializeBluetoothSolveCube() {
  bluetoothSolveFacelets = '';
  bluetoothSolveCubeValid = false;
  bluetoothMoveDerivedFaces = null;
  bluetoothMoveDerivedFacelets = '';
  bluetoothMoveDerivedSignature = '';
  bluetoothMoveDerivedStateTime = 0;
  bluetoothMoveDerivedSolved = false;
  if (!scramble?.scramble || (scramble.puzzle || scramblePuzzle) !== 'three') return;
  try {
    bluetoothSolveFacelets = faceletsFromScramble(scramble.scramble);
    bluetoothSolveCubeValid = true;
    bluetoothMoveDerivedFaces = null;
    bluetoothMoveDerivedFacelets = bluetoothSolveFacelets;
    bluetoothMoveDerivedSignature = cubeFaceletSignature(bluetoothMoveDerivedFacelets);
    bluetoothMoveDerivedStateTime = performance.now();
    bluetoothMoveDerivedSolved = isSolvedFacelets(bluetoothMoveDerivedFacelets);
  } catch (error) {
    addBluetoothLog('警告', '蓝牙复原状态初始化失败', error.message || String(error));
  }
}

function updateBluetoothSolvedFromMoves(moves) {
  if (bluetoothSolveCubeValid && bluetoothSolveFacelets) {
    try {
      bluetoothSolveFacelets = applyMovesToFacelets(bluetoothSolveFacelets, moves);
      bluetoothMoveDerivedFaces = null;
      bluetoothMoveDerivedFacelets = bluetoothSolveFacelets;
      bluetoothMoveDerivedSignature = cubeFaceletSignature(bluetoothMoveDerivedFacelets);
      bluetoothMoveDerivedStateTime = performance.now();
      bluetoothMoveDerivedSolved = isSolvedFacelets(bluetoothMoveDerivedFacelets);
      return bluetoothMoveDerivedSolved;
    } catch (error) {
      bluetoothSolveCubeValid = false;
      bluetoothSolveFacelets = '';
      bluetoothMoveDerivedFaces = null;
      bluetoothMoveDerivedFacelets = '';
      bluetoothMoveDerivedSignature = '';
      bluetoothMoveDerivedStateTime = 0;
      bluetoothMoveDerivedSolved = false;
      addBluetoothLog('警告', '蓝牙增量复原判定失败，已回退完整判定', error.message || String(error));
    }
  }
  return isBluetoothSolved();
}

function bluetoothCube3dMoveTargetsFromCurrentSolve(moves = []) {
  if (!bluetoothSolveCubeValid || !bluetoothSolveFacelets || !Array.isArray(moves) || moves.length === 0) return [];
  return bluetoothCube3dMoveTargetsFromFacelets(bluetoothSolveFacelets, moves);
}

function bluetoothCube3dMoveTargetsFromFacelets(startFacelets, moves = []) {
  const targets = [];
  let facelets = String(startFacelets || '');
  if (!/^[URFDLB]{54}$/.test(facelets)) return targets;
  try {
    for (const move of moves) {
      facelets = applyMoveToFacelets(facelets, move);
      targets.push({
        targetFacelets: facelets,
        targetSignature: cubeFaceletSignature(facelets),
      });
    }
  } catch {
    return [];
  }
  return targets;
}

function renderBluetoothMoves(options = {}) {
  const { shouldUpdateMoveStrip, shouldRenderState } = bluetoothMovesRenderTargets(options);
  if (!shouldUpdateMoveStrip && !shouldRenderState) return;
  const moveText = bluetoothMoveTailText();
  const hasMoves = bluetoothMoves.length > 0;
  const stepCount = bluetoothMoveStepCount();
  const rowText = !hasMoves
    ? (appState === 'timing' ? '暂无解析出的转动' : '计时开始后记录转动')
    : moveText;
  const statusText = !hasMoves
    ? (bluetoothSolved ? '已复原' : (appState === 'timing' ? '未同步' : '等待计时'))
    : (bluetoothSolved ? '已复原' : '未复原');
  const renderKey = [
    shouldUpdateMoveStrip ? 'strip' : 'no-strip',
    stepCount,
    bluetoothMoves.length,
    bluetoothSolved ? 1 : 0,
    appState,
    rowText,
    statusText,
    shouldRenderState ? bluetoothStatePreviewKey() : 'skip-state-preview',
  ].join('|');
  if (renderKey === bluetoothMovesRenderKey) return;
  bluetoothMovesRenderKey = renderKey;
  incrementPerformanceCounter('bluetoothMovesRenders');

  if (shouldUpdateMoveStrip) {
    elements.bluetoothMoveCount.textContent = String(stepCount);
    elements.bluetoothSolveStatus.parentElement.classList.toggle('solved', bluetoothSolved);
    elements.bluetoothSolveStatus.textContent = statusText;
    elements.bluetoothMoveRows.textContent = rowText;
    elements.bluetoothMoveRows.title = hasMoves ? moveText : '';
  }
  if (shouldRenderState) renderBluetoothStateSurface();
}

function scheduleBluetoothMovesRender(options = {}) {
  if (!pageVisible()) {
    cancelScheduledBluetoothMovesRender();
    return;
  }
  const requestedTargets = bluetoothMovesRenderTargets(options);
  if (!requestedTargets.shouldUpdateMoveStrip && !requestedTargets.shouldRenderState) return;
  const nextSkipStatePreview = options.skipStatePreview === true;
  if (!bluetoothMovesRenderPendingOptions) {
    bluetoothMovesRenderPendingOptions = { skipStatePreview: nextSkipStatePreview };
  } else {
    bluetoothMovesRenderPendingOptions.skipStatePreview = (
      bluetoothMovesRenderPendingOptions.skipStatePreview
      && nextSkipStatePreview
    );
  }
  if (bluetoothMovesRenderFrame) {
    incrementPerformanceCounter('bluetoothMovesRenderCoalesced');
    return;
  }
  incrementPerformanceCounter('bluetoothMovesRenderScheduled');
  bluetoothMovesRenderFrame = requestAnimationFrame(() => {
    bluetoothMovesRenderFrame = 0;
    const pendingOptions = bluetoothMovesRenderPendingOptions || {};
    bluetoothMovesRenderPendingOptions = null;
    renderBluetoothMoves(pendingOptions);
  });
}

function bluetoothMovesRenderTargets(options = {}) {
  const shouldUpdateMoveStrip = Boolean(elements.bluetoothLogDialog?.open);
  const shouldRenderState = !options.skipStatePreview
    && (shouldUpdateMoveStrip || solveReplayPreviewActive || bluetoothLivePreviewMode());
  return { shouldUpdateMoveStrip, shouldRenderState };
}

function cancelScheduledBluetoothMovesRender() {
  bluetoothMovesRenderPendingOptions = null;
  if (!bluetoothMovesRenderFrame) return;
  cancelAnimationFrame(bluetoothMovesRenderFrame);
  bluetoothMovesRenderFrame = 0;
}

function renderBluetoothStateSurface() {
  if (elements.bluetoothLogDialog?.open) {
    renderBluetoothStatePreview();
    return;
  }
  if (solveReplayPreviewActive || bluetoothLivePreviewMode()) renderBluetoothCube3dCurrent();
}

function bluetoothMoveSequence() {
  if (bluetoothMoveSequenceVersion !== bluetoothMovesVersion) {
    bluetoothMoveSequenceVersion = bluetoothMovesVersion;
    bluetoothMoveSequenceCache = Array(bluetoothMoves.length);
    for (let index = 0; index < bluetoothMoves.length; index += 1) {
      bluetoothMoveSequenceCache[bluetoothMoves.length - 1 - index] = bluetoothMoves[index].move;
    }
  }
  return bluetoothMoveSequenceCache;
}

function bluetoothMoveTailText(limit = 40) {
  if (bluetoothMoveTailTextVersion !== bluetoothMovesVersion) {
    bluetoothMoveTailTextVersion = bluetoothMovesVersion;
    const length = Math.min(limit, bluetoothMoves.length);
    const output = Array(length);
    for (let index = 0; index < length; index += 1) {
      output[length - 1 - index] = bluetoothMoves[index].move;
    }
    bluetoothMoveTailTextCache = output.join(' ');
  }
  return bluetoothMoveTailTextCache;
}

function bluetoothMoveSequenceText() {
  if (bluetoothMoveTextVersion !== bluetoothMovesVersion) {
    bluetoothMoveTextVersion = bluetoothMovesVersion;
    bluetoothMoveTextCache = bluetoothMoveSequence().join(' ');
  }
  return bluetoothMoveTextCache;
}

function bluetoothMoveStepCount() {
  if (bluetoothMoveStepCountVersion !== bluetoothMovesVersion) {
    bluetoothMoveStepCountVersion = bluetoothMovesVersion;
    bluetoothMoveStepCountCache = countMoveSteps(bluetoothMoveSequence());
  }
  return bluetoothMoveStepCountCache;
}

function bumpBluetoothMovesVersion() {
  bluetoothMovesVersion += 1;
}

function bluetoothMoveRecordSequence() {
  const records = Array(bluetoothMoves.length);
  for (let index = 0; index < bluetoothMoves.length; index += 1) {
    const entry = bluetoothMoves[bluetoothMoves.length - 1 - index];
    records[index] = {
      step: index + 1,
      move: entry.move,
      source: entry.source || '',
      protocol: entry.protocol || '',
      deviceName: entry.deviceName || '',
      time: entry.time || '',
      isoTime: entry.isoTime || '',
      elapsedMs: Number.isFinite(entry.elapsedMs) ? entry.elapsedMs : null,
      timestampMs: Number.isFinite(entry.timestampMs) ? entry.timestampMs : null,
      solveStartedAtMs: Number.isFinite(entry.solveStartedAtMs) ? entry.solveStartedAtMs : null,
      solveStartedAtIsoTime: entry.solveStartedAtIsoTime || '',
    };
  }
  return records;
}

function bluetoothStateCorrectionSequence() {
  return bluetoothStateCorrections.map((entry, index) => ({
    index: index + 1,
    step: entry.step,
    facelets: entry.facelets,
    solved: entry.solved === true,
    source: entry.source || '',
    protocol: entry.protocol || '',
    deviceName: entry.deviceName || '',
    reason: entry.reason || '',
    stateSignature: entry.stateSignature || '',
    moveCounter: Number.isInteger(entry.moveCounter) ? entry.moveCounter : null,
    elapsedMs: Number.isFinite(entry.elapsedMs) ? entry.elapsedMs : null,
    timestampMs: Number.isFinite(entry.timestampMs) ? entry.timestampMs : null,
    isoTime: entry.isoTime || '',
  }));
}

function recordBluetoothStateCorrection(decoded, facelets, options = {}) {
  const text = String(facelets || '').trim().toUpperCase();
  if (appState !== 'timing' || !/^[URFDLB]{54}$/.test(text)) return false;
  const previousFacelets = String(options.previousFacelets || '');
  if (previousFacelets === text) return false;

  const requestedStep = Number(options.step);
  const step = Number.isInteger(requestedStep)
    ? Math.max(0, requestedStep)
    : bluetoothMoveSequence().length;
  const elapsedMs = startedAt > 0 ? Math.max(0, Math.round(performance.now() - startedAt)) : null;
  const timestampMs = timerStartedAtMs > 0 && elapsedMs != null ? timerStartedAtMs + elapsedMs : Date.now();
  const previous = bluetoothStateCorrections.at(-1);
  if (previous?.step === step && previous.facelets === text) return false;

  bluetoothStateCorrections.push({
    step,
    facelets: text,
    solved: isSolvedFacelets(text),
    source: options.source || 'GAN 状态包',
    protocol: decoded?.protocol || options.protocol || '',
    deviceName: bluetoothDevice?.name || '',
    reason: options.reason || 'state-sync',
    stateSignature: decoded?.stateSignature || cubeFaceletSignature(text),
    moveCounter: Number.isInteger(decoded?.moveCounter) ? decoded.moveCounter : null,
    elapsedMs,
    timestampMs,
    isoTime: new Date(timestampMs).toISOString(),
  });
  return true;
}

function bluetoothSolveMetadata() {
  const protocols = [];
  const sources = [];
  const seenProtocols = new Set();
  const seenSources = new Set();
  let deviceName = bluetoothDevice?.name || '';
  for (let index = bluetoothMoves.length - 1; index >= 0; index -= 1) {
    const entry = bluetoothMoves[index];
    if (!deviceName && entry.deviceName) deviceName = entry.deviceName;
    rememberUniqueEntryText(protocols, seenProtocols, entry.protocol);
    rememberUniqueEntryText(sources, seenSources, entry.source);
  }
  return {
    deviceName,
    protocols,
    sources,
  };
}

function rememberUniqueEntryText(output, seen, value) {
  const text = String(value || '').trim();
  if (!text || seen.has(text)) return;
  seen.add(text);
  output.push(text);
}

function resetBluetoothSolveTracking() {
  bluetoothMoves = [];
  bluetoothStateCorrections = [];
  bumpBluetoothMovesVersion();
  bluetoothSolved = false;
  bluetoothSolvedByStatePacket = false;
  bluetoothSolveFacelets = '';
  bluetoothSolveCubeValid = false;
  bluetoothMoveDerivedFaces = null;
  bluetoothMoveDerivedFacelets = '';
  bluetoothMoveDerivedSignature = '';
  bluetoothMoveDerivedStateTime = 0;
  bluetoothMoveDerivedSolved = false;
  updateBluetooth3dMove('-');
  cancelScheduledBluetoothMovesRender();
  renderBluetoothMoves();
}

function isBluetoothSolved() {
  if (!scramble?.scramble || bluetoothMoves.length === 0) return false;
  try {
    const moves = bluetoothMoveSequenceText();
    const facelets = applyMovesToFacelets(faceletsFromScramble(scramble.scramble), moves);
    bluetoothMoveDerivedFaces = null;
    bluetoothMoveDerivedFacelets = facelets;
    bluetoothMoveDerivedSignature = cubeFaceletSignature(facelets);
    bluetoothMoveDerivedStateTime = performance.now();
    bluetoothMoveDerivedSolved = isSolvedFacelets(facelets);
    return bluetoothMoveDerivedSolved;
  } catch (error) {
    bluetoothMoveDerivedFaces = null;
    bluetoothMoveDerivedFacelets = '';
    bluetoothMoveDerivedSignature = '';
    bluetoothMoveDerivedStateTime = 0;
    bluetoothMoveDerivedSolved = false;
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
    const solved = bluetoothMoveDerivedPreviewActive()
      ? bluetoothMoveDerivedSolved
      : (liveFaces === bluetoothPhysicalFaces ? bluetoothPhysicalSolved : isSolvedFaces(liveFaces));
    const stepCount = bluetoothMoveStepCount();
    const metaText = bluetoothMoveDerivedPreviewActive()
      ? `蓝牙转动实时状态 · ${stepCount} 步 · ${solved ? '已复原' : '未复原'}`
      : `GAN 实时状态 · ${solved ? '已复原' : '未复原'}`;
    renderCubeFacesNet(elements.bluetoothStateNet, liveFaces, 'bluetooth-state-net');
    elements.bluetoothStateMeta.textContent = metaText;
    renderBluetoothCube3dIfLive(liveFaces, metaText, { signature: bluetooth3dLiveFacesSignature(liveFaces) });
    return;
  }

  if (bluetoothMoveDerivedStateReady()) {
    const faces = materializeBluetoothMoveDerivedFaces();
    if (!faces) return;
    const stepCount = bluetoothMoveStepCount();
    const metaText = bluetoothMoves.length === 0
      ? (bluetoothSolvedByStatePacket ? 'GAN 状态已复原' : (appState === 'timing' ? '打乱状态' : '计时开始后同步'))
      : `${stepCount} 步 · ${bluetoothSolvedByStatePacket && !bluetoothMoveDerivedSolved ? 'GAN 状态已复原' : (bluetoothMoveDerivedSolved ? '已复原' : '未复原')}`;
    renderCubeFacesNet(elements.bluetoothStateNet, faces, 'bluetooth-state-net');
    elements.bluetoothStateMeta.textContent = metaText;
    renderBluetoothCube3dIfLive(faces, metaText, { signature: bluetoothMoveDerivedSignature });
    return;
  }

  if (bluetoothPhysicalStatePreviewReady()) {
    const faces = materializeBluetoothPhysicalFaces();
    if (!faces) return;
    const solved = bluetoothPhysicalSolved;
    const metaText = `GAN 实时状态 · ${solved ? '已复原' : '未复原'}`;
    renderCubeFacesNet(elements.bluetoothStateNet, faces, 'bluetooth-state-net');
    elements.bluetoothStateMeta.textContent = metaText;
    renderBluetoothCube3dIfLive(faces, metaText, { signature: bluetoothPhysicalSignature });
    return;
  }

  if (!scramble?.scramble) {
    elements.bluetoothStateMeta.textContent = '等待打乱';
    elements.bluetoothStateNet.className = 'bluetooth-state-net preview-loading';
    elements.bluetoothStateNet.textContent = '暂无状态';
    renderBluetoothCube3dIfLive(null, '等待打乱');
    return;
  }

  const moveText = bluetoothMoveSequenceText();
  const stateText = [scramble.scramble, moveText].filter(Boolean).join(' ');
  try {
    const faces = cubeStateFromScramble(stateText);
    const replaySolved = isSolvedFaces(faces);
    const stepCount = bluetoothMoveStepCount();
    const metaText = bluetoothMoves.length === 0
      ? (bluetoothSolvedByStatePacket ? 'GAN 状态已复原' : (appState === 'timing' ? '打乱状态' : '计时开始后同步'))
      : `${stepCount} 步 · ${bluetoothSolvedByStatePacket && !replaySolved ? 'GAN 状态已复原' : (replaySolved ? '已复原' : '未复原')}`;
    renderCubeFacesNet(elements.bluetoothStateNet, faces, 'bluetooth-state-net');
    elements.bluetoothStateMeta.textContent = metaText;
    renderBluetoothCube3dIfLive(faces, metaText);
  } catch (error) {
    elements.bluetoothStateMeta.textContent = '状态无效';
    elements.bluetoothStateNet.className = 'bluetooth-state-net preview-loading';
    elements.bluetoothStateNet.textContent = '无法渲染';
    renderBluetoothCube3dIfLive(null, '状态无效');
  }
}

function materializeBluetoothMoveDerivedFaces() {
  if (bluetoothMoveDerivedFaces) return bluetoothMoveDerivedFaces;
  if (!bluetoothMoveDerivedFacelets) return null;
  bluetoothMoveDerivedFaces = facesFromFacelets(bluetoothMoveDerivedFacelets);
  return bluetoothMoveDerivedFaces;
}

function materializeBluetoothPhysicalFaces() {
  if (bluetoothPhysicalFaces) return bluetoothPhysicalFaces;
  if (!bluetoothPhysicalFacelets) return null;
  bluetoothPhysicalFaces = facesFromFacelets(bluetoothPhysicalFacelets);
  return bluetoothPhysicalFaces;
}

function renderBluetoothCube3dIfLive(faces, metaText = '', options = {}) {
  if (!bluetoothLivePreviewMode()) return;
  renderBluetoothCube3d(faces, metaText, options);
}

function bluetoothStatePreviewKey() {
  const stateMode = bluetoothMoveDerivedPreviewActive()
    ? 'derived-live'
    : (bluetoothPhysicalStatePreviewReady() ? 'physical-live' : 'preview');
  return [
    bluetoothLivePreviewMode() ? 1 : 0,
    bluetoothPhysicalFacelets || '-',
    bluetoothPhysicalSignature || '-',
    bluetoothPhysicalSolved ? 1 : 0,
    bluetoothMoveDerivedSignature || '-',
    bluetoothMoveDerivedSolved ? 1 : 0,
    stateMode,
    bluetoothSolved ? 1 : 0,
    bluetoothSolvedByStatePacket ? 1 : 0,
    appState,
    scramble?.scramble || '-',
    scramble?.puzzle || scramblePuzzle || 'three',
    bluetoothMoveSequenceText(),
  ].join('|');
}

function bluetoothMoveDerivedStateReady() {
  return Boolean(
    bluetoothMoveDerivedFacelets
    && bluetoothMoveDerivedStateTime > 0
    && ['timing', 'saving', 'done'].includes(appState)
    && bluetoothMoveDerivedStateTime >= bluetoothPhysicalStateReceivedAt
  );
}

function bluetoothPhysicalStatePreviewReady() {
  return Boolean(
    bluetoothPhysicalFacelets
    && bluetoothPhysicalStateReceivedAt > 0
    && ['timing', 'saving', 'done'].includes(appState)
  );
}

function bluetoothMoveDerivedPreviewActive() {
  return Boolean(
    bluetoothMoveDerivedFacelets
    && bluetoothMoves.length > 0
    && ['timing', 'saving', 'done'].includes(appState)
    && bluetoothMoveDerivedStateTime >= bluetoothPhysicalStateReceivedAt
  );
}

function bluetooth3dPreferredLiveFaces() {
  return bluetoothMoveDerivedPreviewActive()
    ? materializeBluetoothMoveDerivedFaces()
    : materializeBluetoothPhysicalFaces();
}

async function loadThreeModule() {
  if (THREE) return THREE;
  if (!threeModulePromise) {
    threeModulePromise = import('./vendor/three.module.js')
      .then((module) => {
        THREE = module;
        return module;
      })
      .catch((error) => {
        threeModulePromise = null;
        throw error;
      });
  }
  return threeModulePromise;
}

function ensureBluetoothCube3dReady() {
  if (cube3d) return Promise.resolve(cube3d);
  if (!elements.bluetooth3dCanvas) return Promise.resolve(null);
  if (!cube3dInitPromise) {
    cube3dInitPromise = initBluetoothCube3d().then((result) => {
      if (!result) cube3dInitPromise = null;
      if (result && !bluetooth3dPreviewEnabled) {
        destroyBluetoothCube3d();
        cube3dInitPromise = null;
        return null;
      }
      return result;
    });
  }
  return cube3dInitPromise;
}

async function initBluetoothCube3d() {
  if (!elements.bluetooth3dCanvas) return null;
  try {
    await loadThreeModule();

    const renderer = new THREE.WebGLRenderer({
      canvas: elements.bluetooth3dCanvas,
      alpha: true,
      antialias: false,
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
      new THREE.BoxGeometry(1.88, 1.88, 1.88),
      new THREE.MeshBasicMaterial({
        color: 0x1d1d1f,
      }),
    );
    shell.renderOrder = 0;
    group.add(shell);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.045, 2.045, 2.045)),
      new THREE.LineBasicMaterial({ color: 0x25262b, transparent: true, opacity: 0.08 }),
    );
    edges.renderOrder = 3;
    group.add(edges);

    const stickerGeometry = new THREE.PlaneGeometry(0.642, 0.642);
    const stickerVertexColors = new Float32Array(stickerGeometry.getAttribute('position').count * 3);
    stickerVertexColors.fill(1);
    stickerGeometry.setAttribute('color', new THREE.BufferAttribute(stickerVertexColors, 3));
    const stickerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      vertexColors: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const stickerMesh = new THREE.InstancedMesh(stickerGeometry, stickerMaterial, 54);
    stickerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stickerMesh.frustumCulled = false;
    stickerMesh.renderOrder = 2;
    group.add(stickerMesh);

    const stickers = new Map();
    const stickerScale = new THREE.Vector3(1, 1, 1);
    const stickerMatrix = new THREE.Matrix4();
    const stickerColor = new THREE.Color();
    const stickerObject = new THREE.Object3D();
    let stickerIndex = 0;
    for (const face of cube3dFaces) {
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const colorKey = cube3dColorKey(cube3dFallbackColors[face]);
          applyCube3dStickerTransform(stickerObject, face, row, col);
          stickerObject.updateMatrix();
          stickerMesh.setMatrixAt(stickerIndex, stickerObject.matrix);
          stickerColor.set(colorKey);
          stickerMesh.setColorAt(stickerIndex, stickerColor);
          const sticker = {
            index: stickerIndex,
            basePosition: stickerObject.position.clone(),
            baseQuaternion: stickerObject.quaternion.clone(),
            position: stickerObject.position.clone(),
            quaternion: stickerObject.quaternion.clone(),
            colorKey,
          };
          stickers.set(`${face}${row}${col}`, sticker);
          stickerIndex += 1;
        }
      }
    }
    stickerMesh.instanceMatrix.needsUpdate = true;
    if (stickerMesh.instanceColor) {
      stickerMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      stickerMesh.instanceColor.needsUpdate = true;
    }
    stickerMaterial.needsUpdate = true;

    const baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.56, 0.72, 0.04));
    cube3d = {
      renderer,
      scene,
      camera,
      group,
      stickers,
      stickerMesh,
      stickerMatrix,
      stickerColor,
      stickerScale,
      baseQuaternion,
      targetQuaternion: baseQuaternion.clone(),
      resizeObserver: null,
      resizeHandler: null,
      needsRender: true,
      lastRenderAt: 0,
      turnAnimation: null,
      turnQueue: [],
      pendingFaces: null,
      pendingFacesSignature: '',
      nextQuaternion: new THREE.Quaternion(),
      idleQuaternion: new THREE.Quaternion(),
      idleEuler: new THREE.Euler(),
      turnQuaternion: new THREE.Quaternion(),
      gyroLatestQuaternion: new THREE.Quaternion(),
      gyroPreviousQuaternion: new THREE.Quaternion(),
      gyroPoseTargetQuaternion: new THREE.Quaternion(),
      gyroPoseTargetFrameAt: -1,
      gyroDisplayQuaternion: new THREE.Quaternion(),
      gyroPacketQuaternion: new THREE.Quaternion(),
      dragPointerId: null,
      dragStartX: 0,
      dragStartY: 0,
      dragStartBaseQuaternion: new THREE.Quaternion(),
      dragYawAxis: new THREE.Vector3(0, 1, 0),
      dragPitchAxis: new THREE.Vector3(1, 0, 0),
      dragYawQuaternion: new THREE.Quaternion(),
      dragPitchQuaternion: new THREE.Quaternion(),
      gyroSampleAt: 0,
      gyroPreviousSampleAt: 0,
      gyroHasSample: false,
      gyroHasPreviousSample: false,
      turnDefinitions: null,
      turnLayerStickers: null,
      cssWidth: 0,
      cssHeight: 0,
      renderCount: 0,
      lastFrameDeltaMs: 0,
    };
    cube3d.turnDefinitions = {
      U: { axisName: 'y', axis: new THREE.Vector3(0, 1, 0), sign: 1 },
      D: { axisName: 'y', axis: new THREE.Vector3(0, -1, 0), sign: -1 },
      R: { axisName: 'x', axis: new THREE.Vector3(1, 0, 0), sign: 1 },
      L: { axisName: 'x', axis: new THREE.Vector3(-1, 0, 0), sign: -1 },
      F: { axisName: 'z', axis: new THREE.Vector3(0, 0, 1), sign: 1 },
      B: { axisName: 'z', axis: new THREE.Vector3(0, 0, -1), sign: -1 },
    };
    cube3d.turnLayerStickers = Object.fromEntries(Object.entries(cube3d.turnDefinitions).map(([face, definition]) => [
      face,
      [...stickers.values()].filter((sticker) => (
        sticker.basePosition[definition.axisName] * definition.sign > 0.55
      )).map((sticker) => ({
        sticker,
        position: sticker.basePosition,
        quaternion: sticker.baseQuaternion,
      })),
    ]));
    group.quaternion.copy(baseQuaternion);

    const resize = () => resizeBluetoothCube3d();
    cube3d.resizeHandler = resize;
    cube3d.resizeObserver = new ResizeObserver(resize);
    cube3d.resizeObserver.observe(elements.bluetooth3dCanvas);
    window.addEventListener('resize', resize);
    resize();
    renderBluetoothCube3dCurrent();
    renderBluetoothCube3dTelemetry();
    scheduleBluetoothCube3dAnimation();
    return cube3d;
  } catch (error) {
    addBluetoothLog('错误', '3D 模型加载失败', error.message || String(error));
    if (elements.bluetooth3dMeta) elements.bluetooth3dMeta.textContent = '3D 加载失败';
    cube3d = null;
    return null;
  }
}

function destroyBluetoothCube3d() {
  const current = cube3d;
  stopBluetoothCube3dAnimation();
  stopBluetoothCube3dTelemetryRender();
  if (!current) {
    cube3dInitPromise = null;
    return;
  }

  if (current.turnAnimation) {
    for (const item of current.turnAnimation.stickers || []) {
      item.sticker.position.copy(item.position);
      item.sticker.quaternion.copy(item.quaternion);
      setBluetoothCube3dStickerTransform(current, item.sticker);
    }
    current.stickerMesh.instanceMatrix.needsUpdate = true;
    current.turnAnimation = null;
  }
  current.turnQueue.length = 0;
  current.pendingFaces = null;
  current.pendingFacesSignature = '';
  cancelBluetooth3dMovePulse();
  current.resizeObserver?.disconnect?.();
  if (current.resizeHandler) window.removeEventListener('resize', current.resizeHandler);
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  current.scene?.traverse?.((object) => {
    if (object.geometry && !disposedGeometries.has(object.geometry)) {
      disposedGeometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const material = object.material;
    if (Array.isArray(material)) {
      material.forEach((item) => {
        if (!item || disposedMaterials.has(item)) return;
        disposedMaterials.add(item);
        item.dispose?.();
      });
    } else if (material && !disposedMaterials.has(material)) {
      disposedMaterials.add(material);
      material?.dispose?.();
    }
  });
  current.renderer?.dispose?.();
  current.renderer?.forceContextLoss?.();

  cube3d = null;
  cube3dInitPromise = null;
  cube3dLastFacesSignature = '';
  cube3dLastMetaText = '';
  cube3dTelemetryTextKey = '';
  cube3dLastMoveText = '';
  elements.bluetooth3dCanvas?.classList.remove('dragging');
  if (elements.bluetooth3dMeta) elements.bluetooth3dMeta.textContent = '';
  if (elements.bluetooth3dGyro) elements.bluetooth3dGyro.textContent = 'Gyro -';
  if (elements.bluetooth3dVelocity) elements.bluetooth3dVelocity.textContent = 'ω -';
}

function cube3dColorKey(color) {
  const key = String(color || '#d1d5db').trim().toLowerCase();
  return key || '#d1d5db';
}

function setBluetoothCube3dStickerTransform(model, sticker) {
  if (!model?.stickerMesh || !sticker) return;
  model.stickerMatrix.compose(sticker.position, sticker.quaternion, model.stickerScale);
  model.stickerMesh.setMatrixAt(sticker.index, model.stickerMatrix);
}

function applyCube3dStickerTransform(sticker, face, row, col) {
  const spacing = 0.652;
  const surface = 1.046;
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

function scheduleBluetoothCube3dLayoutResize() {
  if (!elements.bluetooth3dPanel || elements.bluetooth3dPanel.hidden) return;
  const refresh = () => {
    resizeBluetoothCube3d();
    renderBluetoothCube3dCurrent();
  };
  requestAnimationFrame(refresh);
  window.setTimeout(refresh, 320);
}

function handleBluetoothCube3dPointerDown(event) {
  if (!cube3d || !elements.bluetooth3dCanvas || event.isPrimary === false) return;
  if (event.button != null && event.button !== 0 && event.pointerType !== 'touch') return;
  event.preventDefault();
  cube3d.dragPointerId = event.pointerId;
  cube3d.dragStartX = event.clientX;
  cube3d.dragStartY = event.clientY;
  cube3d.dragStartBaseQuaternion.copy(cube3d.baseQuaternion);
  elements.bluetooth3dCanvas.classList.add('dragging');
  try {
    elements.bluetooth3dCanvas.setPointerCapture?.(event.pointerId);
  } catch {
    // Pointer capture can fail if the browser has already cancelled the pointer.
  }
}

function handleBluetoothCube3dPointerMove(event) {
  if (!cube3d || cube3d.dragPointerId !== event.pointerId) return;
  event.preventDefault();
  const dx = event.clientX - cube3d.dragStartX;
  const dy = event.clientY - cube3d.dragStartY;
  cube3d.dragYawQuaternion.setFromAxisAngle(cube3d.dragYawAxis, dx * cube3dDragSensitivity);
  cube3d.dragPitchQuaternion.setFromAxisAngle(cube3d.dragPitchAxis, dy * cube3dDragSensitivity);
  cube3d.baseQuaternion
    .copy(cube3d.dragYawQuaternion)
    .multiply(cube3d.dragPitchQuaternion)
    .multiply(cube3d.dragStartBaseQuaternion)
    .normalize();
  refreshBluetoothCube3dTargetFromBase();
  markBluetoothCube3dDirty();
}

function handleBluetoothCube3dPointerEnd(event) {
  if (!cube3d || cube3d.dragPointerId !== event.pointerId) return;
  try {
    elements.bluetooth3dCanvas?.releasePointerCapture?.(event.pointerId);
  } catch {
    // Ignore release failures for pointers that were cancelled by the browser.
  }
  cube3d.dragPointerId = null;
  elements.bluetooth3dCanvas?.classList.remove('dragging');
}

function refreshBluetoothCube3dTargetFromBase() {
  if (!cube3d) return;
  if (bluetooth3dGyroEnabled && bluetoothGyroLastBasisQuaternion) {
    const displayQuaternion = cube3d.gyroDisplayQuaternion
      .copy(cube3d.baseQuaternion)
      .multiply(bluetoothGyroLastBasisQuaternion);
    cube3d.targetQuaternion.copy(displayQuaternion);
    if (bluetoothGyro?.displayQuaternion) {
      assignRawQuaternionObject(bluetoothGyro.displayQuaternion, displayQuaternion);
    }
  } else {
    cube3d.targetQuaternion.copy(cube3d.baseQuaternion);
  }
  cube3d.gyroPoseTargetFrameAt = -1;
}

function scheduleBluetoothCube3dAnimation(delayMs = 0) {
  if (!cube3d || cube3dAnimationFrame || !isBluetoothCube3dVisible()) return;
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

function stopBluetoothCube3dAnimation() {
  if (cube3dAnimationFrame) {
    cancelAnimationFrame(cube3dAnimationFrame);
    cube3dAnimationFrame = 0;
  }
  if (cube3dAnimationTimer) {
    window.clearTimeout(cube3dAnimationTimer);
    cube3dAnimationTimer = 0;
  }
}

function animateBluetoothCube3d(time = performance.now()) {
  cube3dAnimationFrame = 0;
  if (!cube3d) return;
  const visible = isBluetoothCube3dVisible();
  const activeMove = Boolean(cube3d.turnAnimation);
  if (!visible) return;

  const activeGyro = hasRecentBluetoothGyro(time);
  const frame = bluetoothCube3dFrame(activeGyro, activeMove, time);
  if (frame.ms > 0) {
    const waitMs = frame.ms - (time - cube3d.lastRenderAt);
    if (waitMs > 0) {
      if (shouldContinueBluetoothCube3dAnimation(false, time)) scheduleBluetoothCube3dAnimation(waitMs);
      return;
    }
  }

  const changed = updateBluetoothCube3dPose(time);
  if (changed || cube3d.needsRender || activeMove) {
    const previousRenderAt = cube3d.lastRenderAt;
    cube3d.renderer.render(cube3d.scene, cube3d.camera);
    cube3d.needsRender = false;
    cube3d.renderCount += 1;
    recordBluetoothCube3dFrame(frame.mode);
    cube3d.lastFrameDeltaMs = previousRenderAt > 0 ? time - previousRenderAt : 0;
    cube3d.lastRenderAt = time;
  }
  if (shouldContinueBluetoothCube3dAnimation(changed, time)) scheduleBluetoothCube3dAnimation();
}

function bluetoothCube3dFrame(activeGyro, activeMove, time = performance.now()) {
  if (activeMove) return { ms: cube3dMoveFrameMs, mode: 'move' };
  if (activeGyro) {
    const targetQuaternion = bluetoothCube3dPoseTarget(time);
    const velocity = bluetoothCube3dGyroVelocityMagnitude();
    if (
      quaternionAngularDistanceGreater(cube3d.group.quaternion, targetQuaternion, cube3dGyroFastDotThreshold)
      || velocity > cube3dGyroFastVelocity
    ) {
      return { ms: cube3dGyroFrameMs, mode: 'gyro-fast' };
    }
    if (
      quaternionAngularDistanceGreater(cube3d.group.quaternion, targetQuaternion, cube3dGyroCalmDotThreshold)
      || velocity > cube3dGyroCalmVelocity
    ) {
      return { ms: cube3dGyroCalmFrameMs, mode: 'gyro-calm' };
    }
    return { ms: cube3dGyroSettleFrameMs, mode: 'gyro-settle' };
  }
  if (cube3d?.needsRender) return { ms: cube3dDirtyFrameMs, mode: 'dirty' };
  return { ms: cube3dIdleFrameMs, mode: 'idle' };
}

function bluetoothCube3dGyroVelocityMagnitude() {
  if (!bluetoothGyro?.velocity) return 0;
  const velocity = bluetoothGyro.velocity;
  return Math.max(
    Math.abs(Number(velocity.x) || 0),
    Math.abs(Number(velocity.y) || 0),
    Math.abs(Number(velocity.z) || 0),
  );
}

function recordBluetoothCube3dFrame(mode) {
  if (mode === 'move') incrementPerformanceCounter('cube3dMoveFrames');
  else if (mode === 'gyro-fast') incrementPerformanceCounter('cube3dGyroFastFrames');
  else if (mode === 'gyro-calm') incrementPerformanceCounter('cube3dGyroCalmFrames');
  else if (mode === 'gyro-settle') incrementPerformanceCounter('cube3dGyroSettleFrames');
  else if (mode === 'dirty') incrementPerformanceCounter('cube3dDirtyFrames');
}

function shouldContinueBluetoothCube3dAnimation(changed, time = performance.now()) {
  if (!cube3d || !isBluetoothCube3dVisible()) return false;
  return Boolean(
    changed
    || cube3d.needsRender
    || cube3d.turnAnimation
    || cube3d.turnQueue.length > 0
    || shouldContinueBluetoothCube3dPoseAnimation(time)
  );
}

function shouldContinueBluetoothCube3dPoseAnimation(time = performance.now()) {
  if (!cube3d || !bluetoothGyro) return false;
  const targetQuaternion = hasRecentBluetoothGyro(time)
    ? bluetoothCube3dPoseTarget(time)
    : cube3d.targetQuaternion;
  return quaternionAngularDistanceGreater(
    cube3d.group.quaternion,
    targetQuaternion,
    cube3dPoseContinueDotThreshold,
  );
}

function updateBluetoothCube3dPose(time) {
  const nextQuaternion = cube3d.nextQuaternion.copy(cube3d.group.quaternion);
  if (bluetoothGyro) {
    const deltaMs = cube3d.lastRenderAt > 0 ? Math.max(0, time - cube3d.lastRenderAt) : 16;
    const targetQuaternion = bluetoothCube3dPoseTarget(time);
    const smoothingMs = quaternionAngularDistanceGreater(
      nextQuaternion,
      targetQuaternion,
      cube3dGyroFastSmoothingDotThreshold,
    )
      ? cube3dGyroFastSmoothingMs
      : cube3dGyroSmoothingMs;
    const slerpFactor = Math.min(0.9, 1 - Math.exp(-deltaMs / smoothingMs));
    nextQuaternion.slerp(targetQuaternion, slerpFactor);
  } else {
    nextQuaternion.copy(cube3d.baseQuaternion);
  }

  const changed = quaternionAngularDistanceGreater(cube3d.group.quaternion, nextQuaternion, cube3dPoseDotThreshold);
  if (changed) cube3d.group.quaternion.copy(nextQuaternion);
  const turnChanged = updateBluetoothCube3dTurnAnimation(time);
  return changed || turnChanged || Boolean(cube3d.turnAnimation);
}

function quaternionAngularDistanceGreater(left, right, dotThreshold) {
  if (!left || !right) return false;
  const dot = Math.abs(left.dot(right));
  return !Number.isFinite(dot) || dot < dotThreshold;
}

function bluetoothCube3dPoseTarget(time) {
  if (!cube3d?.gyroHasPreviousSample || !cube3d.gyroHasSample) return cube3d.targetQuaternion;
  if (cube3d.gyroPoseTargetFrameAt === time) return cube3d.gyroPoseTargetQuaternion;
  const sampleInterval = cube3d.gyroSampleAt - cube3d.gyroPreviousSampleAt;
  const elapsed = time - cube3d.gyroSampleAt;
  if (
    sampleInterval <= 4
    || sampleInterval > cube3dGyroPredictionIntervalMaxMs
    || elapsed <= 0
    || elapsed > cube3dGyroActiveWindowMs
  ) {
    return cube3d.targetQuaternion;
  }

  const predictionMs = Math.min(
    elapsed,
    cube3dGyroPredictionMaxMs,
    sampleInterval * cube3dGyroPredictionMaxRatio,
  );
  if (predictionMs <= 0) return cube3d.targetQuaternion;
  const predictionT = 1 + predictionMs / sampleInterval;
  cube3d.gyroPoseTargetFrameAt = time;
  return cube3d.gyroPoseTargetQuaternion
    .copy(cube3d.gyroPreviousQuaternion)
    .slerp(cube3d.gyroLatestQuaternion, predictionT);
}

function hasRecentBluetoothGyro(time = performance.now()) {
  return Boolean(bluetooth3dGyroEnabled && bluetoothGyro && time - bluetoothGyroLastUpdateAt <= cube3dGyroActiveWindowMs);
}

function isBluetoothCube3dVisible() {
  return Boolean(
    pageVisible()
    && cube3d
    && elements.bluetooth3dCanvas
    && !elements.bluetooth3dPanel?.hidden
    && cube3d.cssWidth > 4
    && cube3d.cssHeight > 4
  );
}

function markBluetoothCube3dDirty() {
  if (cube3d) {
    cube3d.needsRender = true;
    cube3d.lastRenderAt = Math.min(cube3d.lastRenderAt, performance.now() - cube3dIdleFrameMs);
    if (isBluetoothCube3dVisible()) scheduleBluetoothCube3dAnimation();
  }
}

function applyBluetoothCube3dFaces(nextFaces, signature = cube3dFacesSignature(nextFaces)) {
  if (!cube3d) return false;
  cube3dLastFacesSignature = signature;
  let updatedStickers = 0;
  for (const face of cube3dFaces) {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const sticker = cube3d.stickers.get(`${face}${row}${col}`);
        if (!sticker) continue;
        const colorKey = cube3dColorKey(nextFaces?.[face]?.[row]?.[col]?.color || cube3dFallbackColors[face]);
        if (sticker.colorKey === colorKey) continue;
        sticker.colorKey = colorKey;
        cube3d.stickerColor.set(colorKey);
        cube3d.stickerMesh.setColorAt(sticker.index, cube3d.stickerColor);
        updatedStickers += 1;
      }
    }
  }
  performanceCounters.cube3dStickerUpdates += updatedStickers;
  if (updatedStickers > 0) {
    if (cube3d.stickerMesh.instanceColor) cube3d.stickerMesh.instanceColor.needsUpdate = true;
    markBluetoothCube3dDirty();
  }
  return updatedStickers > 0;
}

function renderBluetoothCube3dCurrent() {
  if (!cube3d) {
    if (solveReplayPreviewActive || bluetoothLivePreviewMode()) {
      if (elements.bluetooth3dMeta) elements.bluetooth3dMeta.textContent = '3D 加载中';
      void ensureBluetoothCube3dReady().then((ready) => {
        if (ready) renderBluetoothCube3dCurrent();
      });
    }
    return;
  }
  if (solveReplayPreviewActive && solveReplayFacelets) {
    renderBluetoothCube3d(facesFromFacelets(solveReplayFacelets), solveReplayPreviewLabel || '完整解法回放');
    return;
  }
  if (bluetoothLivePreviewMode()) {
    const liveFaces = bluetooth3dPreferredLiveFaces();
    if (liveFaces) {
      const source = bluetoothMoveDerivedPreviewActive() ? `蓝牙转动实时状态 · ${bluetoothMoveStepCount()} 步` : 'GAN 实时状态';
      const solved = bluetoothMoveDerivedPreviewActive()
        ? bluetoothMoveDerivedSolved
        : (liveFaces === bluetoothPhysicalFaces ? bluetoothPhysicalSolved : isSolvedFaces(liveFaces));
      renderBluetoothCube3d(liveFaces, `${source} · ${solved ? '已复原' : '未复原'}`, {
        signature: bluetooth3dLiveFacesSignature(liveFaces),
      });
    } else {
      renderBluetoothCube3d(null, '等待 GAN 状态包');
    }
    return;
  }

  if (!scramble?.scramble || (scramble.puzzle || scramblePuzzle) !== 'three') {
    renderBluetoothCube3d(null, scramble?.scramble ? '3D 仅支持 3x3' : '等待打乱');
    return;
  }

  if (bluetoothMoveDerivedStateReady()) {
    const faces = materializeBluetoothMoveDerivedFaces();
    if (!faces) {
      renderBluetoothCube3d(null, '状态无效');
      return;
    }
    const stepCount = bluetoothMoveStepCount();
    const metaText = bluetoothMoves.length === 0
      ? (appState === 'timing' ? '打乱状态' : '等待蓝牙转动')
      : `${stepCount} 步 · ${bluetoothMoveDerivedSolved ? '已复原' : '未复原'}`;
    renderBluetoothCube3d(faces, metaText, { signature: bluetoothMoveDerivedSignature });
    return;
  }

  if (bluetoothPhysicalStatePreviewReady()) {
    const faces = materializeBluetoothPhysicalFaces();
    if (!faces) {
      renderBluetoothCube3d(null, '状态无效');
      return;
    }
    renderBluetoothCube3d(
      faces,
      `GAN 实时状态 · ${bluetoothPhysicalSolved ? '已复原' : '未复原'}`,
      { signature: bluetoothPhysicalSignature },
    );
    return;
  }

  try {
    const moveText = bluetoothMoveSequenceText();
    const facelets = applyMovesToFacelets(faceletsFromScramble(scramble.scramble), moveText);
    const faces = facesFromFacelets(facelets);
    const stepCount = bluetoothMoveStepCount();
    const metaText = bluetoothMoves.length === 0
      ? (appState === 'timing' ? '打乱状态' : '等待蓝牙转动')
      : `${stepCount} 步 · ${isSolvedFacelets(facelets) ? '已复原' : '未复原'}`;
    renderBluetoothCube3d(faces, metaText, { signature: cubeFaceletSignature(facelets) });
  } catch {
    renderBluetoothCube3d(null, '状态无效');
  }
}

function renderBluetoothCube3d(faces, metaText = '', options = {}) {
  if (!cube3d || !bluetooth3dUiActive()) return;
  const nextFaces = faces || facesFromFacelets(solvedFaceletString);
  const signature = options.signature || cube3dFacesSignature(nextFaces);
  if (signature !== cube3dLastFacesSignature) {
    if (cube3d.turnAnimation && options.deferDuringTurn !== false) {
      cube3d.pendingFaces = nextFaces;
      cube3d.pendingFacesSignature = signature;
      markBluetoothCube3dDirty();
    } else {
      cube3d.pendingFaces = null;
      cube3d.pendingFacesSignature = '';
      applyBluetoothCube3dFaces(nextFaces, signature);
    }
  }
  const nextMetaText = metaText || '等待蓝牙同步';
  if (elements.bluetooth3dMeta && nextMetaText !== cube3dLastMetaText) {
    cube3dLastMetaText = nextMetaText;
    elements.bluetooth3dMeta.textContent = nextMetaText;
  }
  scheduleBluetoothCube3dTelemetryRender({ immediateStatic: false });
}

function cube3dFacesSignature(faces) {
  let signature = '';
  for (const face of cube3dFaces) {
    if (signature) signature += '|';
    const rows = faces?.[face];
    if (!Array.isArray(rows)) {
      signature += '---------';
      continue;
    }
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        signature += rows[row]?.[col]?.color || '-';
      }
    }
  }
  return signature;
}

function updateBluetooth3dMoves(moves = [], options = {}) {
  if (!Array.isArray(moves)) return;
  const targets = Array.isArray(options.targets) ? options.targets : [];
  for (let index = 0; index < moves.length; index += 1) {
    updateBluetooth3dMove(moves[index], targets[index] || {});
  }
}

function updateBluetooth3dMove(move, options = {}) {
  bluetoothLastMoveText = String(move || '-');
  if (!bluetooth3dUiActive()) return;
  if (bluetoothLastMoveText !== '-' && bluetoothLivePreviewMode()) {
    if (cube3d) {
      triggerBluetoothCube3dTurnAnimation(bluetoothLastMoveText, options);
    } else if (bluetoothLivePreviewMode()) {
      const moveText = bluetoothLastMoveText;
      void ensureBluetoothCube3dReady().then((ready) => {
        if (ready && bluetoothLastMoveText === moveText) triggerBluetoothCube3dTurnAnimation(moveText, options);
      });
    }
  }
  renderBluetooth3dMoveIndicator({ pulse: bluetoothLastMoveText !== '-' });
}

function bluetooth3dUiActive() {
  return Boolean(
    elements.bluetooth3dPanel
    && !elements.bluetooth3dPanel.hidden
    && (solveReplayPreviewActive || bluetoothLivePreviewMode())
  );
}

function renderBluetooth3dMoveIndicator(options = {}) {
  if (!bluetooth3dUiActive()) {
    cancelBluetooth3dMovePulse();
    stopBluetoothCube3dTelemetryRender();
    return;
  }
  if (!elements.bluetooth3dMove) {
    scheduleBluetoothCube3dTelemetryRender({ immediateStatic: false });
    return;
  }
  if (bluetoothLastMoveText !== cube3dLastMoveText) {
    cube3dLastMoveText = bluetoothLastMoveText;
    elements.bluetooth3dMove.textContent = bluetoothLastMoveText;
  }
  if (!options.pulse || bluetoothLastMoveText === '-') {
    cancelBluetooth3dMovePulse();
    scheduleBluetoothCube3dTelemetryRender({ immediateStatic: false });
    return;
  }
  elements.bluetooth3dMove.classList.remove('pulse');
  window.clearTimeout(cube3dMovePulseTimer);
  cube3dMovePulseTimer = 0;
  if (cube3dMovePulseFrame) {
    cancelAnimationFrame(cube3dMovePulseFrame);
    incrementPerformanceCounter('cube3dMovePulseCoalesced');
  }
  cube3dMovePulseFrame = requestAnimationFrame(() => {
    cube3dMovePulseFrame = 0;
    incrementPerformanceCounter('cube3dMovePulseFrames');
    elements.bluetooth3dMove.classList.add('pulse');
    cube3dMovePulseTimer = window.setTimeout(() => {
      cube3dMovePulseTimer = 0;
      elements.bluetooth3dMove.classList.remove('pulse');
    }, 260);
  });
  scheduleBluetoothCube3dTelemetryRender({ immediateStatic: false });
}

function cancelBluetooth3dMovePulse() {
  if (cube3dMovePulseFrame) {
    cancelAnimationFrame(cube3dMovePulseFrame);
    cube3dMovePulseFrame = 0;
  }
  if (cube3dMovePulseTimer) {
    window.clearTimeout(cube3dMovePulseTimer);
    cube3dMovePulseTimer = 0;
  }
  elements.bluetooth3dMove?.classList.remove('pulse');
}

function triggerBluetoothCube3dTurnAnimation(move, options = {}) {
  if (!cube3d) return;
  const moveText = String(move || '');
  const match = moveText.match(/^([UDRLFB])(2|')?$/);
  if (!match) return;
  if (cube3d.turnAnimation) {
    if (cube3d.turnQueue.length >= cube3dTurnQueueLimit) {
      cube3d.turnQueue.length = 0;
      completeBluetoothCube3dTurnAnimation(false, { applyPendingFaces: false, startQueued: false });
    } else {
      cube3d.turnQueue.push({ move: moveText, options });
      markBluetoothCube3dDirty();
      return;
    }
  }
  const definition = cube3d.turnDefinitions?.[match[1]];
  const layerStickers = cube3d.turnLayerStickers?.[match[1]] || [];
  if (!definition || layerStickers.length === 0) return;
  const suffix = match[2] || '';
  const direction = suffix === "'" ? -1 : 1;
  const amount = suffix === '2' ? 2 : 1;
  const target = bluetoothCube3dTurnTarget(options);
  cube3d.turnAnimation = {
    axis: definition.axis,
    angle: direction * amount * Math.PI / 2,
    startedAt: performance.now(),
    duration: suffix === '2' ? cube3dDoubleTurnDurationMs : cube3dTurnDurationMs,
    stickers: layerStickers,
    targetFaces: target.faces,
    targetFacelets: target.facelets,
    targetSignature: target.signature,
    onComplete: options.onComplete || null,
  };
  cube3d.lastRenderAt = Math.min(cube3d.lastRenderAt, performance.now() - cube3dMoveFrameMs);
  markBluetoothCube3dDirty();
}

function bluetoothCube3dTurnTarget(options = {}) {
  const facelets = /^[URFDLB]{54}$/.test(String(options.targetFacelets || ''))
    ? String(options.targetFacelets)
    : '';
  const faces = options.targetFaces || null;
  const signature = options.targetSignature
    || (facelets ? cubeFaceletSignature(facelets) : '')
    || (faces ? cube3dFacesSignature(faces) : '');
  return { facelets, faces, signature };
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
    setBluetoothCube3dStickerTransform(cube3d, item.sticker);
  }
  cube3d.stickerMesh.instanceMatrix.needsUpdate = true;
  if (progress >= 1) completeBluetoothCube3dTurnAnimation(true);
  return true;
}

function completeBluetoothCube3dTurnAnimation(runCallback = true, options = {}) {
  if (!cube3d?.turnAnimation) return;
  const applyPendingFaces = options.applyPendingFaces !== false;
  const startQueued = options.startQueued !== false;
  const applyTurnTarget = options.applyTurnTarget !== false;
  const turn = cube3d.turnAnimation;
  cube3d.turnAnimation = null;
  for (const item of turn.stickers) {
    item.sticker.position.copy(item.position);
    item.sticker.quaternion.copy(item.quaternion);
    setBluetoothCube3dStickerTransform(cube3d, item.sticker);
  }
  cube3d.stickerMesh.instanceMatrix.needsUpdate = true;
  if (applyTurnTarget) applyBluetoothCube3dTurnTarget(turn);
  const queuedTurn = startQueued ? cube3d.turnQueue.shift() : null;
  if (queuedTurn) {
    triggerBluetoothCube3dTurnAnimation(queuedTurn.move, queuedTurn.options);
  } else if (applyPendingFaces && cube3d.pendingFaces) {
    const pendingFaces = cube3d.pendingFaces;
    const pendingSignature = cube3d.pendingFacesSignature || cube3dFacesSignature(pendingFaces);
    cube3d.pendingFaces = null;
    cube3d.pendingFacesSignature = '';
    applyBluetoothCube3dFaces(pendingFaces, pendingSignature);
  }
  markBluetoothCube3dDirty();
  if (runCallback && typeof turn.onComplete === 'function') turn.onComplete();
}

function applyBluetoothCube3dTurnTarget(turn) {
  if (!turn) return false;
  if (turn.targetFaces) {
    return applyBluetoothCube3dFaces(turn.targetFaces, turn.targetSignature || cube3dFacesSignature(turn.targetFaces));
  }
  if (!turn.targetFacelets) return false;
  const faces = facesFromFacelets(turn.targetFacelets);
  if (!faces) return false;
  return applyBluetoothCube3dFaces(faces, turn.targetSignature || cubeFaceletSignature(turn.targetFacelets));
}

function scheduleBluetoothCube3dTelemetryRender(options = {}) {
  if (!pageVisible() || !bluetooth3dUiActive()) {
    stopBluetoothCube3dTelemetryRender();
    return;
  }
  if (!bluetoothGyro && options.immediateStatic !== false) {
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

function stopBluetoothCube3dTelemetryRender() {
  if (cube3dTelemetryTimer) {
    window.clearTimeout(cube3dTelemetryTimer);
    cube3dTelemetryTimer = 0;
  }
  if (cube3dTelemetryFrame) {
    cancelAnimationFrame(cube3dTelemetryFrame);
    cube3dTelemetryFrame = 0;
  }
}

function renderBluetoothCube3dTelemetry() {
  if (!bluetooth3dUiActive()) return;
  if (!elements.bluetooth3dGyro || !elements.bluetooth3dVelocity) return;
  cube3dTelemetryLastRenderAt = performance.now();
  if (!bluetooth3dGyroEnabled) {
    const velocityText = `Turn ${bluetoothLastMoveText}`;
    const gyroTitle = '蓝牙 3D 姿态已关闭';
    const velocityTitle = `最近转动 ${bluetoothLastMoveText}`;
    const textKey = `gyro-off|${velocityText}|${gyroTitle}|${velocityTitle}`;
    if (textKey === cube3dTelemetryTextKey) return;
    cube3dTelemetryTextKey = textKey;
    elements.bluetooth3dGyro.textContent = 'Gyro off';
    elements.bluetooth3dVelocity.textContent = velocityText;
    elements.bluetooth3dGyro.title = gyroTitle;
    elements.bluetooth3dVelocity.title = velocityTitle;
    return;
  }
  if (!bluetoothGyro) {
    const velocityText = `Turn ${bluetoothLastMoveText}`;
    const gyroTitle = '未收到陀螺仪数据';
    const velocityTitle = `最近转动 ${bluetoothLastMoveText}`;
    const textKey = `idle|Gyro -|${velocityText}|${gyroTitle}|${velocityTitle}`;
    if (textKey === cube3dTelemetryTextKey) return;
    cube3dTelemetryTextKey = textKey;
    elements.bluetooth3dGyro.textContent = 'Gyro -';
    elements.bluetooth3dVelocity.textContent = velocityText;
    elements.bluetooth3dGyro.title = gyroTitle;
    elements.bluetooth3dVelocity.title = velocityTitle;
    return;
  }
  const gyroText = `q ${formatGyroQuaternion(bluetoothGyro.quaternion)}`;
  const velocityText = `ω ${formatGyroVelocity(bluetoothGyro.velocity)} · ${bluetoothLastMoveText}`;
  const textKey = `gyro|${gyroText}|${velocityText}`;
  if (textKey === cube3dTelemetryTextKey) return;
  cube3dTelemetryTextKey = textKey;
  elements.bluetooth3dGyro.textContent = gyroText;
  elements.bluetooth3dVelocity.textContent = velocityText;
  elements.bluetooth3dGyro.title = gyroText;
  elements.bluetooth3dVelocity.title = velocityText;
}

function formatGyroQuaternion(quaternion = {}) {
  return `${formatSignedNumber(quaternion.w, 3)} ${formatSignedNumber(quaternion.x, 3)} ${formatSignedNumber(quaternion.y, 3)} ${formatSignedNumber(quaternion.z, 3)}`;
}

function formatGyroVelocity(velocity = {}) {
  return `${formatSignedNumber(velocity.x, 0)}/${formatSignedNumber(velocity.y, 0)}/${formatSignedNumber(velocity.z, 0)}`;
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
  const cacheKey = String(uuid);
  const cached = bluetoothUuidLabelCache.get(cacheKey);
  if (cached) return cached;
  const normalized = normalizeBluetoothUuid(uuid);
  const label = bluetoothUuidLabels.get(normalized);
  const compact = shortUuid(uuid);
  const output = label ? `${compact} ${label}` : compact;
  bluetoothUuidLabelCache.set(cacheKey, output);
  return output;
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
  const text = String(uuid);
  const cached = normalizedBluetoothUuidCache.get(text);
  if (cached) return cached;
  const normalized = text.toLowerCase();
  normalizedBluetoothUuidCache.set(text, normalized);
  return normalized;
}

function shortUuid(uuid) {
  const text = String(uuid);
  const cached = shortBluetoothUuidCache.get(text);
  if (cached) return cached;
  const match = text.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i);
  const output = match ? `0x${match[1].toUpperCase()}` : text.slice(0, 8);
  shortBluetoothUuidCache.set(text, output);
  return output;
}

function isBatteryLevelCharacteristic(uuid) {
  const normalized = normalizeBluetoothUuid(uuid);
  return normalized === 'battery_level' || normalized === bluetoothBatteryLevelUuid;
}

function isGiikerBatteryCharacteristic(uuid) {
  return normalizeBluetoothUuid(uuid) === bluetoothGiikerBatteryReadUuid;
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

function cloneBluetoothPacketBytes(value) {
  return Uint8Array.from(dataViewBytes(value));
}

function bytesToHex(bytes) {
  const view = bytes instanceof Uint8Array
    ? bytes
    : ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : (Array.isArray(bytes) ? bytes : []);
  let output = '';
  for (let index = 0; index < view.length; index += 1) {
    if (index > 0) output += ' ';
    output += byteHexLookup[view[index] & 0xff];
  }
  return output;
}

function render() {
  renderTimer();
  renderBluetoothMoves();
  renderBluetoothFeed();
  renderPreviewMode();
  renderSessions();
  renderScramble({ skipBluetooth3dCurrent: true });
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

function ensureBluetooth3dFocusHost() {
  if (bluetooth3dFocusHost) return bluetooth3dFocusHost;
  bluetooth3dFocusHost = document.createElement('div');
  bluetooth3dFocusHost.className = 'bluetooth-3d-focus-host';
  bluetooth3dFocusHost.hidden = true;
  document.body.appendChild(bluetooth3dFocusHost);
  return bluetooth3dFocusHost;
}

function syncBluetooth3dFocusHost(active = timerFocusActive() && bluetooth3dUiActive()) {
  const canvas = elements.bluetooth3dCanvas;
  if (!canvas || !bluetooth3dCanvasHomeParent) return;
  const keepForLeave = !active && document.body.dataset.focusTransition === 'leave' && bluetooth3dUiActive();
  if (active || keepForLeave) {
    const host = ensureBluetooth3dFocusHost();
    if (canvas.parentElement !== host) host.appendChild(canvas);
    host.hidden = false;
    return;
  }

  if (canvas.parentElement !== bluetooth3dCanvasHomeParent) {
    const nextSibling = bluetooth3dCanvasHomeNextSibling?.parentNode === bluetooth3dCanvasHomeParent
      ? bluetooth3dCanvasHomeNextSibling
      : null;
    bluetooth3dCanvasHomeParent.insertBefore(canvas, nextSibling);
  }
  if (bluetooth3dFocusHost) bluetooth3dFocusHost.hidden = true;
}

function renderPreviewMode() {
  const replayMode = solveReplayPreviewActive && solveReplayFacelets;
  const liveMode = replayMode || bluetoothLivePreviewMode();
  setDatasetValue(document.body, 'live3d', liveMode ? 'true' : 'false');
  const titleText = replayMode ? '复原回放' : (liveMode ? '蓝牙魔方状态' : '打乱结果预览');
  const metaText = replayMode
    ? '完整解法播放'
    : (liveMode
    ? (bluetoothMoveDerivedPreviewActive() ? '转动实时状态' : (bluetoothPhysicalFacelets ? 'GAN 实时状态' : '等待状态包'))
    : 'TNoodle');
  const renderKey = [
    liveMode ? 1 : 0,
    replayMode ? 1 : 0,
    titleText,
    metaText,
  ].join('|');
  const modeChanged = renderKey !== previewModeRenderKey;
  if (modeChanged) {
    previewModeRenderKey = renderKey;
    elements.cubeNet.hidden = liveMode;
    elements.bluetooth3dPanel.hidden = !liveMode;
    if (liveMode) scheduleBluetoothCube3dLayoutResize();
    setElementText(elements.previewTitle, titleText);
    setElementText(elements.previewMeta, metaText);
    if (!liveMode) {
      stopBluetoothCube3dAnimation();
      stopBluetoothCube3dTelemetryRender();
      cancelBluetooth3dMovePulse();
    }
  }
  syncBluetooth3dFocusHost(liveMode && timerFocusActive() && bluetooth3dUiActive());

  if (liveMode) {
    renderBluetooth3dMoveIndicator({ pulse: false });
    if (!cube3d) {
      setElementText(elements.bluetooth3dMeta, '3D 加载中');
      void ensureBluetoothCube3dReady().then((ready) => {
        if (!ready) return;
        resizeBluetoothCube3d();
        renderBluetoothCube3dCurrent();
        scheduleBluetoothCube3dLayoutResize();
      });
      return;
    }
    if (modeChanged) markBluetoothCube3dDirty();
    resizeBluetoothCube3d();
    renderBluetoothCube3dCurrent();
    if (modeChanged) scheduleBluetoothCube3dLayoutResize();
  }
}

function bluetoothLivePreviewMode() {
  return Boolean(bluetooth3dPreviewEnabled && bluetoothDevice?.gatt?.connected);
}

function bluetoothGyroPreviewMode() {
  return bluetoothLivePreviewMode() && bluetooth3dGyroEnabled;
}

function setTimerDisplayText(text) {
  const display = elements.timerDisplay;
  const nextText = String(text ?? '');
  const size = nextText.length >= 9 ? 'compact' : (nextText.length >= 8 ? 'long' : 'normal');
  const textKey = `${size}:${nextText}`;
  if (timerDisplayTextKey === textKey) return;
  timerDisplayTextKey = textKey;
  if (display.textContent !== nextText) display.textContent = nextText;
  if (display.dataset.size !== size) display.dataset.size = size;

  // The timer uses tabular numerals, so equal-length values have stable width.
  const measureKey = `${size}:${nextText.length}`;
  if (measureKey === timerDisplayMeasureKey) return;
  timerDisplayMeasureKey = measureKey;
  const width = Math.round(display.clientWidth);
  const key = `${measureKey}:${width}`;
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
  timerDisplayMeasureKey = '';
  timerDisplayTextKey = '';
  setTimerDisplayText(elements.timerDisplay.textContent);
}

function scheduleTimerDisplayFitInvalidation() {
  invalidateTimerDisplayFit();
  window.clearTimeout(timerDisplayLayoutTimer);
  timerDisplayLayoutTimer = window.setTimeout(() => {
    timerDisplayLayoutTimer = 0;
    invalidateTimerDisplayFit();
  }, 380);
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
  recordingShortcutId = '';
  renderTimerSettingsDialog();
  if (!elements.timerSettingsDialog.open) elements.timerSettingsDialog.showModal();
}

function renderTimerSettingsDialog() {
  elements.hideTimerToggle.checked = hideTimerWhileSolving;
  elements.timerFreezeSelect.value = String(timerFreezeMs);
  elements.bluetooth3dPreviewToggle.checked = bluetooth3dPreviewEnabled;
  elements.bluetooth3dGyroToggle.disabled = !bluetooth3dPreviewEnabled;
  elements.bluetooth3dGyroToggle.checked = bluetooth3dGyroEnabled;
  elements.accentThemeSelect.value = accentTheme;
  elements.confirmDeleteToggle.checked = confirmDeleteSolves;
  const displayMode = hideTimerWhileSolving ? '隐藏计时中数字' : '显示计时中数字';
  const freezeMode = timerFreezeMs > 0 ? `起步冻结 ${(timerFreezeMs / 1000).toFixed(1)}s` : '无起步冻结';
  const previewMode = bluetooth3dPreviewEnabled ? '3D 预览开启' : '3D 预览关闭';
  const gyroMode = bluetooth3dPreviewEnabled && bluetooth3dGyroEnabled ? '姿态开启' : '姿态关闭';
  const accentMode = `强调色 ${accentThemeLabels[accentTheme] || accentThemeLabels.cyan}`;
  const deleteMode = confirmDeleteSolves ? '删除前确认' : '删除直接撤销';
  elements.timerSettingsMeta.textContent = `${displayMode} · ${freezeMode} · ${previewMode} · ${gyroMode} · ${accentMode} · ${deleteMode}`;
  renderShortcutSettings();
}

function updateTimerSettingsFromControls() {
  const previousAccentTheme = accentTheme;
  const previousBluetooth3dPreviewEnabled = bluetooth3dPreviewEnabled;
  const previousBluetooth3dGyroEnabled = bluetooth3dGyroEnabled;
  hideTimerWhileSolving = elements.hideTimerToggle.checked;
  timerFreezeMs = normalizeTimerFreezeMs(elements.timerFreezeSelect.value);
  bluetooth3dPreviewEnabled = elements.bluetooth3dPreviewToggle.checked;
  bluetooth3dGyroEnabled = bluetooth3dPreviewEnabled && elements.bluetooth3dGyroToggle.checked;
  accentTheme = normalizeAccentTheme(elements.accentThemeSelect.value);
  confirmDeleteSolves = elements.confirmDeleteToggle.checked;
  localStorage.setItem('trainTimer.hideTimerWhileSolving', hideTimerWhileSolving ? '1' : '0');
  localStorage.setItem('trainTimer.timerFreezeMs', String(timerFreezeMs));
  localStorage.setItem('trainTimer.bluetooth3dPreviewEnabled', bluetooth3dPreviewEnabled ? '1' : '0');
  localStorage.setItem('trainTimer.bluetooth3dGyroEnabled', bluetooth3dGyroEnabled ? '1' : '0');
  localStorage.setItem('trainTimer.accentTheme', accentTheme);
  localStorage.setItem('trainTimer.confirmDeleteSolves', confirmDeleteSolves ? '1' : '0');
  applyAccentTheme();
  if (previousBluetooth3dGyroEnabled && !bluetooth3dGyroEnabled) {
    resetBluetoothGyro();
  }
  if (previousBluetooth3dPreviewEnabled && !bluetooth3dPreviewEnabled) {
    resetBluetoothGyro();
    destroyBluetoothCube3d();
  }
  renderTimerSettingsDialog();
  renderTimer();
  renderPreviewMode();
  if (previousAccentTheme !== accentTheme) renderStatsDialog();
}

function normalizeTimerFreezeMs(value) {
  const parsed = Number(value);
  const allowed = [0, 200, 500, 1000, 2000];
  return allowed.includes(parsed) ? parsed : 0;
}

function normalizeAccentTheme(value) {
  const text = String(value || '').trim();
  return Object.hasOwn(accentThemeLabels, text) ? text : 'cyan';
}

function applyAccentTheme() {
  document.body.dataset.accent = accentTheme;
}

function renderSessions() {
  const renderKey = [
    currentSessionId,
    sessions.map((session) => `${session.id}:${session.name}`).join('|'),
  ].join('||');
  if (renderKey === sessionsRenderKey) return;
  sessionsRenderKey = renderKey;
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
  incrementPerformanceCounter('renderTimerCalls');
  setDatasetValue(document.body, 'state', appState);
  setDatasetValue(document.body, 'holdReady', appState === 'hold' && holdConfirmed ? 'true' : 'false');
  const previousFocusActive = document.body.dataset.focus === 'true';
  const focusActive = timerFocusActive();
  if (!focusActive && document.body.dataset.inspectionEnter) clearInspectionEntryAnimation();
  setTimerFocusDataset(focusActive);
  syncBluetooth3dFocusHost(focusActive && bluetooth3dUiActive());
  if (previousFocusActive !== focusActive) {
    scheduleTimerDisplayFitInvalidation();
    if (bluetooth3dUiActive()) scheduleBluetoothCube3dLayoutResize();
  }
  elements.inspectionToggle.disabled = appState === 'timing' || appState === 'inspection' || appState === 'hold';

  if (appState === 'loading') {
    setElementText(elements.statusText, '加载中');
    setTimerDisplayText('0.000');
    setElementText(elements.timerHint, '正在生成打乱');
  } else if (appState === 'ready') {
    setElementText(elements.statusText, '准备');
    setTimerDisplayText('0.000');
    setElementText(
      elements.timerHint,
      scrambleGuideReadyHint() || (inspectionEnabled ? '按 Space 开始观察' : '长按 Space 超过 0.5s，松开开始计时'),
    );
  } else if (appState === 'inspection') {
    const elapsed = inspectionElapsedSeconds();
    const penalty = inspectionPenaltyForElapsed(elapsed);
    setElementText(elements.statusText, penalty === 'ok' ? '观察中' : '观察超时');
    setTimerDisplayText(inspectionDisplayForElapsed(elapsed));
    setElementText(
      elements.timerHint,
      penalty === 'ok'
        ? '长按 Space 超过 0.5s，松开开始计时 · Esc 退出观察'
        : `长按 Space 后松开开始计时，本次 ${penalty.toUpperCase()}`,
    );
  } else if (appState === 'hold') {
    if (holdReturnState === 'inspection' && activeInspectionUsed && inspectionStartedAt > 0) {
      const elapsed = inspectionElapsedSeconds();
      const penalty = inspectionPenaltyForElapsed(elapsed);
      setElementText(elements.statusText, holdConfirmed ? '松开空格开始计时' : '长按确认中');
      setTimerDisplayText(inspectionDisplayForElapsed(elapsed));
      setElementText(
        elements.timerHint,
        penalty === 'ok'
          ? '短按不会启动，观察倒计时继续'
          : `松开开始计时，本次 ${penalty.toUpperCase()}`,
      );
    } else {
      setElementText(elements.statusText, holdConfirmed ? '松开空格开始计时' : '长按确认中');
      setElementText(elements.timerHint, '短按不会启动');
    }
  } else if (appState === 'timing') {
    setElementText(elements.statusText, '计时中');
    const elapsedMs = performance.now() - startedAt;
    setTimerDisplayText(timingDisplayText(elapsedMs));
    setElementText(elements.timerHint, timerDisplayModeHint(elapsedMs) || '按任意键结束本次计时 · Esc 记为 DNF');
  } else if (appState === 'saving') {
    setElementText(elements.statusText, finishSource === 'bluetooth' ? '蓝牙复原' : '保存中');
    setElementText(elements.timerHint, finishSource === 'bluetooth' ? '检测到已复原，正在写入成绩' : '正在写入成绩');
  } else if (appState === 'done') {
    setElementText(elements.statusText, '已记录');
    setElementText(elements.timerHint, 'Space 下一把 · O/2/D 快速改上一把');
  }
}

function renderReadyTimerHint() {
  if (appState !== 'ready') return;
  setElementText(
    elements.timerHint,
    scrambleGuideReadyHint() || (inspectionEnabled ? '按 Space 开始观察' : '长按 Space 超过 0.5s，松开开始计时'),
  );
}

function setElementText(element, text) {
  const nextText = String(text ?? '');
  if (element && element.textContent !== nextText) element.textContent = nextText;
}

function setDatasetValue(element, key, value) {
  const nextValue = String(value ?? '');
  if (element?.dataset?.[key] !== nextValue) element.dataset[key] = nextValue;
}

function setTimerFocusDataset(focusActive) {
  const nextValue = focusActive ? 'true' : 'false';
  if (document.body.dataset.focus === nextValue) return false;
  window.clearTimeout(timerFocusTransitionTimer);
  const transition = focusActive ? 'enter' : 'leave';
  document.body.dataset.focusTransition = transition;
  setDatasetValue(document.body, 'focus', nextValue);
  timerFocusTransitionTimer = window.setTimeout(() => {
    if (document.body.dataset.focusTransition === transition) delete document.body.dataset.focusTransition;
    timerFocusTransitionTimer = 0;
    if (transition === 'leave') {
      syncBluetooth3dFocusHost(timerFocusActive() && bluetooth3dUiActive());
      if (bluetooth3dUiActive()) scheduleBluetoothCube3dLayoutResize();
    }
  }, 360);
  return true;
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
  const solveLabel = solve ? displaySolveTime(solve) : '';
  const renderKey = [
    appState,
    scrambleLocked ? 1 : 0,
    canToggleScrambleLock() ? 1 : 0,
    solve?.id || '',
    solve?.penalty || '',
    solveLabel,
  ].join('|');
  if (renderKey === quickActionsRenderKey) return;
  quickActionsRenderKey = renderKey;
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
  const title = solve ? `上一把 ${solveLabel}` : '当前会话暂无成绩';
  elements.lastOkButton.title = title;
  elements.lastPlusTwoButton.title = title;
  elements.lastDnfButton.title = title;
  elements.lastDeleteButton.title = title;
}

function renderScramble(options = {}) {
  if (!scramble) return;
  const currentPuzzle = scramble.puzzle || scramblePuzzle;
  elements.scramblePuzzleSelect.value = currentPuzzle;
  elements.scramblePuzzleSelect.disabled = scrambleChangeLocked();
  renderScrambleGuideDisplay();
  const sourceText = `${puzzleLabel(currentPuzzle)} · ${scramble.source}${scrambleLocked ? ' · 已锁定' : ''}`;
  if (sourceText !== scrambleSourceRenderKey) {
    scrambleSourceRenderKey = sourceText;
    elements.scrambleSource.textContent = sourceText;
  }
  if (bluetoothLivePreviewMode()) {
    if (options.skipBluetooth3dCurrent) return;
    renderBluetoothCube3dCurrent();
  } else {
    renderScramblePreview(scramble.scramble, currentPuzzle);
  }
}

function renderScrambleGuideDisplay(correctionSnapshot = null, options = {}) {
  correctionSnapshot = correctionSnapshot
    || (scrambleGuideErrorIndex != null
      ? (options.deferCorrection ? scrambleGuideDeferredCorrectionSnapshot() : scrambleGuideCorrectionSnapshot())
      : null);
  renderScrambleText(correctionSnapshot);
  renderScrambleGuideMeta(correctionSnapshot);
}

function renderScrambleText(correctionSnapshot = null) {
  const text = scramble?.scramble || '';
  if (!text) {
    renderPlainScrambleText('empty', '当前打乱类型暂不可用');
    return;
  }

  if (!scrambleGuideSupported || !bluetoothScrambleGuideActive() || scrambleGuideMoves.length === 0) {
    renderPlainScrambleText(`plain|${text}`, text);
    return;
  }

  if (!scrambleGuideCompleted && !scrambleGuideHasSyncedState()) {
    renderPlainScrambleText(`await-sync|${text}`, text);
    return;
  }

  if (scrambleGuideErrorIndex != null) {
    const correction = correctionSnapshot || scrambleGuideCorrectionSnapshot();
    const correctionSegments = normalizeCorrectionSegments(correction.moves || [], correction.segments);
    if (correctionSegments.length === 0) {
      const message = correction.atTarget
        ? '当前状态已到达目标打乱'
        : correction.state.loading
          ? '正在计算最近修正公式...'
          : correction.state.error
            ? '求解器暂未返回，正在保留当前状态继续重试'
            : '正在根据当前魔方状态计算修正公式';
      renderPlainScrambleText([
        'correction-pending',
        correction.facelets,
        scrambleGuideTargetFacelets,
        correction.state.loading ? 1 : 0,
        correction.state.error || '',
        message,
      ].join('|'), message);
      return;
    }
    const correctionMoves = correctionMovesFromSegments(correctionSegments);
    const correctionKey = `correction|${correctionMoves.join(' ')}`;
    if (correctionKey === scrambleTextRenderKey) return;
    scrambleTextRenderKey = correctionKey;
    incrementPerformanceCounter('scrambleTextRenders');
    scrambleGuideStructureKey = '';
    scrambleGuideMoveNodes = [];
    scrambleGuideMoveNodeStates = [];
    scrambleGuideRenderedVisualState = null;
    elements.scrambleText.replaceChildren(
      ...correctionSegments.flatMap((segment, index) => {
        const span = document.createElement('span');
        span.className = correctionMoveClass(segment, index);
        span.textContent = segment.move;
        span.title = correctionMoveTitle(segment);
        return [span, document.createTextNode(index === correctionSegments.length - 1 ? '' : ' ')];
      }),
    );
    return;
  }

  const guideStructureKey = `guide-structure|${scrambleGuideMovesText}`;
  if (guideStructureKey !== scrambleGuideStructureKey) {
    scrambleGuideStructureKey = guideStructureKey;
    scrambleTextRenderKey = '';
    scrambleGuideRenderedVisualState = null;
    const moveNodes = [];
    elements.scrambleText.replaceChildren(
      ...scrambleGuideMoves.flatMap((move, index) => {
        const span = document.createElement('span');
        span.className = 'scramble-move';
        span.dataset.scrambleIndex = String(index);
        span.textContent = move;
        moveNodes.push(span);
        return [span, document.createTextNode(index === scrambleGuideMoves.length - 1 ? '' : ' ')];
      }),
    );
    scrambleGuideMoveNodes = moveNodes;
    scrambleGuideMoveNodeStates = Array(moveNodes.length).fill('');
  }
  const guideKey = [
    'guide',
    bluetoothScrambleGuideActive() ? 1 : 0,
    scrambleGuideCompleted ? 1 : 0,
    scrambleGuideCorrectPrefix,
    scrambleGuidePartialIndex ?? '-',
    scrambleGuideErrorIndex ?? '-',
    scrambleGuideErrorMove || '',
    scrambleGuideAwaitingSyncedState ? 1 : 0,
    appState,
  ].join('|');
  if (guideKey === scrambleTextRenderKey) return;
  scrambleTextRenderKey = guideKey;
  incrementPerformanceCounter('scrambleTextRenders');
  updateScrambleGuideMoveNodes();
}

function renderPlainScrambleText(key, text) {
  const renderKey = `text|${key}`;
  if (renderKey === scrambleTextRenderKey) return;
  scrambleTextRenderKey = renderKey;
  incrementPerformanceCounter('scrambleTextRenders');
  scrambleGuideStructureKey = '';
  scrambleGuideMoveNodes = [];
  scrambleGuideMoveNodeStates = [];
  scrambleGuideRenderedVisualState = null;
  setElementText(elements.scrambleText, text);
}

function correctionMoveClass(segment, index) {
  const kind = correctionSegmentKind(segment?.kind);
  return [
    'scramble-move',
    'correction',
    `correction-${kind}`,
    index === 0 ? 'current' : '',
  ].filter(Boolean).join(' ');
}

function correctionMoveTitle(segment) {
  const kind = correctionSegmentKind(segment?.kind);
  if (kind === 'undo') return '撤销错误转动';
  if (kind === 'resume') return '继续目标打乱公式';
  return '修正到目标打乱状态';
}

function updateScrambleGuideMoveNodes() {
  const nextState = scrambleGuideVisualState();
  const indexes = scrambleGuideChangedVisualIndexes(scrambleGuideRenderedVisualState, nextState);
  indexes.forEach(updateScrambleGuideMoveNode);
  scrambleGuideRenderedVisualState = nextState;
}

function scrambleGuideVisualState() {
  return {
    completed: scrambleGuideCompleted,
    correctPrefix: scrambleGuideCorrectPrefix,
    partialIndex: scrambleGuidePartialIndex,
    errorIndex: scrambleGuideErrorIndex,
    errorMove: scrambleGuideErrorMove,
    appState,
  };
}

function scrambleGuideChangedVisualIndexes(previous, next) {
  const allIndexes = () => new Set(scrambleGuideMoveNodes.map((_, index) => index));
  if (!previous || previous.completed !== next.completed || next.completed) return allIndexes();

  const indexes = new Set();
  addScrambleGuideVisualIndexRange(indexes, previous.correctPrefix, next.correctPrefix);
  addScrambleGuideVisualIndex(indexes, previous.correctPrefix - 1);
  addScrambleGuideVisualIndex(indexes, previous.correctPrefix);
  addScrambleGuideVisualIndex(indexes, next.correctPrefix - 1);
  addScrambleGuideVisualIndex(indexes, next.correctPrefix);
  addScrambleGuideVisualIndex(indexes, previous.partialIndex);
  addScrambleGuideVisualIndex(indexes, next.partialIndex);
  addScrambleGuideVisualIndex(indexes, previous.errorIndex);
  addScrambleGuideVisualIndex(indexes, next.errorIndex);

  if (previous.appState !== next.appState) {
    addScrambleGuideVisualIndex(indexes, previous.correctPrefix);
    addScrambleGuideVisualIndex(indexes, next.correctPrefix);
  }
  if (previous.errorMove !== next.errorMove) {
    addScrambleGuideVisualIndex(indexes, previous.errorIndex);
    addScrambleGuideVisualIndex(indexes, next.errorIndex);
  }
  return indexes;
}

function addScrambleGuideVisualIndexRange(indexes, left, right) {
  const start = Math.min(Number(left) || 0, Number(right) || 0);
  const end = Math.max(Number(left) || 0, Number(right) || 0);
  for (let index = start; index <= end; index += 1) addScrambleGuideVisualIndex(indexes, index);
}

function addScrambleGuideVisualIndex(indexes, index) {
  if (Number.isInteger(index) && index >= 0 && index < scrambleGuideMoveNodes.length) indexes.add(index);
}

function updateScrambleGuideMoveNode(index) {
  const node = scrambleGuideMoveNodes[index];
  if (!node) return;
  const move = scrambleGuideMoves[index] || '';
  const stateClass = scrambleMoveClass(index);
  const className = `scramble-move ${stateClass}`.trim();
  const title = scrambleMoveTitle(index, move);
  const stateKey = `${className}|${title}`;
  if (scrambleGuideMoveNodeStates[index] === stateKey) return;
  scrambleGuideMoveNodeStates[index] = stateKey;
  incrementPerformanceCounter('scrambleGuideNodeUpdates');
  if (node.className !== className) node.className = className;
  if (node.title !== title) node.title = title;
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

function renderScrambleGuideMeta(correctionSnapshot = null) {
  let text = '';
  let stateClass = '';
  if (!scrambleGuideSupported) {
    renderScrambleGuideMetaText(text, stateClass);
    return;
  }
  if (!bluetoothScrambleGuideActive()) {
    renderScrambleGuideMetaText(text, stateClass);
    return;
  }
  if (scrambleGuideCompleted) {
    renderScrambleGuideMetaText('打乱完成，已自动进入观察', 'complete');
    return;
  }
  if (!scrambleGuideHasSyncedState()) {
    renderScrambleGuideMetaText('等待蓝牙状态同步；同步后会按当前魔方状态计算打乱进度', stateClass);
    return;
  }
  if (scrambleGuideErrorIndex != null) {
    const expected = scrambleGuideMoves[scrambleGuideErrorIndex] || '-';
    const correction = correctionSnapshot || scrambleGuideCorrectionSnapshot();
    const correctionText = correction.text;
    const fallbackText = correction.state.loading
      ? '正在按当前魔方状态计算最近修正公式'
      : correction.state.error
        ? '求解器暂未返回，正在保留当前状态继续重试'
        : '正在准备按当前魔方状态计算最近修正公式';
    text = correctionText
      ? `打乱错误：第 ${scrambleGuideErrorIndex + 1} 步应为 ${expected}，实际 ${scrambleGuideErrorMove} · 按上方公式修正到目标打乱状态`
      : `打乱错误：第 ${scrambleGuideErrorIndex + 1} 步应为 ${expected}，实际 ${scrambleGuideErrorMove} · ${fallbackText}`;
    renderScrambleGuideMetaText(text, 'error');
    return;
  }
  if (scrambleGuidePartialIndex != null) {
    renderScrambleGuideMetaText(`双拨未完成：继续 ${scrambleGuideMoves[scrambleGuidePartialIndex] || ''}`, stateClass);
    return;
  }
  renderScrambleGuideMetaText(`蓝牙打乱校验 ${scrambleGuideCorrectPrefix}/${scrambleGuideMoves.length}`, stateClass);
}

function renderScrambleGuideMetaText(text, stateClass = '') {
  const renderKey = `${stateClass}|${text}`;
  if (renderKey === scrambleGuideMetaRenderKey) return;
  scrambleGuideMetaRenderKey = renderKey;
  incrementPerformanceCounter('scrambleGuideMetaRenders');
  elements.scrambleGuideMeta.classList.toggle('error', stateClass === 'error');
  elements.scrambleGuideMeta.classList.toggle('complete', stateClass === 'complete');
  setElementText(elements.scrambleGuideMeta, text);
}

function resetScrambleGuide() {
  scrambleGuideMoves = [];
  scrambleGuideMovesText = '';
  scrambleGuideInputMoves = [];
  scrambleGuideRoute = [];
  scrambleGuideRouteByFacelets = new Map();
  scrambleGuideRouteIndex = 0;
  scrambleGuideRouteStateMatched = false;
  scrambleGuideTargetFaces = null;
  scrambleGuideTargetSignature = '';
  scrambleGuideTargetFacelets = '';
  scrambleGuideTrackingFaces = null;
  scrambleGuideTrackingFacelets = '';
  scrambleGuideParsedMoveCache.clear();
  scrambleGuideCorrectPrefix = 0;
  scrambleGuidePartialIndex = null;
  scrambleGuideErrorIndex = null;
  scrambleGuideErrorMove = '';
  scrambleGuideLastMatchedInputLength = 0;
  scrambleGuideLastMatchedFacelets = '';
  scrambleGuideCompleted = false;
  scrambleGuideSupported = false;
  scrambleGuideAwaitingSyncedState = false;
  scrambleGuideSolverCacheKey = '';
  scrambleGuideSolverCacheMoves = [];
  scrambleGuideSolverCache.clear();
  clearScrambleGuideCorrectionRoute();
  scrambleGuideSolverLoadingKey = '';
  scrambleGuideSolverActiveKey = '';
  scrambleGuideSolverErrorKey = '';
  scrambleGuideSolverError = '';
  scrambleGuideMoveNodeStates = [];
  scrambleGuideRenderedVisualState = null;
  cancelScrambleGuideSolverCorrection();

  const currentPuzzle = scramble?.puzzle || scramblePuzzle;
  if (currentPuzzle !== 'three' || !scramble?.scramble) return;

  try {
    const parsedMoves = parseScramble(scramble.scramble);
    scrambleGuideMoves = parsedMoves.map(scrambleMoveNotation);
    scrambleGuideMovesText = scrambleGuideMoves.join(' ');
    scrambleGuideRoute = buildScrambleGuideRoute(parsedMoves);
    scrambleGuideRouteByFacelets = scrambleGuideRouteEntriesByFacelets(scrambleGuideRoute);
    scrambleGuideTargetFaces = null;
    scrambleGuideTargetFacelets = scrambleGuideRoute.at(-1)?.facelets || '';
    scrambleGuideTargetSignature = cubeFaceletSignature(scrambleGuideTargetFacelets);
    scrambleGuideSupported = scrambleGuideMoves.length > 0;
  } catch {
    scrambleGuideMoves = [];
    scrambleGuideMovesText = '';
    scrambleGuideRoute = [];
    scrambleGuideRouteByFacelets = new Map();
    scrambleGuideRouteIndex = 0;
    scrambleGuideRouteStateMatched = false;
    scrambleGuideTargetFaces = null;
    scrambleGuideTargetSignature = '';
    scrambleGuideTargetFacelets = '';
    scrambleGuideTrackingFaces = null;
    scrambleGuideTrackingFacelets = '';
    scrambleGuideLastMatchedFacelets = '';
    scrambleGuideParsedMoveCache.clear();
    scrambleGuideSupported = false;
  }
  scheduleScrambleGuideLocalSolverWarmupWhenUseful();
  scheduleScrambleGuideServerSolverWarmupWhenUseful();
}

function scrambleMoveNotation(move) {
  return `${move.face}${move.suffix || ''}`;
}

function buildScrambleGuideRoute(moves) {
  const atomicEntries = [];
  moves.forEach((move, index) => {
    const atomicMoves = scrambleMoveAtomicEntries(move);
    atomicMoves.forEach((entry, atomicIndex) => {
      atomicEntries.push({
        token: entry.token,
        move: entry.move,
        correctPrefix: atomicIndex === atomicMoves.length - 1 ? index + 1 : index,
        displayIndex: index,
        partial: atomicIndex < atomicMoves.length - 1,
      });
    });
  });

  let facelets = solvedFaceletString;
  const route = [{
    routeIndex: 0,
    token: '',
    facelets: solvedFaceletString,
    correctPrefix: 0,
    displayIndex: 0,
    partial: false,
  }];

  atomicEntries.forEach((entry, atomicIndex) => {
    facelets = applyMoveToFacelets(facelets, entry.token);
    route.push({
      routeIndex: atomicIndex + 1,
      token: entry.token,
      facelets,
      correctPrefix: entry.correctPrefix,
      displayIndex: entry.displayIndex,
      partial: entry.partial,
    });
  });

  return route;
}

function scrambleMoveAtomicEntries(move) {
  if (move.suffix !== '2') {
    return [{
      token: scrambleMoveNotation(move),
      move,
    }];
  }
  const quarterMove = { face: move.face, suffix: '' };
  return [
    { token: move.face, move: quarterMove },
    { token: move.face, move: quarterMove },
  ];
}

function scrambleGuideRouteEntriesByFacelets(route) {
  const entries = new Map();
  for (const entry of route) entries.set(entry.facelets, entry);
  return entries;
}

function setScrambleGuideTrackingState(faces, facelets = '') {
  if (!faces) {
    if (facelets) return setScrambleGuideTrackingFacelets(facelets);
    clearScrambleGuideTrackingState();
    return null;
  }
  try {
    scrambleGuideTrackingFaces = faces;
    scrambleGuideTrackingFacelets = facelets || faceletsFromFaces(faces);
  } catch {
    clearScrambleGuideTrackingState();
  }
  return scrambleGuideTrackingFaces;
}

function setScrambleGuideTrackingFacelets(facelets) {
  const text = String(facelets || '');
  if (!/^[URFDLB]{54}$/.test(text)) {
    clearScrambleGuideTrackingState();
    return null;
  }
  scrambleGuideTrackingFaces = null;
  scrambleGuideTrackingFacelets = text;
  return text;
}

function clearScrambleGuideTrackingState() {
  scrambleGuideTrackingFaces = null;
  scrambleGuideTrackingFacelets = '';
  scrambleGuideRouteIndex = 0;
  scrambleGuideRouteStateMatched = false;
}

function materializeScrambleGuideTrackingFaces() {
  if (scrambleGuideTrackingFaces) return scrambleGuideTrackingFaces;
  try {
    if (scrambleGuideTrackingFacelets) {
      scrambleGuideTrackingFaces = facesFromFacelets(scrambleGuideTrackingFacelets);
      return scrambleGuideTrackingFaces;
    }
    return null;
  } catch {
    clearScrambleGuideTrackingState();
    return null;
  }
}

function advanceScrambleGuideTrackingState(move, options = {}) {
  if (!scrambleGuideTrackingFacelets || !move) return null;
  try {
    scrambleGuideTrackingFacelets = applyMoveToFacelets(scrambleGuideTrackingFacelets, move);
    if (options.materialize === false) {
      scrambleGuideTrackingFaces = null;
      return true;
    }
    scrambleGuideTrackingFaces = facesFromFacelets(scrambleGuideTrackingFacelets);
    return scrambleGuideTrackingFaces;
  } catch {
    clearScrambleGuideTrackingState();
    return null;
  }
}

function scrambleGuideParsedMove(move) {
  const key = String(move || '').trim();
  const cached = scrambleGuideParsedMoveCache.get(key);
  if (cached) return cached;
  const parsedMove = parseMoveToken(key);
  if (!parsedMove) throw new Error('Invalid scramble guide move');
  scrambleGuideParsedMoveCache.set(key, parsedMove);
  return parsedMove;
}

function scrambleGuideCurrentFacelets(faces = null) {
  return scrambleGuideSyncedFacelets(faces);
}

function scrambleGuideRelativeFacelets(currentFacelets) {
  if (!scrambleGuideTargetFacelets || !currentFacelets) return '';
  try {
    return relativeFaceletsForScrambleTargetFacelets(scrambleGuideTargetFacelets, currentFacelets);
  } catch {
    return '';
  }
}

function scrambleGuideCorrectionSnapshot() {
  const facelets = scrambleGuideSyncedFacelets();
  const initialKey = scrambleGuideCorrectionSnapshotDependencyKey(facelets);
  if (initialKey === scrambleGuideCorrectionSnapshotKey && scrambleGuideCorrectionSnapshotValue) {
    return scrambleGuideCorrectionSnapshotValue;
  }
  const cacheKey = facelets ? scrambleGuideCorrectionKey(facelets) : '';
  const moves = scrambleGuideCorrectionMoves(facelets, cacheKey);
  const segments = scrambleGuideCorrectionRouteSegments(facelets, moves);
  const state = scrambleGuideCorrectionState(facelets, cacheKey);
  const snapshot = {
    facelets,
    cacheKey,
    moves,
    segments,
    text: correctionMovesFromSegments(segments).join(' '),
    state,
    atTarget: Boolean(facelets && facelets === scrambleGuideTargetFacelets),
  };
  scrambleGuideCorrectionSnapshotKey = scrambleGuideCorrectionSnapshotDependencyKey(facelets);
  scrambleGuideCorrectionSnapshotValue = snapshot;
  return snapshot;
}

function scrambleGuideDeferredCorrectionSnapshot() {
  const facelets = scrambleGuideSyncedFacelets();
  const cacheKey = facelets ? scrambleGuideCorrectionKey(facelets) : '';
  const cachedMoves = scrambleGuideCachedCorrectionMoves(facelets, cacheKey);
  if (cachedMoves) {
    const segments = scrambleGuideCorrectionRouteSegments(facelets, cachedMoves);
    return {
      facelets,
      cacheKey,
      moves: cachedMoves,
      segments,
      text: correctionMovesFromSegments(segments).join(' '),
      state: scrambleGuideCorrectionState(facelets, cacheKey),
      atTarget: Boolean(facelets && facelets === scrambleGuideTargetFacelets),
    };
  }
  if (facelets && facelets !== scrambleGuideTargetFacelets) {
    requestScrambleGuideSolverCorrection(cacheKey, facelets);
    scheduleScrambleGuideCorrectionRender();
  }
  return {
    facelets,
    cacheKey,
    moves: [],
    segments: [],
    text: '',
    state: {
      ...scrambleGuideCorrectionState(facelets, cacheKey),
      loading: true,
    },
    atTarget: Boolean(facelets && facelets === scrambleGuideTargetFacelets),
  };
}

function scheduleScrambleGuideCorrectionRender() {
  if (scrambleGuideCorrectionRenderFrame || !scrambleGuideSupported) return;
  incrementPerformanceCounter('scrambleGuideCorrectionDeferredRenders');
  scrambleGuideCorrectionRenderFrame = requestAnimationFrame(() => {
    scrambleGuideCorrectionRenderFrame = 0;
    if (scrambleGuideErrorIndex == null || scrambleGuideCompleted) return;
    renderScrambleGuideDisplay();
    renderReadyTimerHint();
  });
}

function scrambleGuideCorrectionSnapshotDependencyKey(facelets = scrambleGuideSyncedFacelets()) {
  return [
    scrambleGuideMovesText,
    scrambleGuideTargetSignature,
    scrambleGuideTargetFacelets,
    facelets || '',
    scrambleGuideSolverCacheKey,
    scrambleGuideSolverLoadingKey,
    scrambleGuideSolverActiveKey,
    scrambleGuideSolverQueuedKey,
    scrambleGuideSolverErrorKey,
    scrambleGuideSolverError,
    scrambleGuideSolverCache.size,
  ].join('|');
}

function clearScrambleGuideCorrectionSnapshot() {
  scrambleGuideCorrectionSnapshotKey = '';
  scrambleGuideCorrectionSnapshotValue = null;
}

function scrambleGuideCorrectionScrambleKey() {
  return [
    scrambleGuideMovesText,
    scrambleGuideTargetSignature,
    scrambleGuideTargetFacelets,
  ].join('|');
}

function clearScrambleGuideCorrectionRoute() {
  scrambleGuideCorrectionRouteByFacelets = new Map();
  scrambleGuideCorrectionRouteScrambleKey = '';
  scrambleGuideCorrectionRouteSourceFacelets = '';
  clearScrambleGuideCorrectionSnapshot();
}

function scrambleGuideCorrectionRouteEntry(facelets) {
  if (
    !facelets
    || !scrambleGuideCorrectionRouteScrambleKey
    || scrambleGuideCorrectionRouteScrambleKey !== scrambleGuideCorrectionScrambleKey()
  ) {
    return null;
  }
  return scrambleGuideCorrectionRouteByFacelets.get(facelets) || null;
}

function scrambleGuideCorrectionRouteMoves(facelets) {
  const route = scrambleGuideCorrectionRouteEntry(facelets);
  return route ? route.moves : null;
}

function scrambleGuideCorrectionRouteSegments(facelets, moves = []) {
  const route = scrambleGuideCorrectionRouteEntry(facelets);
  if (route?.segments) return normalizeCorrectionSegments([], route.segments);
  return normalizeCorrectionSegments(moves);
}

function normalizeCorrectionSegments(moves, segments = null, fallbackKind = 'solver') {
  const source = Array.isArray(segments) && segments.length > 0
    ? segments
    : normalizeCorrectionMoves(moves).map((move) => ({ move, kind: fallbackKind }));
  const normalized = [];
  for (const segment of source) {
    const rawMove = typeof segment === 'string' ? segment : segment?.move;
    const move = normalizeCorrectionMoves(rawMove || '').at(0);
    if (!move) continue;
    normalized.push({
      move,
      kind: correctionSegmentKind(segment?.kind || fallbackKind),
    });
  }
  return mergeCorrectionSegments(normalized);
}

function correctionSegmentKind(kind) {
  return ['undo', 'resume', 'solver'].includes(kind) ? kind : 'solver';
}

function mergeCorrectionSegments(segments) {
  const output = [];
  for (const segment of segments) {
    const previous = output.at(-1);
    const mergedMove = previous?.kind === segment.kind
      ? mergedCorrectionMove(previous.move, segment.move)
      : '';
    if (mergedMove) {
      previous.move = mergedMove;
    } else {
      output.push({ ...segment });
    }
  }
  return output;
}

function mergedCorrectionMove(left, right) {
  const merged = logicalMoveSequence([left, right]);
  return merged.length === 1 && /2$/.test(merged[0]) ? merged[0] : '';
}

function correctionMovesFromSegments(segments) {
  return normalizeCorrectionSegments([], segments).map((segment) => segment.move);
}

function correctionAtomicSegments(segments) {
  const output = [];
  segments.forEach((segment, sourceIndex) => {
    const parsedMove = scrambleGuideParsedMove(segment.move);
    const atomicMoves = scrambleMoveAtomicEntries(parsedMove);
    atomicMoves.forEach((entry, sourceAtomicIndex) => {
      output.push({
        move: entry.token,
        kind: segment.kind,
        sourceIndex,
        sourceAtomicIndex,
      });
    });
  });
  return output;
}

function correctionRemainingSegmentsAfterAtomic(segments, atomicSegments, nextAtomicIndex) {
  if (nextAtomicIndex <= 0) return segments;
  const nextAtomic = atomicSegments[nextAtomicIndex];
  if (!nextAtomic) return [];
  const sourceSegment = segments[nextAtomic.sourceIndex];
  if (!sourceSegment) return [];
  if (nextAtomic.sourceAtomicIndex === 0) return segments.slice(nextAtomic.sourceIndex);
  return [
    {
      move: nextAtomic.move,
      kind: sourceSegment.kind,
    },
    ...segments.slice(nextAtomic.sourceIndex + 1),
  ];
}

function rememberScrambleGuideCorrectionRoute(startFacelets, moves, options = {}) {
  if (!scrambleGuideSupported || !startFacelets || startFacelets === scrambleGuideTargetFacelets) return;
  const normalizedSegments = normalizeCorrectionSegments(moves, options.segments);
  const normalizedMoves = correctionMovesFromSegments(normalizedSegments);
  if (normalizedMoves.length === 0) return;

  try {
    let currentFacelets = startFacelets;
    const atomicSegments = correctionAtomicSegments(normalizedSegments);
    const routeByFacelets = new Map();
    routeByFacelets.set(startFacelets, {
      moves: normalizedMoves,
      segments: normalizedSegments,
      sourceFacelets: startFacelets,
    });
    for (let index = 0; index < atomicSegments.length; index += 1) {
      currentFacelets = applyMoveToFacelets(currentFacelets, atomicSegments[index].move);
      const segments = correctionRemainingSegmentsAfterAtomic(normalizedSegments, atomicSegments, index + 1);
      routeByFacelets.set(currentFacelets, {
        moves: correctionMovesFromSegments(segments),
        segments,
        sourceFacelets: startFacelets,
      });
    }
    if (scrambleGuideTargetFacelets && currentFacelets !== scrambleGuideTargetFacelets) return;
    scrambleGuideCorrectionRouteByFacelets = routeByFacelets;
    scrambleGuideCorrectionRouteScrambleKey = scrambleGuideCorrectionScrambleKey();
    scrambleGuideCorrectionRouteSourceFacelets = startFacelets;
    clearScrambleGuideCorrectionSnapshot();
  } catch {
    clearScrambleGuideCorrectionRoute();
  }
}

function cancelScrambleGuideCorrectionRender() {
  if (!scrambleGuideCorrectionRenderFrame) return;
  cancelAnimationFrame(scrambleGuideCorrectionRenderFrame);
  scrambleGuideCorrectionRenderFrame = 0;
}

function scrambleGuideBacktrackCorrection(facelets) {
  if (!facelets || !scrambleGuideLastMatchedFacelets || facelets === scrambleGuideTargetFacelets) return null;
  const wrongMoves = normalizeCorrectionMoves(scrambleGuideInputMoves.slice(scrambleGuideLastMatchedInputLength));
  if (wrongMoves.length === 0 || wrongMoves.length > scrambleGuideBacktrackCorrectionMaxWrongMoves) return null;

  let baseFacelets = scrambleGuideLastMatchedFacelets;
  let resumeMoves = [];
  const correctionRoute = scrambleGuideCorrectionRouteEntry(baseFacelets);
  if (correctionRoute) {
    resumeMoves = correctionRoute.moves || [];
  } else {
    const baseRoute = scrambleGuideRouteByFacelets.get(baseFacelets);
    const baseRouteIndex = Number.isInteger(baseRoute?.routeIndex)
      ? baseRoute.routeIndex
      : scrambleGuideRouteIndex;
    resumeMoves = scrambleGuideRoute
      .slice(Math.max(0, baseRouteIndex + 1))
      .map((entry) => entry.token)
      .filter(Boolean);
  }

  try {
    if (applyMovesToFacelets(baseFacelets, wrongMoves) !== facelets) return null;
  } catch {
    return null;
  }

  const segments = [
    ...invertCorrectionMoves(wrongMoves).map((move) => ({ move, kind: 'undo' })),
    ...normalizeCorrectionMoves(resumeMoves).map((move) => ({ move, kind: correctionRoute ? 'solver' : 'resume' })),
  ];
  return {
    moves: correctionMovesFromSegments(segments),
    segments,
  };
}

function invertCorrectionMoves(moves) {
  return normalizeCorrectionMoves(moves).slice().reverse().map(invertCorrectionMove);
}

function invertCorrectionMove(move) {
  const parsed = scrambleGuideParsedMove(move);
  if (parsed.suffix === '2') return `${parsed.face}2`;
  return `${parsed.face}${parsed.suffix === "'" ? '' : "'"}`;
}

function scrambleGuideCorrectionMoves(facelets = scrambleGuideSyncedFacelets(), cacheKey = '') {
  if (!scrambleGuideSupported) return [];
  if (!facelets) return [];
  if (facelets === scrambleGuideTargetFacelets) return [];
  cacheKey = cacheKey || scrambleGuideCorrectionKey(facelets);
  const cachedMoves = scrambleGuideCachedCorrectionMoves(facelets, cacheKey);
  if (cachedMoves) {
    scrambleGuideSolverCacheKey = cacheKey;
    scrambleGuideSolverCacheMoves = cachedMoves;
    return cachedMoves;
  }
  if (cacheKey === scrambleGuideSolverCacheKey) return scrambleGuideSolverCacheMoves;
  if (
    cacheKey === scrambleGuideSolverLoadingKey
    || cacheKey === scrambleGuideSolverActiveKey
    || cacheKey === scrambleGuideSolverQueuedKey
    || cacheKey === scrambleGuideSolverErrorKey
  ) {
    return [];
  }

  const relativeFacelets = scrambleGuideRelativeFacelets(facelets);
  if (relativeFacelets && !scrambleGuideLocalSolverWarmed) {
    warmScrambleGuideLocalSolver(scrambleGuideLocalCorrectionImmediateWarmupMaxMs);
    if (!scrambleGuideLocalSolverWarmed) scheduleScrambleGuideLocalSolverWarmup({ immediate: true });
  }
  if (relativeFacelets && scrambleGuideLocalSolverWarmed) {
    const localStartedAt = performance.now();
    const localMoves = shortCorrectionMovesForRelativeFacelets(relativeFacelets, {
      maxDepth: scrambleGuideLocalCorrectionMaxDepth,
      maxMs: scrambleGuideLocalCorrectionMaxMs,
      maxNodes: scrambleGuideLocalCorrectionMaxNodes,
    });
    recordScrambleGuideLocalSolver(performance.now() - localStartedAt, Array.isArray(localMoves));
    if (Array.isArray(localMoves)) {
      scrambleGuideSolverCacheKey = cacheKey;
      scrambleGuideSolverCacheMoves = normalizeCorrectionMoves(localMoves);
      rememberScrambleGuideSolverCache(cacheKey, scrambleGuideSolverCacheMoves, { facelets });
      return scrambleGuideSolverCacheMoves;
    }
  } else if (relativeFacelets) {
    incrementPerformanceCounter('scrambleGuideLocalSolverSkipped');
  }

  requestScrambleGuideSolverCorrection(cacheKey, facelets);
  return [];
}

function scrambleGuideCachedCorrectionMoves(facelets = scrambleGuideSyncedFacelets(), cacheKey = '') {
  if (!facelets) return null;
  if (facelets === scrambleGuideTargetFacelets) return [];
  const routeMoves = scrambleGuideCorrectionRouteMoves(facelets);
  if (routeMoves) return routeMoves;
  const backtrack = scrambleGuideBacktrackCorrection(facelets);
  if (backtrack) {
    rememberScrambleGuideCorrectionRoute(facelets, backtrack.moves, { segments: backtrack.segments });
    return backtrack.moves;
  }
  const key = cacheKey || scrambleGuideCorrectionKey(facelets);
  const cachedMoves = scrambleGuideSolverCache.get(key);
  if (cachedMoves) {
    rememberScrambleGuideCorrectionRoute(facelets, cachedMoves);
    return cachedMoves;
  }
  return key === scrambleGuideSolverCacheKey ? scrambleGuideSolverCacheMoves : null;
}

function scrambleGuideCorrectionText(snapshot = null) {
  return (snapshot || scrambleGuideCorrectionSnapshot()).text;
}

function scrambleGuideCorrectionKey(facelets) {
  return [
    scrambleGuideMovesText,
    scrambleGuideTargetSignature,
    facelets,
  ].join('|');
}

function scrambleGuideCorrectionState(facelets = scrambleGuideSyncedFacelets(), cacheKey = '') {
  if (!facelets) return { loading: false, error: '' };
  cacheKey = cacheKey || scrambleGuideCorrectionKey(facelets);
  return {
    loading: cacheKey === scrambleGuideSolverLoadingKey
      || cacheKey === scrambleGuideSolverActiveKey
      || cacheKey === scrambleGuideSolverQueuedKey,
    error: cacheKey === scrambleGuideSolverErrorKey ? scrambleGuideSolverError : '',
  };
}

function requestScrambleGuideSolverCorrection(cacheKey, facelets) {
  if (scrambleGuideCorrectionRouteMoves(facelets)) return;
  if (scrambleGuideSolverRetryKey && scrambleGuideSolverRetryKey !== cacheKey) {
    clearScrambleGuideSolverRetry();
  }
  if (
    cacheKey === scrambleGuideSolverActiveKey
    || cacheKey === scrambleGuideSolverLoadingKey
    || cacheKey === scrambleGuideSolverQueuedKey
    || cacheKey === scrambleGuideSolverCacheKey
    || scrambleGuideSolverCache.has(cacheKey)
  ) {
    return;
  }
  if (scrambleGuideSolverTimer) {
    clearTimeout(scrambleGuideSolverTimer);
    scrambleGuideSolverTimer = 0;
  }
  scrambleGuideSolverQueuedKey = cacheKey;
  scrambleGuideSolverQueuedFacelets = facelets;
  scrambleGuideSolverLoadingKey = cacheKey;
  scrambleGuideSolverErrorKey = '';
  scrambleGuideSolverError = '';
  if (scrambleGuideSolverActiveKey) {
    incrementPerformanceCounter('scrambleGuideSolverCoalesced');
    return;
  }
  scrambleGuideSolverTimer = window.setTimeout(startQueuedScrambleGuideSolverCorrection, scrambleGuideSolverDebounceMs);
}

function startQueuedScrambleGuideSolverCorrection() {
  scrambleGuideSolverTimer = 0;
  const cacheKey = scrambleGuideSolverQueuedKey;
  const facelets = scrambleGuideSolverQueuedFacelets;
  scrambleGuideSolverQueuedKey = '';
  scrambleGuideSolverQueuedFacelets = '';
  if (!cacheKey) return;
  if (scrambleGuideSolverActiveKey) {
    scrambleGuideSolverQueuedKey = cacheKey;
    scrambleGuideSolverQueuedFacelets = facelets;
    return;
  }

  scrambleGuideSolverActiveKey = cacheKey;
  scrambleGuideSolverLoadingKey = cacheKey;
  scrambleGuideSolverAbortController = new AbortController();
  scrambleGuideSolverActiveStartedAt = performance.now();
  const relativeFacelets = scrambleGuideRelativeFacelets(facelets);
  const solverStartedAt = scrambleGuideSolverActiveStartedAt;
  incrementPerformanceCounter('scrambleGuideSolverRequests');
  requestJson('/api/cube-correction', {
    method: 'POST',
    signal: scrambleGuideSolverAbortController.signal,
    body: {
      target: scrambleGuideMovesText,
      targetFacelets: scrambleGuideTargetFacelets,
      relativeFacelets,
      facelets,
      maxDepth: 25,
      probeMax: 1000000,
      timeoutMs: scrambleGuideSolverTimeoutMs,
    },
  })
    .then((data) => {
      if (scrambleGuideSolverActiveKey !== cacheKey) return;
      recordScrambleGuideSolverWallTime(performance.now() - solverStartedAt, true);
      scrambleGuideSolverCacheKey = cacheKey;
      scrambleGuideSolverCacheMoves = normalizeCorrectionMoves(data?.moves || data?.correction || '');
      rememberScrambleGuideSolverCache(cacheKey, scrambleGuideSolverCacheMoves, { facelets });
    })
    .catch((error) => {
      if (scrambleGuideSolverActiveKey !== cacheKey) return;
      if (error?.name === 'AbortError') return;
      recordScrambleGuideSolverWallTime(performance.now() - solverStartedAt, false);
      scrambleGuideSolverErrorKey = cacheKey;
      scrambleGuideSolverError = error?.message || 'Unable to solve correction';
      scheduleScrambleGuideSolverRetry(cacheKey, facelets);
    })
    .finally(() => {
      if (scrambleGuideSolverActiveKey === cacheKey) {
        scrambleGuideSolverActiveKey = '';
        scrambleGuideSolverAbortController = null;
        scrambleGuideSolverActiveStartedAt = 0;
      }
      if (scrambleGuideSolverLoadingKey === cacheKey) scrambleGuideSolverLoadingKey = '';
      if (scrambleGuideSolverQueuedKey && !scrambleGuideSolverTimer) {
        scrambleGuideSolverLoadingKey = scrambleGuideSolverQueuedKey;
        scrambleGuideSolverTimer = window.setTimeout(startQueuedScrambleGuideSolverCorrection, scrambleGuideSolverDebounceMs);
      }
      renderScrambleGuideDisplay();
    });
}

function scheduleScrambleGuideSolverRetry(cacheKey, facelets) {
  if (!cacheKey || !facelets || scrambleGuideCompleted || !scrambleGuideSupported) return;
  if (scrambleGuideSolverRetryKey !== cacheKey) {
    clearScrambleGuideSolverRetry();
    scrambleGuideSolverRetryKey = cacheKey;
    scrambleGuideSolverRetryFacelets = facelets;
    scrambleGuideSolverRetryCount = 0;
  } else {
    scrambleGuideSolverRetryFacelets = facelets;
  }
  if (scrambleGuideSolverRetryCount >= scrambleGuideSolverMaxRetries) return;
  scrambleGuideSolverRetryCount += 1;
  incrementPerformanceCounter('scrambleGuideSolverRetries');
  const delayMs = Math.min(
    scrambleGuideSolverRetryMaxDelayMs,
    scrambleGuideSolverRetryDelayMs * (2 ** (scrambleGuideSolverRetryCount - 1)),
  );
  if (scrambleGuideSolverRetryTimer) clearTimeout(scrambleGuideSolverRetryTimer);
  scrambleGuideSolverRetryTimer = window.setTimeout(() => {
    scrambleGuideSolverRetryTimer = 0;
    const retryKey = scrambleGuideSolverRetryKey;
    const retryFacelets = scrambleGuideSolverRetryFacelets;
    if (
      !retryKey
      || !retryFacelets
      || scrambleGuideCompleted
      || !scrambleGuideSupported
      || scrambleGuideSolverCache.has(retryKey)
      || scrambleGuideSyncedFacelets() !== retryFacelets
    ) {
      return;
    }
    if (scrambleGuideSolverErrorKey === retryKey) {
      scrambleGuideSolverErrorKey = '';
      scrambleGuideSolverError = '';
    }
    requestScrambleGuideSolverCorrection(retryKey, retryFacelets);
    renderScrambleGuideDisplay();
  }, delayMs);
}

function clearScrambleGuideSolverRetry() {
  if (scrambleGuideSolverRetryTimer) {
    clearTimeout(scrambleGuideSolverRetryTimer);
    scrambleGuideSolverRetryTimer = 0;
  }
  scrambleGuideSolverRetryKey = '';
  scrambleGuideSolverRetryFacelets = '';
  scrambleGuideSolverRetryCount = 0;
}

function rememberScrambleGuideSolverCache(cacheKey, moves, options = {}) {
  if (!cacheKey) return;
  moves = normalizeCorrectionMoves(moves);
  if (scrambleGuideSolverCache.has(cacheKey)) scrambleGuideSolverCache.delete(cacheKey);
  scrambleGuideSolverCache.set(cacheKey, moves);
  if (options.facelets) rememberScrambleGuideCorrectionRoute(options.facelets, moves);
  if (cacheKey === scrambleGuideSolverRetryKey) clearScrambleGuideSolverRetry();
  clearScrambleGuideCorrectionSnapshot();
  while (scrambleGuideSolverCache.size > scrambleGuideSolverCacheLimit) {
    scrambleGuideSolverCache.delete(scrambleGuideSolverCache.keys().next().value);
  }
}

function cancelScrambleGuideSolverCorrection() {
  if (scrambleGuideSolverTimer) {
    clearTimeout(scrambleGuideSolverTimer);
    scrambleGuideSolverTimer = 0;
  }
  if (scrambleGuideSolverAbortController) {
    if (!scrambleGuideSolverAbortController.signal?.aborted) {
      incrementPerformanceCounter('scrambleGuideSolverAborted');
    }
    scrambleGuideSolverAbortController.abort();
    scrambleGuideSolverAbortController = null;
  }
  scrambleGuideSolverQueuedKey = '';
  scrambleGuideSolverQueuedFacelets = '';
  scrambleGuideSolverLoadingKey = '';
  scrambleGuideSolverActiveKey = '';
  scrambleGuideSolverActiveStartedAt = 0;
  clearScrambleGuideSolverRetry();
  cancelScrambleGuideCorrectionRender();
  clearScrambleGuideCorrectionSnapshot();
}

function normalizeCorrectionMoves(input) {
  const text = Array.isArray(input) ? input.join(' ') : String(input || '');
  try {
    return logicalMoveSequence(parseScramble(text).map(scrambleMoveNotation));
  } catch {
    return [];
  }
}

function scrambleGuideReadyHint() {
  if (!bluetoothScrambleGuideActive() || appState !== 'ready') return '';
  if (scrambleGuideCompleted) return '打乱完成，观察中转动魔方即可开始计时';
  if (!scrambleGuideHasSyncedState()) return '等待蓝牙状态同步后开始校验';
  if (scrambleGuideErrorIndex != null) return '打乱公式不匹配，请按上方公式修正';
  if (scrambleGuidePartialIndex != null) return `双拨未完成：继续 ${scrambleGuideMoves[scrambleGuidePartialIndex] || ''}`;
  if (scrambleGuideCorrectPrefix > 0) return `继续打乱：${scrambleGuideCorrectPrefix}/${scrambleGuideMoves.length}`;
  return '转动蓝牙魔方开始打乱校验';
}

function bluetoothScrambleGuideActive() {
  return scrambleGuideSupported && Boolean(bluetoothDevice?.gatt?.connected);
}

function scrambleGuideHasSyncedState(faces = null, facelets = '') {
  return Boolean(
    faces
    || facelets
    || scrambleGuideTrackingFaces
    || scrambleGuideTrackingFacelets
    || bluetoothPhysicalFacelets
    || bluetoothPhysicalFaces
  );
}

function scrambleGuideSyncedFacelets(faces = null, facelets = '') {
  if (facelets) return facelets;
  if (faces) {
    if (faces === scrambleGuideTrackingFaces && scrambleGuideTrackingFacelets) return scrambleGuideTrackingFacelets;
    if (faces === bluetoothPhysicalFaces && bluetoothPhysicalFacelets) return bluetoothPhysicalFacelets;
    return faceletsFromFaces(faces);
  }
  return scrambleGuideTrackingFacelets || bluetoothPhysicalFacelets || '';
}

function scrambleGuideSyncedFaces(faces = null) {
  return faces || scrambleGuideTrackingFaces || materializeScrambleGuideTrackingFaces() || bluetoothPhysicalFaces || null;
}

function handleBluetoothMovesForCurrentState(moves, source, protocol = '', deviceName = '', options = {}) {
  let parsedMoves = normalizedBluetoothMoveList(moves);
  const result = {
    trackingMoves: false,
    consumed: false,
    ignoredReason: '',
    statusLabel: '',
    logKind: '',
  };
  if (parsedMoves.length === 0) return result;

  if (shouldProcessBluetoothNextSolveGesture()) {
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
    const guide = applyScrambleGuideMoves(parsedMoves, source, protocol, deviceName, options);
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

function normalizedBluetoothMoveList(moves) {
  if (!Array.isArray(moves) || moves.length === 0) return [];
  for (let index = 0; index < moves.length; index += 1) {
    if (!moves[index]) return moves.filter(Boolean);
  }
  return moves;
}

function shouldProcessBluetoothNextSolveGesture() {
  if (appState === 'done') return true;
  if (appState !== 'ready') return false;
  return Boolean(bluetoothNextSolveGestureCandidate || bluetoothNextSolveGestureReadyCanStart());
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
  if (!scrambleGuideSupported || scrambleGuideCompleted || scrambleGuideErrorIndex != null) return false;
  return scrambleGuideRouteStateMatched && scrambleGuideRoute[scrambleGuideRouteIndex + 1]?.token === move;
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

function syncScrambleGuideFromSyncedState(faces = null, source = '蓝牙状态', facelets = '') {
  const syncedFacelets = facelets || scrambleGuideSyncedFacelets(faces);
  if (
    !scrambleGuideSupported
    || scrambleGuideCompleted
    || appState !== 'ready'
    || (!faces && !syncedFacelets)
  ) {
    return false;
  }
  if (faces) setScrambleGuideTrackingState(faces, syncedFacelets);
  else setScrambleGuideTrackingFacelets(syncedFacelets);
  const match = updateScrambleGuideProgress('', { syncedFaces: faces, syncedFacelets });
  if (scrambleGuideRouteEntryMatchesTarget(match)) {
    completeScrambleGuide(source, source, bluetoothDevice?.name || '');
    return true;
  }
  renderScrambleGuideDisplay();
  renderReadyTimerHint();
  return true;
}

function syncCurrentScrambleGuideState() {
  if (!bluetoothPhysicalFacelets && !bluetoothPhysicalFaces) return false;
  return syncScrambleGuideFromSyncedState(bluetoothPhysicalFaces, '蓝牙状态', bluetoothPhysicalFacelets);
}

function advanceScrambleGuideProgressWithExpectedMove(move) {
  if (
    !scrambleGuideSupported
    || !scrambleGuideRouteStateMatched
    || scrambleGuideCompleted
    || scrambleGuideErrorIndex != null
  ) {
    return null;
  }
  const match = scrambleGuideRoute[scrambleGuideRouteIndex + 1] || null;
  if (!match || match.token !== move) return null;
  applyScrambleGuideRouteMatch(match);
  return match;
}

function applyScrambleGuideMoves(moves, source, protocol = '', deviceName = '', options = {}) {
  if (!scrambleGuideSupported || scrambleGuideCompleted) {
    return { statusLabel: '等待计时', reason: '等待计时', logKind: '数据/预备转动' };
  }

  if (!scrambleGuideHasSyncedState(options.syncedFaces, options.syncedFacelets)) {
    scrambleGuideAwaitingSyncedState = true;
    renderScrambleGuideDisplay();
    renderReadyTimerHint();
    return { statusLabel: '等待状态同步', reason: '等待状态同步', logKind: '打乱/等待状态' };
  }

  let firstError = false;
  let recovered = false;
  const syncedFaces = options.syncedFaces
    || scrambleGuideTrackingFaces
    || (!scrambleGuideTrackingFacelets ? bluetoothPhysicalFaces : null);
  const packetSyncedFacelets = options.syncedFacelets || '';
  const syncedFacelets = packetSyncedFacelets || scrambleGuideSyncedFacelets(syncedFaces);
  const hasPacketFinalFacelets = /^[URFDLB]{54}$/.test(packetSyncedFacelets);
  if (options.syncedFaces || (!scrambleGuideTrackingFacelets && syncedFaces)) {
    setScrambleGuideTrackingState(syncedFaces, syncedFacelets);
  } else if (!hasPacketFinalFacelets && /^[URFDLB]{54}$/.test(syncedFacelets) && !scrambleGuideTrackingFacelets) {
    setScrambleGuideTrackingFacelets(syncedFacelets);
  }
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    const wasError = scrambleGuideErrorIndex != null;
    scrambleGuideInputMoves.push(move);
    let match = advanceScrambleGuideProgressWithExpectedMove(move);
    if (!match) {
      if (hasPacketFinalFacelets && index === moves.length - 1) {
        setScrambleGuideTrackingFacelets(packetSyncedFacelets);
        match = updateScrambleGuideProgress(move, { syncedFacelets: packetSyncedFacelets });
      } else {
        const advanced = advanceScrambleGuideTrackingState(move, { materialize: false });
        const predictedFaces = advanced ? null : scrambleGuideSyncedFaces(syncedFaces);
        match = updateScrambleGuideProgress(move, {
          syncedFaces: predictedFaces,
          syncedFacelets: advanced ? scrambleGuideTrackingFacelets : scrambleGuideSyncedFacelets(predictedFaces, syncedFacelets),
        });
      }
    }
    updateBluetooth3dMove(move, {
      targetFacelets: scrambleGuideTrackingFacelets,
      targetSignature: scrambleGuideTrackingFacelets ? cubeFaceletSignature(scrambleGuideTrackingFacelets) : '',
    });
    if (!wasError && scrambleGuideErrorIndex != null) firstError = true;
    if (wasError && scrambleGuideErrorIndex == null) recovered = true;

    if (scrambleGuideRouteEntryMatchesTarget(match)) {
      completeScrambleGuide(source, protocol, deviceName);
      break;
    }
  }

  let correctionSnapshotForRender = null;
  if (firstError && scrambleGuideErrorIndex != null) {
    correctionSnapshotForRender = scrambleGuideDeferredCorrectionSnapshot();
    const correction = scrambleGuideCorrectionText(correctionSnapshotForRender);
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

  renderScrambleGuideDisplay(correctionSnapshotForRender);
  renderReadyTimerHint();

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

function applyScrambleGuideRouteMatch(match) {
  scrambleGuideCorrectPrefix = match.correctPrefix;
  scrambleGuidePartialIndex = match.partial ? match.displayIndex : null;
  scrambleGuideErrorIndex = null;
  scrambleGuideErrorMove = '';
  scrambleGuideRouteIndex = Number.isInteger(match.routeIndex) ? match.routeIndex : scrambleGuideRoute.indexOf(match);
  if (scrambleGuideRouteIndex < 0) scrambleGuideRouteIndex = 0;
  scrambleGuideRouteStateMatched = true;
  scrambleGuideTrackingFaces = null;
  scrambleGuideTrackingFacelets = match.facelets || '';
  scrambleGuideLastMatchedInputLength = scrambleGuideInputMoves.length;
  scrambleGuideLastMatchedFacelets = match.facelets || '';
}

function applyScrambleGuideCorrectionRouteMatch(facelets, routeEntry = null) {
  const entry = routeEntry || scrambleGuideCorrectionRouteEntry(facelets);
  if (!facelets || !entry) return null;
  scrambleGuideRouteStateMatched = false;
  scrambleGuidePartialIndex = null;
  scrambleGuideTrackingFaces = null;
  scrambleGuideTrackingFacelets = facelets;
  scrambleGuideLastMatchedInputLength = scrambleGuideInputMoves.length;
  scrambleGuideLastMatchedFacelets = facelets;
  clearScrambleGuideCorrectionSnapshot();
  return {
    ...entry,
    correctionRoute: true,
    facelets,
    partial: false,
    correctPrefix: scrambleGuideCorrectPrefix,
    atTarget: entry.moves.length === 0 || facelets === scrambleGuideTargetFacelets,
  };
}

function updateScrambleGuideProgress(latestMove = '', options = {}) {
  scrambleGuideAwaitingSyncedState = false;
  let syncedFacelets = '';
  try {
    syncedFacelets = scrambleGuideSyncedFacelets(options.syncedFaces, options.syncedFacelets || '');
  } catch {
    syncedFacelets = '';
  }
  const match = syncedFacelets
    ? (scrambleGuideRouteByFacelets.get(syncedFacelets) || null)
    : scrambleGuideRouteMatch(options.syncedFaces, options.syncedFacelets || '');
  if (match) {
    applyScrambleGuideRouteMatch(match);
    return match;
  }

  if (scrambleGuideErrorIndex != null && syncedFacelets) {
    const correctionRoute = scrambleGuideCorrectionRouteEntry(syncedFacelets);
    if (correctionRoute) {
      return applyScrambleGuideCorrectionRouteMatch(syncedFacelets, correctionRoute);
    }
  }

  scrambleGuideRouteStateMatched = false;
  if (scrambleGuideErrorIndex == null) {
    scrambleGuideErrorIndex = Math.min(scrambleGuideCorrectPrefix, scrambleGuideMoves.length - 1);
    scrambleGuideErrorMove = latestMove || '当前状态';
  }
  scrambleGuidePartialIndex = null;
  return null;
}

function scrambleGuideRouteEntryMatchesTarget(match) {
  if (match?.correctionRoute) return Boolean(match.atTarget);
  return Boolean(match && !match.partial && match.correctPrefix >= scrambleGuideMoves.length);
}

function scrambleGuideRouteMatch(syncedFaces = null, syncedFacelets = '') {
  if (!scrambleGuideSupported) return null;
  try {
    const facelets = scrambleGuideSyncedFacelets(syncedFaces, syncedFacelets);
    if (facelets) return scrambleGuideRouteByFacelets.get(facelets) || null;
    const faces = scrambleGuideSyncedFaces(syncedFaces);
    if (!faces) return null;
    const fallbackFacelets = faceletsFromFaces(faces);
    return scrambleGuideRouteByFacelets.get(fallbackFacelets) || null;
  } catch {
    return null;
  }
}

function completeScrambleGuide(source, protocol = '', deviceName = '') {
  if (scrambleGuideCompleted) return;
  scrambleGuideCompleted = true;
  scrambleGuideCorrectPrefix = scrambleGuideMoves.length;
  scrambleGuidePartialIndex = null;
  scrambleGuideErrorIndex = null;
  scrambleGuideErrorMove = '';
  scrambleGuideRouteIndex = Math.max(0, scrambleGuideRoute.length - 1);
  scrambleGuideRouteStateMatched = true;
  scrambleGuideLastMatchedInputLength = scrambleGuideInputMoves.length;
  scrambleGuideLastMatchedFacelets = scrambleGuideTargetFacelets;
  inspectionStartedAt = 0;
  activePenalty = 'ok';
  addBluetoothLog(
    '打乱/完成',
    '蓝牙状态匹配打乱公式',
    [deviceName, protocol, source, `${scrambleGuideInputMoves.length} 步`].filter(Boolean).join(' · '),
  );
  startInspection({ bluetoothGuardMs: 1000 });
  renderScrambleGuideDisplay();
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
  const signature = sessionMetricsSignature(sessionSolves);
  const goal = sessionTargetCountForId(currentSessionId);
  const partialSummary = historyPartial ? bootstrapSessionSummaries?.[currentSessionId] : null;
  const partialSummaryKey = partialSummary ? [
    partialSummary.count,
    partialSummary.dnfCount,
    partialSummary.latest,
    partialSummary.best,
    partialSummary.average,
    partialSummary.mo3,
    partialSummary.ao5,
    partialSummary.ao12,
    partialSummary.bestMo3,
    partialSummary.bestAo5,
    partialSummary.bestAo12,
  ].join(':') : '';
  const renderKey = [
    currentSessionId,
    signature,
    goal ?? '',
    historyPartial ? 'partial' : 'full',
    historyTotal,
    partialSummaryKey,
  ].join('|');
  if (renderKey === statsOverviewRenderKey) return;
  statsOverviewRenderKey = renderKey;

  const sessionSummary = partialSummary || summarizeSolves(sessionSolves);
  const totalCount = sessionSummary.count ?? sessionSolves.length;
  const dnfCount = sessionSummary.dnfCount ?? sessionSolves.filter((solve) => solve.penalty === 'dnf').length;
  const successCount = Math.max(0, totalCount - dnfCount);
  elements.countStat.textContent = `${successCount}/${totalCount}`;
  renderSessionGoalProgress(successCount, totalCount, goal);
  elements.bestStat.textContent = sessionSummary.best == null ? '-' : formatTime(sessionSummary.best);
  elements.averageStat.textContent = sessionSummary.average == null ? '-' : formatTime(sessionSummary.average);
  elements.mo3Stat.textContent = sessionSummary.mo3 == null ? '-' : formatTime(sessionSummary.mo3);
  elements.ao5Stat.textContent = sessionSummary.ao5 == null ? '-' : formatTime(sessionSummary.ao5);
  elements.ao12Stat.textContent = sessionSummary.ao12 == null ? '-' : formatTime(sessionSummary.ao12);
  elements.bestMo3Stat.textContent = sessionSummary.bestMo3 == null ? '-' : formatTime(sessionSummary.bestMo3);
  elements.bestAo5Stat.textContent = sessionSummary.bestAo5 == null ? '-' : formatTime(sessionSummary.bestAo5);
  elements.bestAo12Stat.textContent = sessionSummary.bestAo12 == null ? '-' : formatTime(sessionSummary.bestAo12);
  elements.latestStat.textContent = sessionSummary.latest == null ? '-' : formatTime(sessionSummary.latest);
  elements.statsDetailButton.disabled = totalCount === 0;
}

function renderSessionGoalProgress(successCount, totalCount, goal = sessionTargetCountForId(currentSessionId)) {
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
  if (!elements.algorithmTrainerDialog.open) return;
  if (algorithmTrainerEditorOpen()) {
    if (event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAlgorithmTrainerEditor();
    }
    return;
  }
  if (shouldIgnoreAlgorithmTrainerShortcut(event)) return;

  const actions = {
    Space: () => toggleAlgorithmTrainerTimer(),
    Enter: () => recordAlgorithmTrainerResult(true),
    Backspace: () => recordAlgorithmTrainerResult(false),
    KeyF: () => recordAlgorithmTrainerResult(false),
    KeyN: () => chooseNextAlgorithmTrainerCase(),
    KeyH: () => toggleAlgorithmTrainerAlgorithmHidden(),
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

function handleAlgorithmTrainerSearchInput() {
  closeAlgorithmTrainerEditor({ render: false });
  algorithmTrainerSearch = elements.algorithmTrainerSearch.value.trim();
  localStorage.setItem('trainTimer.algorithmTrainerSearch', algorithmTrainerSearch);
  renderAlgorithmTrainerDialog();
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
  renderAlgorithmTrainerOverview(allCases);
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
  const renderedCaseChanged = (current?.id || '') !== algorithmTrainerRenderedCaseId;
  if (!current) cancelAlgorithmTrainerTimer();
  const totals = algorithmTrainerTotals(allCases);
  const setLabel = algorithmTrainerSetLabels[algorithmTrainerSet] || algorithmTrainerSet.toUpperCase();
  const focusLabel = algorithmTrainerFocusLabels[algorithmTrainerFocus] || '全部';
  const groupLabel = algorithmTrainerGroup === 'all' ? '' : ` · ${algorithmTrainerGroup} ${allCases.length}/${allSetCases.length}`;
  const focusText = algorithmTrainerFocus === 'all' ? '' : ` · ${focusLabel} ${scopedCases.length}/${allCases.length}`;
  const searchText = searchActive ? ` · 搜索 ${visibleCases.length}/${focusBaseCases.length}` : '';
  elements.algorithmTrainerMeta.textContent = `${setLabel} · ${allSetCases.length} 条${groupLabel}${focusText}${searchText} · ${totals.success}/${totals.total} 掌握`;
  elements.algorithmTrainerName.textContent = current?.name || '-';
  elements.algorithmTrainerGroup.textContent = current ? algorithmTrainerCaseDetailLabel(current) : '-';
  renderAlgorithmTrainerAlgorithm(current);
  elements.algorithmTrainerHint.textContent = searchActive && visibleCases.length === 0
    ? `没有匹配“${algorithmTrainerSearchQuery()}”的公式`
    : (scopedCases.length === 0 && algorithmTrainerFocus !== 'all'
    ? (focusCanFallback ? `${focusLabel}范围暂无案例，随机会从全部中选择` : `${focusLabel}范围暂无案例`)
    : (current?.hint || '选择随机下一条开始练习'));
  const currentStats = algorithmTrainerStats[current?.id] || { success: 0, total: 0, streak: 0 };
  elements.algorithmTrainerScore.textContent = algorithmTrainerProgressText(currentStats);
  renderAlgorithmTrainerFeedback();
  const customSelected = current?.set === 'custom';
  const editorOpen = algorithmTrainerEditorOpen();
  elements.algorithmTrainerAddButton.disabled = editorOpen;
  elements.algorithmTrainerEditButton.disabled = editorOpen || !customSelected;
  elements.algorithmTrainerDeleteButton.disabled = editorOpen || !customSelected;
  elements.algorithmTrainerExportButton.disabled = algorithmTrainerCustomCases.length === 0;
  elements.algorithmTrainerNextButton.disabled = editorOpen;
  elements.algorithmTrainerPassButton.disabled = editorOpen || !current;
  elements.algorithmTrainerFailButton.disabled = editorOpen || !current;
  renderAlgorithmTrainerRevealButton(current);
  renderAlgorithmTrainerStarButton(current);
  renderAlgorithmTrainerSetup(current);
  renderAlgorithmTrainerTimer(currentStats);
  if (editorOpen) {
    elements.algorithmTrainerTimerButton.disabled = true;
    renderAlgorithmTrainerEditorValidation();
  }
  const listRows = searchActive
    ? visibleCases
    : (scopedCases.length > 0 || algorithmTrainerFocus === 'all'
    ? scopedCases
    : []);
  elements.algorithmTrainerList.replaceChildren(
    ...(listRows.length > 0 ? listRows.map(renderAlgorithmTrainerListItem) : [renderAlgorithmTrainerEmpty(searchActive ? '搜索' : focusLabel)]),
  );
  resetAlgorithmTrainerCardScroll(renderedCaseChanged, current);
}

function renderAlgorithmTrainerOverview(cases) {
  if (!elements.algorithmTrainerOverview) return;
  const overview = algorithmTrainerOverviewData(cases);
  const focusItems = [
    { focus: 'all', label: '全部', count: overview.total, title: '显示当前类型与分组的全部公式' },
    { focus: 'review', label: '复习', count: overview.review, title: '未练、薄弱、久未练或计时偏慢的公式' },
    { focus: 'new', label: '未练', count: overview.newCases, title: '还没有训练记录的公式' },
    { focus: 'weak', label: '薄弱', count: overview.weak, title: '准确率低或最近未连续掌握的公式' },
    { focus: 'starred', label: '收藏', count: overview.starred, title: '收藏专项池' },
  ];
  const timedText = Number.isFinite(overview.timedAverageMs)
    ? `均时 ${formatTime(overview.timedAverageMs)}`
    : '均时 -';
  elements.algorithmTrainerOverview.replaceChildren(
    ...focusItems.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.algorithmFocus = item.focus;
      button.className = item.focus === algorithmTrainerFocus ? 'active' : '';
      button.title = item.title;
      button.innerHTML = `
        <span>${escapeHtml(item.label)}</span>
        <strong>${item.count}</strong>
      `;
      return button;
    }),
    algorithmTrainerOverviewMetric('掌握', `${overview.mastered}/${overview.total}`, '准确率不低于 85% 且最近有连续掌握记录的公式'),
    algorithmTrainerOverviewMetric('计时', timedText, `当前范围 ${overview.timedCases} 条公式有计时记录`),
  );
}

function algorithmTrainerOverviewMetric(label, value, title) {
  const node = document.createElement('em');
  node.title = title;
  node.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  `;
  return node;
}

function algorithmTrainerOverviewData(cases) {
  const timedAverages = [];
  let review = 0;
  let newCases = 0;
  let weak = 0;
  let starred = 0;
  let mastered = 0;
  for (const item of cases) {
    const stats = algorithmTrainerStats[item.id] || {};
    const total = Math.max(0, Number(stats.total) || 0);
    const success = Math.max(0, Number(stats.success) || 0);
    const accuracy = total > 0 ? success / total : 0;
    if (algorithmTrainerCaseNeedsReviewQueue(item, cases)) review += 1;
    if (total === 0) newCases += 1;
    if (algorithmTrainerCaseNeedsReview(item)) weak += 1;
    if (algorithmTrainerCaseStarred(item.id)) starred += 1;
    if (total > 0 && accuracy >= 0.85 && (stats.streak || 0) > 0) mastered += 1;
    const timedCount = Math.max(0, Number(stats.timedCount) || 0);
    const timedTotalMs = Number(stats.timedTotalMs);
    if (timedCount > 0 && Number.isFinite(timedTotalMs)) timedAverages.push(timedTotalMs / timedCount);
  }
  const timedAverageMs = timedAverages.length > 0
    ? timedAverages.reduce((sum, value) => sum + value, 0) / timedAverages.length
    : null;
  return {
    total: cases.length,
    review,
    newCases,
    weak,
    starred,
    mastered,
    timedCases: timedAverages.length,
    timedAverageMs,
  };
}

function handleAlgorithmTrainerOverviewClick(event) {
  const button = event.target instanceof HTMLElement ? event.target.closest('[data-algorithm-focus]') : null;
  if (!(button instanceof HTMLElement)) return;
  const focus = button.dataset.algorithmFocus || 'all';
  if (!Object.hasOwn(algorithmTrainerFocusLabels, focus)) return;
  cancelAlgorithmTrainerTimer();
  algorithmTrainerFocus = focus;
  elements.algorithmTrainerFocus.value = focus;
  localStorage.setItem('trainTimer.algorithmTrainerFocus', algorithmTrainerFocus);
  chooseNextAlgorithmTrainerCase();
}

function renderAlgorithmTrainerListItem(item, index = 0) {
  const stats = algorithmTrainerStats[item.id] || { success: 0, total: 0, streak: 0 };
  const row = document.createElement('button');
  row.type = 'button';
  row.className = [
    'algorithm-trainer-item',
    item.id === algorithmTrainerCurrentId ? 'active' : '',
    algorithmTrainerCaseStarred(item.id) ? 'starred' : '',
  ].filter(Boolean).join(' ');
  const reviewReason = algorithmTrainerFocus === 'review' ? algorithmTrainerReviewReason(item) : '';
  const algorithmTitle = algorithmTrainerAlgorithmHidden ? '' : item.algorithm;
  row.title = [algorithmTitle, reviewReason].filter(Boolean).join(' · ');
  row.style.setProperty('--item-index', String(Math.min(index, 12)));
  row.innerHTML = `
    <strong>${escapeHtml(item.name)}</strong>
    <span>${escapeHtml(algorithmTrainerCaseDetailLabel(item))}</span>
    <em>${escapeHtml(algorithmTrainerProgressText(stats))}</em>
  `;
  row.addEventListener('click', () => {
    cancelAlgorithmTrainerTimer();
    closeAlgorithmTrainerEditor({ render: false });
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

function resetAlgorithmTrainerCardScroll(renderedCaseChanged, current) {
  algorithmTrainerRenderedCaseId = current?.id || '';
  if (!renderedCaseChanged || !elements.algorithmTrainerCard) return;
  const resetScroll = () => {
    elements.algorithmTrainerCard.scrollTop = 0;
  };
  resetScroll();
  pulseAlgorithmTrainerCard();
  requestAnimationFrame(resetScroll);
}

function pulseAlgorithmTrainerCard() {
  const card = elements.algorithmTrainerCard;
  if (!card) return;
  card.classList.remove('case-enter');
  void card.offsetWidth;
  card.classList.add('case-enter');
}

function renderAlgorithmTrainerFeedback() {
  const feedback = algorithmTrainerFeedback;
  elements.algorithmTrainerFeedback.hidden = !feedback;
  elements.algorithmTrainerFeedback.className = `algorithm-trainer-feedback ${feedback?.type || ''}`.trim();
  elements.algorithmTrainerFeedback.textContent = feedback?.text || '';
}

function setAlgorithmTrainerFeedback(item, success, stats) {
  window.clearTimeout(algorithmTrainerFeedbackTimer);
  const progress = algorithmTrainerProgressText(stats);
  algorithmTrainerFeedback = {
    type: success ? 'success' : 'miss',
    text: success
      ? `已掌握 ${item.name} · ${progress}`
      : `未掌握 ${item.name} · 已加入复习`,
  };
  algorithmTrainerFeedbackTimer = window.setTimeout(() => {
    algorithmTrainerFeedback = null;
    algorithmTrainerFeedbackTimer = 0;
    renderAlgorithmTrainerFeedback();
  }, 1800);
}

function clearAlgorithmTrainerFeedback() {
  window.clearTimeout(algorithmTrainerFeedbackTimer);
  algorithmTrainerFeedback = null;
  algorithmTrainerFeedbackTimer = 0;
  renderAlgorithmTrainerFeedback();
}

function renderAlgorithmTrainerAlgorithm(current) {
  const hidden = Boolean(current && algorithmTrainerAlgorithmHidden);
  elements.algorithmTrainerAlg.classList.toggle('hidden', hidden);
  elements.algorithmTrainerAlg.textContent = current
    ? (hidden ? '公式已隐藏' : current.algorithm)
    : '-';
  elements.algorithmTrainerAlg.title = current
    ? (hidden ? '按 H 或点击显示公式' : current.algorithm)
    : '';
}

function renderAlgorithmTrainerRevealButton(current) {
  const hidden = Boolean(current && algorithmTrainerAlgorithmHidden);
  elements.algorithmTrainerRevealButton.disabled = !current;
  elements.algorithmTrainerRevealButton.textContent = hidden ? '显示公式' : '隐藏公式';
  elements.algorithmTrainerRevealButton.classList.toggle('active', hidden);
  elements.algorithmTrainerRevealButton.setAttribute('aria-pressed', hidden ? 'true' : 'false');
  elements.algorithmTrainerRevealButton.title = current
    ? (hidden ? 'H 显示当前公式' : 'H 隐藏当前公式，进行记忆训练')
    : '没有可隐藏的公式';
}

function toggleAlgorithmTrainerAlgorithmHidden() {
  if (!algorithmTrainerCurrentCase()) return;
  algorithmTrainerAlgorithmHidden = !algorithmTrainerAlgorithmHidden;
  localStorage.setItem('trainTimer.algorithmTrainerAlgorithmHidden', algorithmTrainerAlgorithmHidden ? '1' : '0');
  renderAlgorithmTrainerDialog();
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
  setAlgorithmTrainerFeedback(current, success, stats);
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
  renderAlgorithmTrainerPreview(setup, supported);
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

function renderAlgorithmTrainerPreview(setup, supported) {
  if (!elements.algorithmTrainerPreview) return;
  elements.algorithmTrainerPreview.replaceChildren();
  elements.algorithmTrainerPreview.className = 'algorithm-trainer-preview empty';

  if (!setup) {
    elements.algorithmTrainerPreview.textContent = '暂无状态预览';
    elements.algorithmTrainerPreview.title = '当前公式无法生成训练打乱';
    return;
  }

  if (!supported) {
    elements.algorithmTrainerPreview.textContent = '需要手动执行训练打乱';
    elements.algorithmTrainerPreview.title = '当前公式包含暂不支持直接预览的记号';
    return;
  }

  try {
    const faces = cubeStateFromScramble(setup);
    renderCubeFacesNet(elements.algorithmTrainerPreview, faces, 'algorithm-trainer-preview');
    elements.algorithmTrainerPreview.title = '当前公式的训练起手状态';
  } catch {
    elements.algorithmTrainerPreview.className = 'algorithm-trainer-preview empty';
    elements.algorithmTrainerPreview.textContent = '无法生成状态预览';
    elements.algorithmTrainerPreview.title = '训练打乱解析失败';
  }
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
  clearInspectionEntryAnimation();
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
  renderAlgorithmTrainerTimerRunningShell();
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
  incrementPerformanceCounter('algorithmTrainerTimerTicks');
  const elapsedMs = Math.max(0, performance.now() - algorithmTrainerTimerStartedAt);
  setElementText(elements.algorithmTrainerTimerDisplay, formatTime(elapsedMs));
  scheduleAlgorithmTrainerTimerTick();
}

function renderAlgorithmTrainerTimerRunningShell() {
  setElementText(elements.algorithmTrainerTimerButton, '完成记录');
  elements.algorithmTrainerTimerButton.classList.add('running');
  elements.algorithmTrainerTimerButton.disabled = false;
  elements.algorithmTrainerTimerButton.title = 'Space 完成训练计时';
}

function scheduleAlgorithmTrainerTimerTick() {
  clearAlgorithmTrainerTimerTick();
  if (!pageVisible()) return;
  algorithmTrainerTimerFrame = window.setTimeout(tickAlgorithmTrainerTimer, Math.max(0, algorithmTrainerTimerFrameMs));
}

function clearAlgorithmTrainerTimerTick() {
  if (!algorithmTrainerTimerFrame) return;
  window.clearTimeout(algorithmTrainerTimerFrame);
  algorithmTrainerTimerFrame = 0;
}

function cancelAlgorithmTrainerTimer(options = {}) {
  clearAlgorithmTrainerTimerTick();
  algorithmTrainerTimerStartedAt = 0;
  if (!options.keepDisplay && elements.algorithmTrainerTimerButton) {
    setElementText(elements.algorithmTrainerTimerButton, '开始计时');
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
    setElementText(elements.algorithmTrainerTimerDisplay, Number.isFinite(lastMs) ? formatTime(lastMs) : '0.000');
    setElementText(elements.algorithmTrainerTimerButton, '开始计时');
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
  closeAlgorithmTrainerEditor({ render: false });
  algorithmTrainerStats = {};
  saveAlgorithmTrainerStats();
  renderAlgorithmTrainerDialog();
}

function addAlgorithmTrainerCustomCase() {
  openAlgorithmTrainerEditor('add');
}

function editAlgorithmTrainerCustomCase() {
  openAlgorithmTrainerEditor('edit');
}

function algorithmTrainerEditorOpen() {
  return Boolean(algorithmTrainerEditorMode);
}

function openAlgorithmTrainerEditor(mode) {
  const editing = mode === 'edit';
  const current = algorithmTrainerCurrentCase();
  if (editing && (!current || current.set !== 'custom')) return;
  cancelAlgorithmTrainerTimer();
  clearAlgorithmTrainerFeedback();
  algorithmTrainerEditorMode = editing ? 'edit' : 'add';
  algorithmTrainerEditorId = editing ? current.id : '';
  elements.algorithmTrainerEditor.hidden = false;
  elements.algorithmTrainerEditorTitle.textContent = editing ? '编辑自定义公式' : '添加自定义公式';
  elements.algorithmTrainerEditorName.value = editing ? current.name || '' : '';
  elements.algorithmTrainerEditorGroup.value = editing ? current.group || 'Custom' : 'Custom';
  elements.algorithmTrainerEditorAlgorithm.value = editing ? current.algorithm || '' : '';
  elements.algorithmTrainerEditorHint.value = editing ? current.hint || '' : '';
  elements.algorithmTrainerEditorError.textContent = '';
  renderAlgorithmTrainerDialog();
  renderAlgorithmTrainerEditorValidation();
  requestAnimationFrame(() => {
    const target = editing ? elements.algorithmTrainerEditorAlgorithm : elements.algorithmTrainerEditorName;
    target.focus();
    target.select();
  });
}

function closeAlgorithmTrainerEditor(options = {}) {
  const wasOpen = algorithmTrainerEditorOpen();
  algorithmTrainerEditorMode = '';
  algorithmTrainerEditorId = '';
  elements.algorithmTrainerEditor.hidden = true;
  elements.algorithmTrainerEditorError.textContent = '';
  elements.algorithmTrainerEditorSaveButton.disabled = true;
  elements.algorithmTrainerEditorMeta.textContent = '填写名称和公式';
  if (wasOpen && options.render !== false) renderAlgorithmTrainerDialog();
}

function handleAlgorithmTrainerEditorKeyDown(event) {
  if (event.code === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeAlgorithmTrainerEditor();
    return;
  }

  if (event.code !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  event.stopPropagation();
  saveAlgorithmTrainerEditor();
}

function renderAlgorithmTrainerEditorValidation() {
  if (!algorithmTrainerEditorOpen()) return;
  const rawAlgorithm = elements.algorithmTrainerEditorAlgorithm.value;
  const name = elements.algorithmTrainerEditorName.value.trim();
  let cleanAlgorithm = '';
  let errorText = '';
  try {
    cleanAlgorithm = cleanAlgorithmTrainerAlgorithm(rawAlgorithm);
  } catch (error) {
    errorText = error.message || String(error);
  }

  const stepText = cleanAlgorithm ? `${algorithmTrainerAlgorithmStepCount(cleanAlgorithm)} 步` : '填写名称和公式';
  elements.algorithmTrainerEditorMeta.textContent = cleanAlgorithm
    ? `${stepText} · 保存前已验证记号`
    : stepText;
  elements.algorithmTrainerEditorError.textContent = errorText;
  elements.algorithmTrainerEditorSaveButton.disabled = !name || !cleanAlgorithm || Boolean(errorText);
}

function saveAlgorithmTrainerEditor() {
  if (!algorithmTrainerEditorOpen()) return;
  const item = algorithmTrainerEditorValidatedItem();
  if (!item) return;

  const duplicate = algorithmTrainerCustomCases.some((entry) => (
    entry.id !== item.id && algorithmTrainerCustomCaseKey(entry) === algorithmTrainerCustomCaseKey(item)
  ));
  if (duplicate) {
    setAlgorithmTrainerEditorError('已存在相同名称、分组和公式的自定义公式。');
    return;
  }

  cancelAlgorithmTrainerTimer();
  if (algorithmTrainerEditorMode === 'edit') {
    algorithmTrainerCustomCases = algorithmTrainerCustomCases.map((entry) => (
      entry.id === item.id ? item : entry
    ));
  } else {
    algorithmTrainerCustomCases = [...algorithmTrainerCustomCases, item];
  }
  saveAlgorithmTrainerCustomCases();
  algorithmTrainerSet = 'custom';
  algorithmTrainerFocus = 'all';
  algorithmTrainerGroup = 'all';
  algorithmTrainerSearch = '';
  algorithmTrainerCurrentId = item.id;
  elements.algorithmTrainerSearch.value = '';
  localStorage.setItem('trainTimer.algorithmTrainerSet', algorithmTrainerSet);
  localStorage.setItem('trainTimer.algorithmTrainerFocus', algorithmTrainerFocus);
  localStorage.setItem('trainTimer.algorithmTrainerGroup', algorithmTrainerGroup);
  localStorage.setItem('trainTimer.algorithmTrainerSearch', algorithmTrainerSearch);
  localStorage.setItem('trainTimer.algorithmTrainerCurrentId', algorithmTrainerCurrentId);
  closeAlgorithmTrainerEditor({ render: false });
  renderAlgorithmTrainerDialog();
}

function algorithmTrainerEditorValidatedItem() {
  const editing = algorithmTrainerEditorMode === 'edit';
  const existing = editing
    ? algorithmTrainerCustomCases.find((item) => item.id === algorithmTrainerEditorId)
    : null;
  if (editing && !existing) {
    setAlgorithmTrainerEditorError('当前自定义公式不存在，无法保存编辑。');
    return null;
  }

  const name = elements.algorithmTrainerEditorName.value.trim();
  if (!name) {
    setAlgorithmTrainerEditorError('请填写公式名称。');
    elements.algorithmTrainerEditorName.focus();
    return null;
  }

  let cleanAlgorithm = '';
  try {
    cleanAlgorithm = cleanAlgorithmTrainerAlgorithm(elements.algorithmTrainerEditorAlgorithm.value);
  } catch (error) {
    setAlgorithmTrainerEditorError(`公式无效：${error.message || String(error)}`);
    elements.algorithmTrainerEditorAlgorithm.focus();
    return null;
  }
  if (!cleanAlgorithm) {
    setAlgorithmTrainerEditorError('请填写公式。');
    elements.algorithmTrainerEditorAlgorithm.focus();
    return null;
  }

  return {
    ...(existing || {}),
    id: existing?.id || createAlgorithmTrainerCustomCaseId(),
    set: 'custom',
    name: name.slice(0, 80),
    group: (elements.algorithmTrainerEditorGroup.value.trim() || 'Custom').slice(0, 80),
    algorithm: cleanAlgorithm.slice(0, 220),
    hint: elements.algorithmTrainerEditorHint.value.trim().slice(0, 160),
  };
}

function setAlgorithmTrainerEditorError(message) {
  elements.algorithmTrainerEditorError.textContent = message;
  elements.algorithmTrainerEditorSaveButton.disabled = true;
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
      alert('没有可导入的自定义公式。支持 JSON 数组、包含 cases 数组的对象，或每行一条的 TXT/CSV 公式列表。');
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
    closeAlgorithmTrainerEditor({ render: false });
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
  closeAlgorithmTrainerEditor({ render: false });
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
  const input = String(text || '').trim();
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    const rawCases = Array.isArray(parsed) ? parsed : parsed?.cases;
    if (Array.isArray(rawCases)) {
      return rawCases
        .map(normalizeAlgorithmTrainerCustomCase)
        .filter(Boolean)
        .map((item) => ({ ...item, id: createAlgorithmTrainerCustomCaseId() }));
    }
  } catch {
    // Fall through to plain-text import.
  }
  return parseAlgorithmTrainerPlainTextImport(input);
}

function parseAlgorithmTrainerPlainTextImport(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line, index) => normalizeAlgorithmTrainerPlainTextLine(line, index))
    .filter(Boolean)
    .map((item) => ({ ...item, id: createAlgorithmTrainerCustomCaseId() }));
}

function normalizeAlgorithmTrainerPlainTextLine(line, index) {
  const cleaned = String(line || '')
    .trim()
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)、]\s+/, '');
  if (!cleaned || cleaned.startsWith('#') || cleaned.startsWith('//')) return null;

  const splitPattern = cleaned.includes('|') ? /\|/ : (cleaned.includes('\t') ? /\t/ : null);
  if (splitPattern) {
    const parts = cleaned.split(splitPattern).map((part) => part.trim()).filter(Boolean);
    return normalizeAlgorithmTrainerPlainTextParts(parts, index);
  }

  const colonMatch = cleaned.match(/^(.+?)\s*[:：]\s*(.+)$/);
  if (colonMatch) {
    const labelParts = colonMatch[1].split(/\s*[/>]\s*/).map((part) => part.trim()).filter(Boolean);
    const name = labelParts.pop() || `Custom ${index + 1}`;
    const group = labelParts.pop() || 'Custom';
    return normalizeAlgorithmTrainerCustomCase({
      name,
      group,
      algorithm: colonMatch[2],
    }, index);
  }

  if (/[,\uFF0C;]/.test(cleaned)) {
    const parts = splitAlgorithmTrainerDelimitedLine(cleaned).map((part) => part.trim()).filter(Boolean);
    const item = normalizeAlgorithmTrainerPlainTextParts(parts, index);
    if (item) return item;
  }

  if (!algorithmTrainerAlgorithmIsValid(cleaned)) return null;
  return normalizeAlgorithmTrainerCustomCase({
    name: `Custom ${index + 1}`,
    group: 'Custom',
    algorithm: cleaned,
  }, index);
}

function normalizeAlgorithmTrainerPlainTextParts(parts, index) {
  if (!Array.isArray(parts) || parts.length < 2) return null;
  const algIndex = parts.findIndex(looksLikeAlgorithmText);
  if (algIndex < 0) return null;
  const algorithm = parts[algIndex];
  const before = parts.slice(0, algIndex);
  const after = parts.slice(algIndex + 1);
  let group = 'Custom';
  let name = `Custom ${index + 1}`;
  if (before.length >= 2) {
    group = before[0];
    name = before.slice(1).join(' / ');
  } else if (before.length === 1) {
    name = before[0];
    if (after.length > 0 && !looksLikeAlgorithmText(after[0])) group = after.shift();
  }
  const hint = after.join(' · ');
  return normalizeAlgorithmTrainerCustomCase({
    name,
    group,
    algorithm,
    hint,
  }, index);
}

function splitAlgorithmTrainerDelimitedLine(line) {
  const parts = [];
  let current = '';
  let quoted = false;
  for (const char of String(line || '')) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && (char === ',' || char === '\uFF0C' || char === ';')) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function looksLikeAlgorithmText(value) {
  return algorithmTrainerAlgorithmIsValid(value);
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

function algorithmTrainerSetExists(setId) {
  return setId === 'custom' || algorithmTrainerBuiltInCasesForSet(setId).length > 0;
}

function algorithmTrainerCasesForSet() {
  if (algorithmTrainerSet === 'custom') return algorithmTrainerCustomCases;
  return algorithmTrainerBuiltInCasesForSet(algorithmTrainerSet);
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
    algorithmTrainerCaseSetShortLabel(item),
    item.algorithm,
    item.hint,
  ].filter(Boolean).join(' ').toLowerCase();
}

function algorithmTrainerCaseGroupLabel(item) {
  const group = item?.group || '-';
  if (!algorithmTrainerSetMembers[algorithmTrainerSet]) return group;
  const setLabel = algorithmTrainerCaseSetShortLabel(item);
  return setLabel ? `${setLabel} · ${group}` : group;
}

function algorithmTrainerCaseDetailLabel(item) {
  const stepCount = algorithmTrainerAlgorithmStepCount(item?.algorithm || '');
  return `${algorithmTrainerCaseGroupLabel(item)} · ${stepCount} 步`;
}

function algorithmTrainerCaseSetShortLabel(item) {
  if (!item?.set) return '';
  if (item.set === 'f2lFull') return 'F2L';
  if (item.set === 'oll') return 'OLL';
  if (item.set === 'oll2') return '2L OLL';
  if (item.set === 'pll') return 'PLL';
  if (item.set === 'pll2') return '2L PLL';
  return algorithmTrainerSetLabels[item.set] || '';
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
  return cases.find((item) => item.id === algorithmTrainerCurrentId && algorithmTrainerCaseBelongsToSet(item, algorithmTrainerSet)) || null;
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
  let algorithm = '';
  try {
    algorithm = cleanAlgorithmTrainerAlgorithm(item.algorithm || item.alg || item.moves || '');
  } catch {
    return null;
  }
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
  const statsSolves = chronologicalSolves(statsData.solves);
  const summary = summarizeSolves(statsSolves);
  elements.statsDialogMeta.textContent = `${statsData.label} · ${summary.count} 条成绩`;
  elements.copyStatsSummaryButton.disabled = summary.count === 0;
  const statsMetrics = statsData.scope === 'session'
    ? cachedSessionMetrics(currentSessionId, statsSolves)
    : null;
  renderStatsTrendChart(statsSolves, statsData.scope === 'session' ? '最近' : statsData.shortLabel, {
    metricsById: statsMetrics?.byId,
  });
  renderStatsDistributionChart(statsSolves, statsData.scope === 'session' ? '当前会话' : statsData.shortLabel);
  renderStatsInsights(statsSolves, summary);
  renderStatsOpStats(statsSolves);
  renderStatsRecords(statsSolves, { selected: statsData.scope !== 'session' });
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

function renderStatsOpStats(sessionSolves) {
  if (!elements.statsOpPanel || !elements.statsOpList) return;
  const summary = summarizeOpStats(sessionSolves);
  const formulaLibrary = buildOpFormulaLibrary(sessionSolves);
  const formulaRows = opFormulaCaseRows(formulaLibrary, summary);
  const selectedFormulaCase = selectedOpFormulaCase(formulaRows);
  elements.statsOpPanel.hidden = false;
  elements.statsOpMeta.textContent = summary.totalEvents > 0
    ? `OP ${summary.totalEvents} 次 · OLL ${summary.byKind.oll} · PLL ${summary.byKind.pll} · 公式 ${formulaLibrary.totalFormulaCount} 条 · 用户 ${formulaLibrary.userFormulaCount}`
    : `PDF 公式库 ${formulaLibrary.pdfFormulaCount} 条 · 等待蓝牙复原数据`;
  if (elements.statsOpLibraryMeta) {
    elements.statsOpLibraryMeta.textContent = `状态 ${formulaRows.length} · PDF ${formulaLibrary.pdfFormulaCount} · 用户补充 ${formulaLibrary.userFormulaCount}`;
  }

  if (summary.cases.length === 0) {
    elements.statsOpList.replaceChildren(renderStatsOpEmpty('已预填 PDF OLL/PLL 公式；完成蓝牙复原后会补充用户已验证公式。'));
  } else {
    elements.statsOpList.replaceChildren(
      ...summary.cases.map((item) => renderStatsOpCase(item)),
    );
  }

  if (elements.statsOpFormulaList) {
    elements.statsOpFormulaList.replaceChildren(
      ...formulaRows.map((item) => renderStatsOpFormulaCase(item, selectedFormulaCase?.key || '')),
    );
    scrollActiveStatsOpFormulaCaseIntoView(elements.statsOpFormulaList);
  }
  if (elements.statsOpFormulaDetail) {
    elements.statsOpFormulaDetail.replaceChildren(
      selectedFormulaCase ? renderStatsOpFormulaDetail(selectedFormulaCase, sessionSolves) : renderStatsOpEmpty('暂无公式库数据'),
    );
  }
}

function renderStatsOpCase(item) {
  const node = document.createElement('div');
  node.className = 'stats-record-item stats-op-item';
  const kind = String(item.kind || '').toUpperCase();
  const label = item.pdfLabel ? `${item.name || item.caseId} · ${item.pdfLabel}` : (item.name || item.caseId);
  const averageDuration = timeOrDash(item.averageDurationMs);
  const averageObservation = timeOrDash(item.averageObservationMs);
  const averageTps = Number.isFinite(item.averageTps) ? `${item.averageTps.toFixed(2)} TPS` : 'TPS -';
  const averageTurns = Number.isFinite(item.averageTurns) ? `${item.averageTurns.toFixed(1)} 步` : '步数 -';
  const acceptedFormula = item.mostUsedAcceptedFormula?.algorithm || '';
  const observedFormula = item.mostUsedFormula?.algorithm || '';
  const formula = acceptedFormula || observedFormula;
  const formulaLabel = acceptedFormula
    ? `常用 ${acceptedFormula}`
    : (observedFormula ? `未入库常见 ${observedFormula}` : '暂无稳定公式');
  const diagram = opCaseSvgMarkup(item.kind, item.caseId, {
    className: 'op-case-diagram op-case-diagram-thumb',
    idPrefix: `stats-op-item-${item.kind}-${item.caseId}`,
    title: opCaseVisualTitle(kind, label),
  });
  if (diagram) node.classList.add('has-op-diagram');
  node.innerHTML = `
    ${diagram ? `<div class="stats-op-item-diagram">${diagram}</div>` : ''}
    <div class="stats-op-item-body">
      <span>${escapeHtml(kind)} · ${escapeHtml(label)}</span>
      <strong>${escapeHtml(averageDuration)} · ${escapeHtml(averageTps)}</strong>
      <em>${escapeHtml(item.count)} 次 · 观察 ${escapeHtml(averageObservation)} · ${escapeHtml(averageTurns)}</em>
      <em>${escapeHtml(formula ? formulaLabel : '暂无稳定公式')}</em>
    </div>
  `;
  return node;
}

function renderStatsOpEmpty(text) {
  const node = document.createElement('div');
  node.className = 'stats-record-empty';
  node.textContent = text;
  return node;
}

function opFormulaCaseRows(formulaLibrary, summary) {
  const statsByCase = new Map((summary.cases || []).map((item) => [`${item.kind}:${item.caseId}`, item]));
  return (formulaLibrary.cases || []).map((item) => {
    const key = `${item.kind}:${item.caseId}`;
    const stats = statsByCase.get(key) || null;
    return {
      ...item,
      key,
      name: opCaseDisplayName(item.kind, item.caseId),
      stats,
      formulas: Array.isArray(item.formulas) ? item.formulas : [],
    };
  });
}

function selectedOpFormulaCase(rows) {
  const selected = rows.find((item) => item.key === selectedOpFormulaCaseKey)
    || rows.find((item) => Number(item.stats?.count) > 0)
    || rows[0]
    || null;
  selectedOpFormulaCaseKey = selected?.key || '';
  if (selectedOpFormulaCaseKey) localStorage.setItem('trainTimer.selectedOpFormulaCaseKey', selectedOpFormulaCaseKey);
  return selected;
}

function renderStatsOpFormulaCase(item, activeKey) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = item.key === activeKey ? 'stats-op-formula-case active' : 'stats-op-formula-case';
  button.dataset.opFormulaCase = item.key;
  const kind = String(item.kind || '').toUpperCase();
  const label = item.pdfLabel ? `${item.name} · ${item.pdfLabel}` : item.name;
  const count = Number(item.stats?.count) || 0;
  const diagram = opCaseSvgMarkup(item.kind, item.caseId, {
    className: 'op-case-diagram op-case-diagram-thumb',
    idPrefix: `stats-op-formula-case-${item.key}`,
    title: opCaseVisualTitle(kind, label),
  });
  if (diagram) button.classList.add('has-op-diagram');
  button.innerHTML = `
    ${diagram ? `<div class="stats-op-formula-case-diagram">${diagram}</div>` : ''}
    <div class="stats-op-formula-case-body">
      <span>${escapeHtml(kind)}</span>
      <strong>${escapeHtml(label)}</strong>
      <em>${escapeHtml(item.pdfFormulaCount)} PDF · ${escapeHtml(item.userFormulaCount)} 用户 · ${escapeHtml(count)} 次</em>
    </div>
  `;
  return button;
}

function renderStatsOpFormulaDetail(item, sessionSolves = []) {
  const node = document.createElement('div');
  node.className = 'stats-op-formula-detail-inner';
  const stats = item.stats || {};
  const formulaNodes = item.formulas.map((formula) => renderStatsOpFormulaEntry(formula));
  const sampleNodes = opCaseSamplesForSolves(sessionSolves, item.kind, item.caseId)
    .slice(0, 12)
    .map((sample) => renderStatsOpSampleEntry(sample));
  const kind = String(item.kind || '').toUpperCase();
  const label = item.pdfLabel ? `${item.name} · ${item.pdfLabel}` : item.name;
  const diagram = opCaseSvgMarkup(item.kind, item.caseId, {
    className: 'op-case-diagram op-case-diagram-large',
    idPrefix: `stats-op-formula-detail-${item.key}`,
    title: opCaseVisualTitle(kind, label),
  });
  node.innerHTML = `
    <div class="stats-op-formula-hero">
      ${diagram ? `<div class="stats-op-formula-hero-diagram">${diagram}</div>` : ''}
      <div class="stats-op-formula-title">
        <span>${escapeHtml(kind)}</span>
        <strong>${escapeHtml(label)}</strong>
        <em>${escapeHtml(item.caseId)}</em>
      </div>
    </div>
    <div class="stats-op-formula-metrics">
      <span>次数 <strong>${escapeHtml(Number(stats.count) || 0)}</strong></span>
      <span>平均 <strong>${escapeHtml(timeOrDash(stats.averageDurationMs))}</strong></span>
      <span>观察 <strong>${escapeHtml(timeOrDash(stats.averageObservationMs))}</strong></span>
      <span>TPS <strong>${escapeHtml(Number.isFinite(stats.averageTps) ? stats.averageTps.toFixed(2) : '-')}</strong></span>
    </div>
  `;
  const list = document.createElement('div');
  list.className = 'stats-op-formula-detail-list';
  list.replaceChildren(...formulaNodes);
  node.append(list);
  const sampleSection = document.createElement('div');
  sampleSection.className = 'stats-op-samples';
  sampleSection.innerHTML = `
    <div class="stats-op-samples-head">
      <strong>最近复盘样本</strong>
      <span>${escapeHtml(sampleNodes.length)} 条</span>
    </div>
  `;
  const sampleList = document.createElement('div');
  sampleList.className = 'stats-op-sample-list';
  sampleList.replaceChildren(
    ...(sampleNodes.length > 0 ? sampleNodes : [renderStatsOpEmpty('这个统计范围内还没有该状态的复盘样本')]),
  );
  sampleSection.append(sampleList);
  node.append(sampleSection);
  return node;
}

function renderStatsOpFormulaEntry(formula) {
  const node = document.createElement('div');
  node.className = `stats-op-formula-entry ${formula.source === 'pdf' ? 'pdf' : 'user'}`;
  const source = formula.source === 'pdf' ? `PDF p.${formula.page || '-'}` : '用户验证';
  const usage = Number(formula.userOccurrences) > 0 ? ` · 命中 ${formula.userOccurrences}` : '';
  const metrics = [
    Number.isFinite(formula.averageDurationMs) ? `平均 ${formatTime(formula.averageDurationMs)}` : '',
    Number.isFinite(formula.averageObservationMs) ? `观察 ${formatTime(formula.averageObservationMs)}` : '',
    Number.isFinite(formula.averageTps) ? `${formula.averageTps.toFixed(2)} TPS` : '',
  ].filter(Boolean).join(' · ');
  node.innerHTML = `
    <span>${escapeHtml(source)}${escapeHtml(usage)} · ${escapeHtml(formula.moveCount)} 步</span>
    <strong>${escapeHtml(formula.algorithm)}</strong>
    <em>${escapeHtml(metrics || '暂无用户计时样本')}</em>
  `;
  return node;
}

function renderStatsOpSampleEntry(sample) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `stats-op-sample-entry ${sample.formulaAccepted ? 'accepted' : 'rejected'}`;
  button.dataset.detailId = sample.solveId || '';
  button.dataset.opKind = sample.kind || '';
  button.dataset.opCase = sample.caseId || '';
  button.dataset.opStartStep = Number.isFinite(sample.startStep) ? String(sample.startStep) : '';
  button.dataset.opEndStep = Number.isFinite(sample.endStep) ? String(sample.endStep) : '';
  const solveTime = Number.isFinite(sample.solveDurationMs) ? formatTime(sample.solveDurationMs) : '-';
  const dateText = sample.createdAt ? new Date(sample.createdAt).toLocaleString() : '-';
  const durationText = timeOrDash(sample.durationMs);
  const observationText = timeOrDash(sample.observationMs);
  const tpsText = Number.isFinite(sample.tps) ? `${sample.tps.toFixed(2)} TPS` : 'TPS -';
  const rangeText = Number.isFinite(sample.startStep) && Number.isFinite(sample.endStep)
    ? (sample.startStep === sample.endStep ? `第 ${sample.startStep} 步` : `第 ${sample.startStep}-${sample.endStep} 步`)
    : '步骤 -';
  const formulaStatus = sample.formulaAccepted ? '已入库' : opFormulaReasonText(sample.formulaReason);
  button.innerHTML = `
    <span>${escapeHtml(dateText)} · 成绩 ${escapeHtml(solveTime)}</span>
    <strong>${escapeHtml(durationText)} · 观察 ${escapeHtml(observationText)} · ${escapeHtml(tpsText)}</strong>
    <em>${escapeHtml(rangeText)} · ${escapeHtml(formulaStatus || '未入库')}</em>
    <small>${escapeHtml(sample.algorithm || '无公式步骤')}</small>
  `;
  return button;
}

function scrollActiveStatsOpFormulaCaseIntoView(container) {
  const active = container.querySelector('.stats-op-formula-case.active');
  if (!active) return;
  const containerRect = container.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const top = activeRect.top - containerRect.top + container.scrollTop;
  const bottom = top + activeRect.height;
  const visibleTop = container.scrollTop;
  const visibleBottom = visibleTop + container.clientHeight;
  if (top < visibleTop || bottom > visibleBottom) {
    container.scrollTop = Math.max(0, top - 6);
  }
}

function handleStatsOpFormulaCaseClick(event) {
  const button = event.target.closest('[data-op-formula-case]');
  if (!button) return;
  selectedOpFormulaCaseKey = button.dataset.opFormulaCase || '';
  if (selectedOpFormulaCaseKey) localStorage.setItem('trainTimer.selectedOpFormulaCaseKey', selectedOpFormulaCaseKey);
  renderStatsDialog();
}

function handleStatsOpSampleClick(event) {
  const button = event.target.closest('[data-detail-id][data-op-kind][data-op-case]');
  if (!button?.dataset.detailId) return;
  const solve = solves.find((item) => item.id === button.dataset.detailId);
  if (!solve) return;
  if (elements.statsDialog?.open) elements.statsDialog.close();
  openSolveDialog(solve.id);
  const opEvent = opDisplayEventsForSolve(solve).find((event) => (
    event.kind === button.dataset.opKind
    && event.caseId === button.dataset.opCase
    && String(event.startStep ?? '') === (button.dataset.opStartStep || '')
    && String(event.endStep ?? '') === (button.dataset.opEndStep || '')
  ));
  if (opEvent) jumpToSolveOpEvent(opEvent);
}

function opCaseDisplayName(kind, caseId) {
  const item = algorithmTrainerCases.find((candidate) => candidate.set === kind && candidate.id === caseId);
  return item?.name || caseId;
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
  return chronologicalSolves(solves.filter((solve) => selectedSolveIds.has(solve.id)));
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
  const statsSolves = chronologicalSolves(statsData.solves);
  const summary = summarizeSolves(statsSolves);
  const text = buildStatsSummary(statsData.label, summary, statsSolves);
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

function renderStatsTrendChart(sessionSolves, chartLabel = '最近', options = {}) {
  const canvas = elements.statsTrendChart;
  statsTrendChartRenderState = { sessionSolves, chartLabel, options };
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
      value: statsChartValueAt(sessionSolves, startIndex + index, statsChartMode, options.metricsById?.get(solve.id)),
    }))
    .filter((point) => Number.isFinite(point.value));
  renderStatsChartModeControls();
  const modeLabel = statsChartLabels[statsChartMode] || '单次';
  elements.statsChartTitle.textContent = `${modeLabel} 趋势`;

  if (points.length === 0) {
    statsTrendChartModel = null;
    statsTrendChartHoverIndex = -1;
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
  const renderPoints = points.map((point) => ({
    ...point,
    x: xFor(point.index),
    y: yFor(point.value),
    solveNumber: startIndex + point.index + 1,
  }));
  if (statsTrendChartHoverIndex >= renderPoints.length) statsTrendChartHoverIndex = -1;

  drawChartGrid(context, width, height, padding, yMin, yMax);

  const lineGradient = context.createLinearGradient(padding.left, 0, width - padding.right, 0);
  lineGradient.addColorStop(0, cssCustomProperty('--accent', '#00adb5'));
  lineGradient.addColorStop(1, cssCustomProperty('--accent-highlight', '#8dffbe'));
  const fillGradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  fillGradient.addColorStop(0, cssRgbaCustomProperty('--accent-rgb', 0.18, '0, 173, 181'));
  fillGradient.addColorStop(1, cssRgbaCustomProperty('--accent-rgb', 0, '0, 173, 181'));

  context.beginPath();
  renderPoints.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.lineTo(renderPoints.at(-1).x, height - padding.bottom);
  context.lineTo(renderPoints[0].x, height - padding.bottom);
  context.closePath();
  context.fillStyle = fillGradient;
  context.fill();

  context.lineWidth = 2.4;
  context.strokeStyle = lineGradient;
  context.beginPath();
  renderPoints.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();

  for (const point of renderPoints) {
    context.beginPath();
    context.fillStyle = point.solve.penalty === '+2' ? '#ffcc66' : cssCustomProperty('--accent-strong', '#00d6de');
    context.arc(point.x, point.y, 3.4, 0, Math.PI * 2);
    context.fill();
  }

  const hoverPoint = renderPoints[statsTrendChartHoverIndex] || null;
  if (hoverPoint) drawTrendChartHover(context, width, height, padding, hoverPoint);

  const dnfCount = chartSolves.filter((solve) => solve.penalty === 'dnf').length;
  const latestPoint = renderPoints.at(-1);
  const bestValue = statsChartMode === 'tps' ? Math.max(...values) : Math.min(...values);
  statsTrendChartModel = {
    canvas,
    modeLabel,
    points: renderPoints,
  };
  elements.statsChartMeta.textContent = `${chartLabel} ${chartSolves.length} 把 · ${modeLabel} 有效 ${points.length} · 最佳 ${statsChartValueText(bestValue)} · 当前 ${statsChartValueText(latestPoint.value)} · DNF ${dnfCount}`;
}

function renderStatsDistributionChart(sessionSolves, chartLabel = '当前会话') {
  const canvas = elements.statsDistributionChart;
  if (!canvas) return;
  statsDistributionChartRenderState = { sessionSolves, chartLabel };
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
    statsDistributionChartModel = null;
    statsDistributionChartHoverIndex = -1;
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
  gradient.addColorStop(0, cssRgbaCustomProperty('--accent-strong-rgb', 0.9, '0, 214, 222'));
  gradient.addColorStop(1, cssRgbaCustomProperty('--accent-rgb', 0.22, '0, 173, 181'));

  const bucketRects = [];
  buckets.forEach((bucket, index) => {
    const barHeight = (bucket.count / maxCount) * plotHeight;
    const x = padding.left + index * (plotWidth / bucketCount) + gap / 2;
    const y = height - padding.bottom - barHeight;
    bucketRects.push({ ...bucket, x, y, width: barWidth, height: barHeight, index });
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
  if (statsDistributionChartHoverIndex >= bucketRects.length) statsDistributionChartHoverIndex = -1;
  const hoverBucket = bucketRects[statsDistributionChartHoverIndex] || null;
  if (hoverBucket) drawDistributionChartHover(context, hoverBucket);

  const markerX = padding.left + Math.min(1, Math.max(0, (median - minValue) / range)) * plotWidth;
  context.strokeStyle = cssRgbaCustomProperty('--accent-highlight-rgb', 0.85, '141, 255, 190');
  context.lineWidth = 1.4;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(markerX, padding.top);
  context.lineTo(markerX, height - padding.bottom + 4);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = cssRgbaCustomProperty('--accent-highlight-rgb', 0.9, '141, 255, 190');
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
  statsDistributionChartModel = {
    canvas,
    buckets: bucketRects,
  };
  if (elements.statsDistributionMeta) {
    elements.statsDistributionMeta.textContent = `${chartLabel} · 有效 ${values.length} · DNF ${dnfCount} · 集中 ${formatTime(denseBucket.start)}-${formatTime(Math.max(denseBucket.start, denseBucket.end - 1))}`;
  }
}

function drawTrendChartHover(context, width, height, padding, point) {
  context.save();
  context.strokeStyle = cssRgbaCustomProperty('--accent-highlight-rgb', 0.72, '141, 255, 190');
  context.lineWidth = 1;
  context.setLineDash([3, 5]);
  context.beginPath();
  context.moveTo(point.x, padding.top);
  context.lineTo(point.x, height - padding.bottom);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = 'rgba(8, 8, 10, 0.88)';
  context.strokeStyle = cssRgbaCustomProperty('--accent-highlight-rgb', 0.95, '141, 255, 190');
  context.lineWidth = 2;
  context.beginPath();
  context.arc(point.x, point.y, 7, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = cssCustomProperty('--accent-highlight', '#8dffbe');
  context.beginPath();
  context.arc(point.x, point.y, 3, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawDistributionChartHover(context, bucket) {
  context.save();
  context.fillStyle = cssRgbaCustomProperty('--accent-highlight-rgb', 0.18, '141, 255, 190');
  roundedCanvasRect(context, bucket.x, bucket.y, bucket.width, bucket.height, 5);
  context.fill();
  context.strokeStyle = cssRgbaCustomProperty('--accent-highlight-rgb', 0.92, '141, 255, 190');
  context.lineWidth = 1.6;
  roundedCanvasRect(context, bucket.x, bucket.y, bucket.width, bucket.height, 5);
  context.stroke();
  context.restore();
}

function handleStatsTrendChartPointerMove(event) {
  const model = statsTrendChartModel;
  if (!model?.points?.length) {
    hideStatsChartTooltip();
    return;
  }
  const position = canvasPointerPosition(event, model.canvas);
  const nextIndex = nearestTrendPointIndex(model.points, position);
  if (nextIndex !== statsTrendChartHoverIndex) {
    statsTrendChartHoverIndex = nextIndex;
    rerenderStatsTrendChart();
  }
  const point = statsTrendChartModel?.points?.[statsTrendChartHoverIndex];
  if (!point) {
    hideStatsChartTooltip();
    return;
  }
  showStatsChartTooltip(event, statsTrendTooltipLines(point, model.modeLabel));
}

function handleStatsTrendChartPointerLeave() {
  if (statsTrendChartHoverIndex === -1) return;
  statsTrendChartHoverIndex = -1;
  hideStatsChartTooltip();
  rerenderStatsTrendChart();
}

function handleStatsDistributionChartPointerMove(event) {
  const model = statsDistributionChartModel;
  if (!model?.buckets?.length) {
    hideStatsChartTooltip();
    return;
  }
  const position = canvasPointerPosition(event, model.canvas);
  const nextIndex = model.buckets.findIndex((bucket) => (
    position.x >= bucket.x
    && position.x <= bucket.x + bucket.width
    && position.y >= bucket.y
    && position.y <= bucket.y + Math.max(bucket.height, 8)
  ));
  if (nextIndex !== statsDistributionChartHoverIndex) {
    statsDistributionChartHoverIndex = nextIndex;
    rerenderStatsDistributionChart();
  }
  const bucket = statsDistributionChartModel?.buckets?.[statsDistributionChartHoverIndex];
  if (!bucket) {
    hideStatsChartTooltip();
    return;
  }
  showStatsChartTooltip(event, statsDistributionTooltipLines(bucket));
}

function handleStatsDistributionChartPointerLeave() {
  if (statsDistributionChartHoverIndex === -1) return;
  statsDistributionChartHoverIndex = -1;
  hideStatsChartTooltip();
  rerenderStatsDistributionChart();
}

function startStatsChartPointerTracking() {
  if (statsChartDocumentPointerTracking) return;
  document.addEventListener('pointermove', handleStatsChartDocumentPointerMove, true);
  statsChartDocumentPointerTracking = true;
}

function stopStatsChartPointerTracking() {
  if (!statsChartDocumentPointerTracking) return;
  document.removeEventListener('pointermove', handleStatsChartDocumentPointerMove, true);
  statsChartDocumentPointerTracking = false;
}

function handleStatsChartDocumentPointerMove(event) {
  if (!elements.statsDialog.open) {
    stopStatsChartPointerTracking();
    return;
  }
  const target = event.target;
  if (target === elements.statsTrendChart) {
    if (statsDistributionChartHoverIndex !== -1) {
      statsDistributionChartHoverIndex = -1;
      rerenderStatsDistributionChart();
    }
    return;
  }
  if (target === elements.statsDistributionChart) {
    if (statsTrendChartHoverIndex !== -1) {
      statsTrendChartHoverIndex = -1;
      rerenderStatsTrendChart();
    }
    return;
  }
  if (statsTrendChartHoverIndex === -1 && statsDistributionChartHoverIndex === -1) return;
  statsTrendChartHoverIndex = -1;
  statsDistributionChartHoverIndex = -1;
  hideStatsChartTooltip();
  rerenderStatsTrendChart();
  rerenderStatsDistributionChart();
}

function canvasPointerPosition(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function nearestTrendPointIndex(points, position) {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const distance = Math.hypot(point.x - position.x, point.y - position.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestDistance <= 18 ? nearestIndex : -1;
}

function rerenderStatsTrendChart() {
  const state = statsTrendChartRenderState;
  if (!state) return;
  renderStatsTrendChart(state.sessionSolves, state.chartLabel, state.options);
}

function rerenderStatsDistributionChart() {
  const state = statsDistributionChartRenderState;
  if (!state) return;
  renderStatsDistributionChart(state.sessionSolves, state.chartLabel);
}

function statsTrendTooltipLines(point, modeLabel) {
  const solve = point.solve;
  const dateText = solve?.createdAt ? new Date(solve.createdAt).toLocaleString() : '';
  return [
    `${modeLabel} · 第 ${point.solveNumber} 把`,
    `图表值 ${statsChartValueText(point.value)}`,
    `单次 ${displaySolveTime(solve)}`,
    statsPenaltyTooltipText(solve),
    dateText,
  ].filter(Boolean);
}

function statsDistributionTooltipLines(bucket) {
  return [
    `${formatTime(bucket.start)}-${formatTime(Math.max(bucket.start, bucket.end - 1))}`,
    `${bucket.count} 把成绩`,
  ];
}

function statsPenaltyTooltipText(solve) {
  if (!solve?.penalty || solve.penalty === 'ok') return '罚时 OK';
  if (solve.penalty === '+2') return '罚时 +2';
  if (solve.penalty === 'dnf') return 'DNF';
  return `罚时 ${solve.penalty}`;
}

function ensureStatsChartTooltip() {
  const host = elements.statsDialog?.open ? elements.statsDialog : document.body;
  if (statsChartTooltip) {
    if (statsChartTooltip.parentElement !== host) host.append(statsChartTooltip);
    return statsChartTooltip;
  }
  statsChartTooltip = document.createElement('div');
  statsChartTooltip.className = 'stats-chart-tooltip';
  statsChartTooltip.setAttribute('role', 'tooltip');
  host.append(statsChartTooltip);
  return statsChartTooltip;
}

function showStatsChartTooltip(event, lines) {
  const tooltip = ensureStatsChartTooltip();
  tooltip.replaceChildren(...lines.map((line, index) => {
    const element = document.createElement(index === 0 ? 'strong' : 'span');
    element.textContent = line;
    return element;
  }));
  tooltip.classList.add('visible');
  const host = tooltip.parentElement || document.body;
  const hostRect = host === document.body
    ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    : host.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const left = Math.min(hostRect.width - width - 8, Math.max(8, event.clientX - hostRect.left + 14));
  const top = Math.min(hostRect.height - height - 8, Math.max(8, event.clientY - hostRect.top + 14));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideStatsChartTooltip() {
  if (!statsChartTooltip) return;
  statsChartTooltip.classList.remove('visible');
}

function renderStatsChartModeControls() {
  elements.statsChartModeButtons.forEach((button) => {
    const active = button.dataset.statsChartMode === statsChartMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function statsChartValueAt(sessionSolves, index, mode, metricEntry = null) {
  const solve = sessionSolves[index];
  if (!solve) return null;
  if (metricEntry) {
    if (mode === 'single') return metricEntry.single;
    if (mode === 'tps') return metricEntry.tps;
    if (Object.hasOwn(metricEntry.metrics || {}, mode)) return metricEntry.metrics[mode];
  }
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

function cssCustomProperty(name, fallback) {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

function cssRgbaCustomProperty(name, alpha, fallbackRgb) {
  return `rgba(${cssCustomProperty(name, fallbackRgb)}, ${alpha})`;
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
  if (source === 'cubedesk-csv') return 'CubeDesk CSV';
  if (source === 'cubedesk-json') return 'CubeDesk JSON';
  if (source === 'timer-json') return '网页计时器 JSON';
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
  const sessionMetrics = cachedSessionMetrics(currentSessionId, sessionSolves);
  const listed = listedHistoryEntries(sessionMetrics.entries).slice(0, compactHistoryLimit);
  renderHistoryControls(sessionSolves);
  const rowsKey = [
    currentSessionId,
    historySortKey,
    historySortDirection,
    selectedSolveIdsSignature(),
    compactHistoryRenderSignature(listed),
  ].join('|');
  if (rowsKey !== historyRowsRenderKey) {
    historyRowsRenderKey = rowsKey;
    elements.historyRows.replaceChildren(
      ...listed.map((entry) => renderSolveRow(entry.solve, entry.index + 1, sessionSolves, {
        compact: true,
        metrics: entry.metrics,
      })),
    );
    requestAnimationFrame(updateHistoryRowsMask);
  }
  renderHistoryCfopPanel();
}

function compactHistoryEntries() {
  const sessionSolves = filteredSolves();
  const sessionMetrics = cachedSessionMetrics(currentSessionId, sessionSolves);
  return listedHistoryEntries(sessionMetrics.entries).slice(0, compactHistoryLimit);
}

function selectedSolveIdsSignature() {
  return [...selectedSolveIds].sort().join(',');
}

function compactHistoryRenderSignature(entries) {
  return entries.map((entry) => {
    const solve = entry.solve;
    const metrics = entry.metrics || {};
    return [
      entry.index,
      solve.id,
      solve.durationMs,
      solve.effectiveDurationMs ?? '',
      solve.penalty || '',
      solve.bluetoothTps ?? '',
      solve.bluetoothMoveCount ?? '',
      solve.createdAt || '',
      solve.scramblePuzzle || '',
      solve.timerSource || '',
      Array.isArray(solve.tags) ? solve.tags.join(',') : '',
      solve.comment || '',
      metrics.ao5 ?? '',
      metrics.ao12 ?? '',
      (metrics.recordMarks || []).map((mark) => `${mark.type}:${mark.value}`).join(','),
    ].join(':');
  }).join('|');
}

function renderHistoryCfopPanel() {
  if (!elements.historyCfopPanel) return;
  const source = historyCfopPanelSource();
  if (!source) {
    const renderKey = 'hidden';
    if (renderKey === historyCfopRenderKey) return;
    historyCfopRenderKey = renderKey;
    elements.historyCfopPanel.hidden = true;
    elements.historyCfopStages.replaceChildren();
    return;
  }

  const sourceKey = historyCfopSourceRenderKey(source);
  if (sourceKey === historyCfopRenderKey) return;
  historyCfopRenderKey = sourceKey;

  elements.historyCfopPanel.hidden = false;
  elements.historyCfopPanel.classList.toggle('collapsed', historyCfopCollapsed);
  elements.historyCfopToggle.setAttribute('aria-expanded', historyCfopCollapsed ? 'false' : 'true');
  elements.historyCfopBody.hidden = false;
  elements.historyCfopTitle.textContent = source.title;
  elements.historyCfopMeta.textContent = source.meta;

  if (source.kind === 'multi') {
    elements.historyCfopStages.replaceChildren(renderHistoryCfopEmpty(`已选 ${source.count} 条，单独选择一条可查看 CFOP 步骤。`));
    return;
  }

  const display = cfopDisplayForSolve(source.solve);
  if (!display.hasData) {
    elements.historyCfopStages.replaceChildren(renderHistoryCfopEmpty('这条成绩没有可用于 CFOP 分段的蓝牙步骤。'));
    return;
  }

  elements.historyCfopMeta.textContent = `${source.meta} · ${display.meta}`;
  const historyStages = compactCfopStagesForOpEvents(display.stages, display.opEvents);
  elements.historyCfopStages.replaceChildren(
    ...historyStages.map((stage) => renderCfopStageCard(stage)),
    ...display.opEvents.map((event) => renderOpEventCard(event)),
  );
}

function compactCfopStagesForOpEvents(stages, opEvents) {
  const recognizedKinds = new Set((Array.isArray(opEvents) ? opEvents : [])
    .map((event) => event?.kind)
    .filter((kind) => kind === 'oll' || kind === 'pll'));
  if (recognizedKinds.size === 0) return stages;
  return (Array.isArray(stages) ? stages : []).filter((stage) => {
    if (cfopOpSkipKind(stage)) return true;
    if ((stage?.key === 'oll' || stage?.label === 'O') && recognizedKinds.has('oll')) return false;
    if ((stage?.key === 'pll' || stage?.label === 'P') && recognizedKinds.has('pll')) return false;
    return true;
  });
}

function historyCfopSourceRenderKey(source) {
  if (!source) return 'hidden';
  return [
    source.kind,
    historyCfopCollapsed ? 1 : 0,
    source.title || '',
    source.meta || '',
    source.count ?? '',
    source.solve ? solveCfopRenderSignature(source.solve) : '',
  ].join('|');
}

function solveCfopRenderSignature(solve) {
  if (!solve) return '';
  const moveLog = Array.isArray(solve.bluetoothMoveLog) ? solve.bluetoothMoveLog : [];
  const stateCorrections = Array.isArray(solve.bluetoothStateCorrections) ? solve.bluetoothStateCorrections : [];
  const stages = Array.isArray(solve.cfopStages) ? solve.cfopStages : [];
  const opEvents = Array.isArray(solve.opEvents) ? solve.opEvents : [];
  const firstMove = moveLog[0];
  const lastMove = moveLog.at(-1);
  return [
    solve.id || '',
    solve.durationMs ?? '',
    solve.effectiveDurationMs ?? '',
    solve.penalty || '',
    solve.bluetoothMoveCount ?? '',
    solve.bluetoothTps ?? '',
    moveLog.length,
    firstMove ? `${firstMove.move || ''}:${firstMove.elapsedMs ?? ''}` : '',
    lastMove ? `${lastMove.move || ''}:${lastMove.elapsedMs ?? ''}` : '',
    stateCorrections.map((entry) => `${entry?.step ?? ''}:${entry?.facelets || ''}`).join(','),
    stages.map((stage) => [
      stage?.key || '',
      stage?.completed ? 1 : 0,
      stage?.completedAt ?? '',
      stage?.turns ?? '',
      stage?.durationMs ?? '',
      stage?.observationMs ?? '',
      stage?.completedAtElapsedMs ?? '',
    ].join(':')).join(','),
    opEvents.map((event) => [
      event?.kind || '',
      event?.caseId || '',
      event?.startStep ?? '',
      event?.endStep ?? '',
      event?.durationMs ?? '',
      event?.observationMs ?? '',
      Array.isArray(event?.moves) ? event.moves.join(' ') : '',
    ].join(':')).join(','),
  ].join(';');
}

function historyCfopPanelSource() {
  if (selectedSolveIds.size > 1) {
    return {
      kind: 'multi',
      title: '复原详情',
      meta: '多选操作',
      count: selectedSolveIds.size,
    };
  }

  if (selectedSolveIds.size === 1) {
    const [selectedId] = selectedSolveIds;
    const solve = solves.find((item) => item.id === selectedId);
    if (!solve) return null;
    return {
      kind: 'selected',
      title: '选中成绩 CFOP',
      meta: `${sessionNameForSolve(solve)} · ${displaySolveTime(solve)}`,
      solve,
    };
  }

  const latest = latestSessionSolve();
  if (appState !== 'done' || latest?.timerSource !== 'bluetooth') return null;
  return {
    kind: 'latest',
    title: '上一轮 CFOP',
    meta: `${displaySolveTime(latest)} · 刚完成`,
    solve: latest,
  };
}

function cfopDisplayForSolve(solve, analysis = solveCfopAnalysis(solve)) {
  const storedStages = normalizeStoredCfopStages(solve?.cfopStages);
  const analyzedCompletedCount = analysis.stages.filter((stage) => stage.completed).length;
  const storedCompletedCount = storedStages.filter((stage) => stage.completed).length;
  const storedCompleted = storedCompletedCount > 0;
  const storedCollapsed = isCollapsedCfopTiming(storedStages);
  const stages = storedCompletedCount > analyzedCompletedCount && !storedCollapsed ? storedStages : analysis.stages;
  const opEvents = opDisplayEventsForSolve(solve);
  const completedCount = stages.filter((stage) => stage.completed).length;
  const hasData = analysis.records.length > 0 || (storedCompleted && !storedCollapsed);
  const moveCount = analysis.records.length || (solve?.bluetoothMoveCount ?? 0);
  const bottomFace = analysis.bottomFace ? `底面 ${analysis.bottomFace}` : '';
  const confidence = analysis.confidence ? `判断 ${analysis.confidence}` : '';
  const skipText = cfopOpSkipMetaText(stages);
  const tps = Number.isFinite(solve?.bluetoothTps) ? `${solve.bluetoothTps.toFixed(2)} TPS` : '';
  return {
    stages,
    opEvents,
    hasData,
    meta: [
      `${completedCount}/${stages.length} 步`,
      opEvents.length > 0 ? `OP ${opEvents.length}` : '',
      skipText,
      moveCount > 0 ? `${moveCount} 步` : '',
      tps,
      bottomFace,
      confidence,
    ].filter(Boolean).join(' · '),
  };
}

function cfopOpSkipMetaText(stages) {
  const labels = (Array.isArray(stages) ? stages : [])
    .map((stage) => {
      const kind = cfopOpSkipKind(stage);
      if (kind === 'oll') return 'O';
      if (kind === 'pll') return 'P';
      return '';
    })
    .filter(Boolean);
  return labels.length > 0 ? `跳 ${labels.join('/')}` : '';
}

function isCollapsedCfopTiming(stages) {
  const completed = Array.isArray(stages) ? stages.filter((stage) => stage.completed) : [];
  if (completed.length < 4) return false;
  const first = completed[0];
  if (!Number.isFinite(first.completedAt) || first.completedAt <= 0) return false;
  if (!Number.isFinite(first.durationMs) || first.durationMs <= 0) return false;
  return completed.every((stage) => stage.completedAt === first.completedAt)
    && completed.slice(1).every((stage) => stage.turns === 0 && (stage.durationMs == null || stage.durationMs === 0));
}

function opDisplayEventsForSolve(solve) {
  const stored = normalizeStoredOpEvents(solve?.opEvents);
  if (stored.length > 0) return stored;
  try {
    return normalizeStoredOpEvents(opEventsForSave(solve));
  } catch {
    return [];
  }
}

function normalizeStoredOpEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event) => ({
    kind: ['oll', 'pll'].includes(event?.kind) ? event.kind : '',
    caseId: String(event?.caseId || ''),
    name: String(event?.name || ''),
    group: String(event?.group || ''),
    algorithm: String(event?.algorithm || ''),
    pdfLabel: String(event?.pdfLabel || ''),
    source: String(event?.source || ''),
    confidence: String(event?.confidence || ''),
    matchCount: optionalDisplayNumber(event?.matchCount) ?? 0,
    startStep: optionalDisplayNumber(event?.startStep),
    endStep: optionalDisplayNumber(event?.endStep),
    completedAt: optionalDisplayNumber(event?.completedAt),
    turns: optionalDisplayNumber(event?.turns) ?? 0,
    durationMs: optionalDisplayNumber(event?.durationMs),
    observationMs: optionalDisplayNumber(event?.observationMs),
    tps: optionalDisplayNumber(event?.tps),
    moves: Array.isArray(event?.moves) ? event.moves.map((move) => String(move || '').trim()).filter(Boolean) : [],
    startedAtElapsedMs: optionalDisplayNumber(event?.startedAtElapsedMs),
    firstMoveElapsedMs: optionalDisplayNumber(event?.firstMoveElapsedMs),
    completedAtElapsedMs: optionalDisplayNumber(event?.completedAtElapsedMs),
    startedAtTimestampMs: optionalDisplayNumber(event?.startedAtTimestampMs),
    firstMoveTimestampMs: optionalDisplayNumber(event?.firstMoveTimestampMs),
    completedAtTimestampMs: optionalDisplayNumber(event?.completedAtTimestampMs),
    startedAtIsoTime: String(event?.startedAtIsoTime || ''),
    firstMoveIsoTime: String(event?.firstMoveIsoTime || ''),
    completedAtIsoTime: String(event?.completedAtIsoTime || ''),
    startFacelets: normalizeStoredOpFacelets(event?.startFacelets),
    signature: String(event?.signature || ''),
    formulaAccepted: event?.formulaAccepted === true,
    formulaReason: String(event?.formulaReason || ''),
    moveTimings: normalizeStoredOpMoveTimings(event?.moveTimings),
  })).filter((event) => event.kind && event.caseId);
}

function normalizeStoredOpMoveTimings(moveTimings) {
  if (!Array.isArray(moveTimings)) return [];
  return moveTimings.map((entry) => ({
    step: optionalDisplayNumber(entry?.step),
    move: String(entry?.move || '').trim(),
    elapsedMs: optionalDisplayNumber(entry?.elapsedMs),
    timestampMs: optionalDisplayNumber(entry?.timestampMs),
    deltaMs: optionalDisplayNumber(entry?.deltaMs),
    isoTime: String(entry?.isoTime || ''),
  })).filter((entry) => entry.move);
}

function normalizeStoredOpFacelets(value) {
  const facelets = String(value || '').trim().toUpperCase();
  return /^[URFDLB]{54}$/.test(facelets) ? facelets : '';
}

function optionalDisplayNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStoredCfopStages(stages) {
  if (!Array.isArray(stages)) return [];
  return stages.map((stage, index) => ({
    key: String(stage?.key || `stage-${index}`),
    label: String(stage?.label || cfopStageTemplate()[index]?.label || ''),
    name: String(stage?.name || cfopStageTemplate()[index]?.name || ''),
    completed: stage?.completed === true,
    completedAt: Number.isFinite(Number(stage?.completedAt)) ? Number(stage.completedAt) : null,
    startStep: Number.isFinite(Number(stage?.startStep)) ? Number(stage.startStep) : null,
    endStep: Number.isFinite(Number(stage?.endStep)) ? Number(stage.endStep) : null,
    turns: Number.isFinite(Number(stage?.turns)) ? Number(stage.turns) : 0,
    durationMs: Number.isFinite(Number(stage?.durationMs)) ? Number(stage.durationMs) : null,
    tps: Number.isFinite(Number(stage?.tps)) ? Number(stage.tps) : null,
    startedAtElapsedMs: Number.isFinite(Number(stage?.startedAtElapsedMs)) ? Number(stage.startedAtElapsedMs) : null,
    firstMoveElapsedMs: Number.isFinite(Number(stage?.firstMoveElapsedMs)) ? Number(stage.firstMoveElapsedMs) : null,
    completedAtElapsedMs: Number.isFinite(Number(stage?.completedAtElapsedMs)) ? Number(stage.completedAtElapsedMs) : null,
    observationMs: Number.isFinite(Number(stage?.observationMs)) ? Number(stage.observationMs) : null,
    startedAtTimestampMs: Number.isFinite(Number(stage?.startedAtTimestampMs)) ? Number(stage.startedAtTimestampMs) : null,
    firstMoveTimestampMs: Number.isFinite(Number(stage?.firstMoveTimestampMs)) ? Number(stage.firstMoveTimestampMs) : null,
    completedAtTimestampMs: Number.isFinite(Number(stage?.completedAtTimestampMs)) ? Number(stage.completedAtTimestampMs) : null,
    startedAtIsoTime: typeof stage?.startedAtIsoTime === 'string' ? stage.startedAtIsoTime : '',
    firstMoveIsoTime: typeof stage?.firstMoveIsoTime === 'string' ? stage.firstMoveIsoTime : '',
    completedAtIsoTime: typeof stage?.completedAtIsoTime === 'string' ? stage.completedAtIsoTime : '',
  }));
}

function renderHistoryCfopEmpty(text) {
  const node = document.createElement('div');
  node.className = 'history-cfop-empty';
  node.textContent = text;
  return node;
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

function listedHistoryEntries(entries) {
  if (!historySortKey || !historySortDirection) return entries.slice(-compactHistoryLimit).reverse();
  const direction = historySortDirection === 'desc' ? -1 : 1;
  return entries.slice().sort((left, right) => {
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
    const sessionMetrics = cachedSessionMetrics(sessionId, sessionSolves);
    for (const entry of sessionMetrics.entries) {
      if (rowIds.has(entry.solve.id)) {
        context.set(entry.solve.id, {
          sessionSolves,
          index: entry.index,
          metrics: entry.metrics,
        });
      }
    }
  }
  return context;
}

function cachedSessionMetrics(sessionId, sessionSolves) {
  const cacheKey = sessionId || 'default';
  const signature = sessionMetricsSignature(sessionSolves);
  const cached = sessionMetricsCache.get(cacheKey);
  if (cached?.signature === signature) return cached.metrics;

  const metrics = buildSessionMetrics(sessionSolves);
  sessionMetricsCache.set(cacheKey, { signature, metrics });
  pruneSessionMetricsCache();
  return metrics;
}

function sessionMetricsSignature(sessionSolves) {
  const cached = sessionMetricsSignatureCache.get(sessionSolves);
  if (cached) return cached;
  const signature = sessionSolves.map((solve) => [
    solve.id,
    solve.durationMs,
    solve.effectiveDurationMs ?? '',
    solve.penalty || '',
    solve.bluetoothTps ?? '',
  ].join(':')).join('|');
  sessionMetricsSignatureCache.set(sessionSolves, signature || 'empty');
  return signature || 'empty';
}

function buildSessionMetrics(sessionSolves) {
  const byId = new Map();
  const bestValues = {
    single: null,
    mo3: null,
    ao5: null,
    ao12: null,
    ao50: null,
    ao100: null,
  };
  const entries = sessionSolves.map((solve, index) => {
    const single = effectiveDurationMs(solve);
    const metrics = {
      mo3: rollingMeanAt(sessionSolves, index, 3),
      ao5: rollingAverageAt(sessionSolves, index, 5),
      ao12: rollingAverageAt(sessionSolves, index, 12),
      ao50: rollingAverageAt(sessionSolves, index, 50),
      ao100: rollingAverageAt(sessionSolves, index, 100),
      recordMarks: [],
    };
    metrics.recordMarks = sessionRecordMarks(metrics, single, bestValues);
    const entry = {
      solve,
      index,
      single,
      tps: Number.isFinite(solve.bluetoothTps) ? solve.bluetoothTps : null,
      mo3: metrics.mo3,
      ao5: metrics.ao5,
      ao12: metrics.ao12,
      ao50: metrics.ao50,
      ao100: metrics.ao100,
      metrics,
    };
    byId.set(solve.id, entry);
    return entry;
  });
  return { entries, byId };
}

function sessionRecordMarks(metrics, single, bestValues) {
  const marks = [];
  updateBestRecordMark(marks, bestValues, 'single', 'single', 'PB', single);
  updateBestRecordMark(marks, bestValues, 'mo3', 'mo3', 'PB mo3', metrics.mo3);
  updateBestRecordMark(marks, bestValues, 'ao5', 'ao5', 'PB ao5', metrics.ao5);
  updateBestRecordMark(marks, bestValues, 'ao12', 'ao12', 'PB ao12', metrics.ao12);
  updateBestRecordMark(marks, bestValues, 'ao50', 'ao50', 'PB ao50', metrics.ao50);
  updateBestRecordMark(marks, bestValues, 'ao100', 'ao100', 'PB ao100', metrics.ao100);
  return marks;
}

function updateBestRecordMark(marks, bestValues, key, type, label, value) {
  if (value == null) return;
  const previousBest = bestValues[key];
  if (previousBest == null || value < previousBest) {
    marks.push({ type, label, value });
    bestValues[key] = value;
  }
}

function pruneSessionMetricsCache() {
  const validSessionIds = new Set(sessions.map((session) => session.id || 'default'));
  validSessionIds.add('default');
  for (const cacheKey of sessionMetricsCache.keys()) {
    if (!validSessionIds.has(cacheKey)) sessionMetricsCache.delete(cacheKey);
  }
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
    mo3: Object.hasOwn(seed, 'mo3') ? seed.mo3 : rollingMeanAt(sessionSolves, solveIndex, 3),
    ao5: Object.hasOwn(seed, 'ao5') ? seed.ao5 : rollingAverageAt(sessionSolves, solveIndex, 5),
    ao12: Object.hasOwn(seed, 'ao12') ? seed.ao12 : rollingAverageAt(sessionSolves, solveIndex, 12),
    ao50: Object.hasOwn(seed, 'ao50') ? seed.ao50 : rollingAverageAt(sessionSolves, solveIndex, 50),
    ao100: Object.hasOwn(seed, 'ao100') ? seed.ao100 : rollingAverageAt(sessionSolves, solveIndex, 100),
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
  if (options.compact) {
    row.classList.add('compact-history-row');
    row.dataset.solveId = solve.id;
    row.tabIndex = 0;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', selectedSolveIds.has(solve.id) ? 'true' : 'false');
  }
  row.classList.toggle('selected', selectedSolveIds.has(solve.id));
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
  return `${solve.bluetoothMoveCount ?? 0} 步 · ${solve.bluetoothTps.toFixed(3)} TPS`;
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

function renderHistoryControls(sessionSolves = filteredSolves()) {
  const sessionsCanMove = sessions.some((session) => session.id !== currentSessionId);
  const visibleIds = sessionSolves.slice(-3).reverse().map((solve) => solve.id);
  const renderKey = [
    selectedSolveIdsSignature(),
    currentSessionId,
    sessionsCanMove ? 1 : 0,
    sessions.length,
    solves.length,
    sessionSolves.length,
    pendingDeletedSolves.length,
    pendingImportSnapshot?.mode || '',
    pendingImportSnapshot?.fileName || '',
    historySortKey,
    historySortDirection,
    visibleIds.join(','),
  ].join('|');
  if (renderKey === historyControlsRenderKey) return;
  historyControlsRenderKey = renderKey;

  renderHistorySortControls();
  const canMoveSelected = selectedSolveIds.size > 0 && sessionsCanMove;
  elements.markSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.selectedStatsButton.disabled = selectedSolveIds.size === 0;
  elements.puzzleSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.tagSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.commentSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.moveSelectedButton.disabled = !canMoveSelected;
  elements.moveSelectedButton.title = sessionsCanMove
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
  elements.clearAllButton.disabled = sessionSolves.length === 0;
  elements.manageSolvesButton.disabled = solves.length === 0;
  if (elements.selectAllSolves) {
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
  renderHistoryCfopPanel();
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
  if (filteredSolvesCacheRef === solves && filteredSolvesCacheSessionId === currentSessionId) {
    return filteredSolvesCache;
  }
  filteredSolvesCacheRef = solves;
  filteredSolvesCacheSessionId = currentSessionId;
  filteredSolvesCache = orderedSolvesForSession(currentSessionId);
  return filteredSolvesCache;
}

function allSolvesBaseSolves() {
  return allSessionsEnabled ? solves : filteredSolves();
}

function solvesForSession(sessionId) {
  const normalizedSessionId = sessionId || 'default';
  const cached = solvesForSessionCache.get(normalizedSessionId);
  if (cached?.ref === solves) return cached.solves;
  const sessionSolves = orderedSolvesForSession(normalizedSessionId);
  solvesForSessionCache.set(normalizedSessionId, { ref: solves, solves: sessionSolves });
  return sessionSolves;
}

function orderedSolvesForSession(sessionId) {
  const normalizedSessionId = sessionId || 'default';
  return chronologicalSolves(solves.filter((solve) => (solve.sessionId || 'default') === normalizedSessionId));
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
  const sessionId = solve.sessionId || 'default';
  const sessionSolves = solvesForSession(sessionId);
  const entry = cachedSessionMetrics(sessionId, sessionSolves).byId.get(solve.id);
  return (entry?.metrics.recordMarks || []).map((mark) => mark.type);
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
  resetScramblePreviewAspectRatio();
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
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('cube-svg');
  applyScramblePreviewAspectRatio(svg);
  softenTnoodleCubeSvg(svg);
  elements.cubeNet.className = 'cube-net official-preview';
  elements.cubeNet.replaceChildren(document.importNode(svg, true));
}

function applyScramblePreviewAspectRatio(svg) {
  const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const width = viewBox[2];
  const height = viewBox[3];
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    elements.cubeNet.style.setProperty('--preview-aspect-ratio', `${width} / ${height}`);
  } else {
    resetScramblePreviewAspectRatio();
  }
}

function resetScramblePreviewAspectRatio() {
  elements.cubeNet.style.removeProperty('--preview-aspect-ratio');
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
  resetScramblePreviewAspectRatio();
  elements.cubeNet.className = 'cube-net preview-loading';
  elements.cubeNet.textContent = message;
}

function renderCubeNet(scrambleText) {
  const faces = cubeStateFromScramble(scrambleText);
  renderCubeFacesNet(elements.cubeNet, faces, 'cube-net');
}

function renderCubeFacesNet(container, faces, baseClass) {
  const fragment = document.createDocumentFragment();
  let stickerIndex = 0;

  if (container === elements.cubeNet) resetScramblePreviewAspectRatio();
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
        sticker.style.setProperty('--sticker-index', String(stickerIndex));
        stickerIndex += 1;
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
  return inspectionPenaltyForElapsed(inspectionElapsedSeconds());
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
  const orderedSolves = chronologicalSolves(inputSolves);
  if (orderedSolves.length === 0) {
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
  const dnfCount = orderedSolves.filter((solve) => solve.penalty === 'dnf').length;
  const plus2Count = orderedSolves.filter((solve) => solve.penalty === '+2').length;
  const bluetoothStats = summarizeBluetoothSolves(orderedSolves);
  const times = orderedSolves.map((solve) => effectiveDurationMs(solve)).filter((value) => Number.isFinite(value));
  const latest = effectiveDurationMs(orderedSolves.at(-1));
  if (times.length === 0) {
    return {
      count: orderedSolves.length,
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
    count: orderedSolves.length,
    validCount: times.length,
    dnfCount,
    plus2Count,
    ...bluetoothStats,
    best: Math.min(...times),
    worst: Math.max(...times),
    average,
    standardDeviation: Math.sqrt(variance),
    latest,
    mo3: meanOfLast(orderedSolves, 3),
    ao5: averageOfLast(orderedSolves, 5),
    ao12: averageOfLast(orderedSolves, 12),
    ao50: averageOfLast(orderedSolves, 50),
    ao100: averageOfLast(orderedSolves, 100),
    bestMo3: bestMeanOf(orderedSolves, 3),
    bestAo5: bestAverageOf(orderedSolves, 5),
    bestAo12: bestAverageOf(orderedSolves, 12),
    bestAo50: bestAverageOf(orderedSolves, 50),
    bestAo100: bestAverageOf(orderedSolves, 100),
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
    signal: options.signal,
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
