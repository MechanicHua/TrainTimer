import { cubeStateFromScramble, isSolvedFaces } from '/cube-state.js';
import { decodeBatteryLevel, decodeBluetoothMoves } from '/bluetooth-moves.js';
import { createExportPayload, safeExportFilename, selectedExportHistory, solvesToCsv, solvesToCstimerCsv } from '/solves-export.js';
import { parseSolveImport } from '/solves-import.js';
import { buildStatsSummary } from '/stats-summary.js';
import { buildSolveSummary } from '/solve-summary.js';
import { rollingAverageAt } from '/rolling-averages.js';

const inspectionSeconds = 15;
const inspectionDnfSeconds = 17;
const holdToStartMs = 500;
const reminderSeconds = new Set([8, 12]);
const bluetoothDeviceFilters = [
  { namePrefix: 'GAN' },
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
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000aadb-0000-1000-8000-00805f9b34fb',
  '0000aaaa-0000-1000-8000-00805f9b34fb',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
];
const bluetoothBatteryLevelUuid = '00002a19-0000-1000-8000-00805f9b34fb';
const bluetoothGoCubeServiceUuid = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const bluetoothGoCubeWriteUuid = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const bluetoothGoCubeReadUuid = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const bluetoothGiikerBatteryServiceUuid = '0000aaaa-0000-1000-8000-00805f9b34fb';
const bluetoothGiikerBatteryReadUuid = '0000aaab-0000-1000-8000-00805f9b34fb';
const bluetoothGiikerBatteryWriteUuid = '0000aaac-0000-1000-8000-00805f9b34fb';
const facePositions = {
  U: [3, 0],
  L: [0, 3],
  F: [3, 3],
  R: [6, 3],
  B: [9, 3],
  D: [3, 6],
};

const elements = {
  statusText: document.querySelector('#statusText'),
  inspectionToggle: document.querySelector('#inspectionToggle'),
  timerDisplay: document.querySelector('#timerDisplay'),
  timerHint: document.querySelector('#timerHint'),
  nextButton: document.querySelector('#nextButton'),
  scrambleButton: document.querySelector('#scrambleButton'),
  lastOkButton: document.querySelector('#lastOkButton'),
  lastPlusTwoButton: document.querySelector('#lastPlusTwoButton'),
  lastDnfButton: document.querySelector('#lastDnfButton'),
  lastDeleteButton: document.querySelector('#lastDeleteButton'),
  countStat: document.querySelector('#countStat'),
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
  bluetoothLogButton: document.querySelector('#bluetoothLogButton'),
  bluetoothBattery: document.querySelector('#bluetoothBattery'),
  bluetoothStatus: document.querySelector('#bluetoothStatus'),
  sessionSelect: document.querySelector('#sessionSelect'),
  newSessionButton: document.querySelector('#newSessionButton'),
  renameSessionButton: document.querySelector('#renameSessionButton'),
  deleteSessionButton: document.querySelector('#deleteSessionButton'),
  scrambleSource: document.querySelector('#scrambleSource'),
  scrambleText: document.querySelector('#scrambleText'),
  cubeNet: document.querySelector('#cubeNet'),
  historyPath: document.querySelector('#historyPath'),
  historyRows: document.querySelector('#historyRows'),
  selectAllSolves: document.querySelector('#selectAllSolves'),
  manualEntryButton: document.querySelector('#manualEntryButton'),
  exportButton: document.querySelector('#exportButton'),
  importButton: document.querySelector('#importButton'),
  importFile: document.querySelector('#importFile'),
  statsDetailButton: document.querySelector('#statsDetailButton'),
  manageSolvesButton: document.querySelector('#manageSolvesButton'),
  markSelectedButton: document.querySelector('#markSelectedButton'),
  tagSelectedButton: document.querySelector('#tagSelectedButton'),
  moveSelectedButton: document.querySelector('#moveSelectedButton'),
  deleteSelectedButton: document.querySelector('#deleteSelectedButton'),
  undoDeleteButton: document.querySelector('#undoDeleteButton'),
  clearAllButton: document.querySelector('#clearAllButton'),
  allSolvesDialog: document.querySelector('#allSolvesDialog'),
  allSolvesMeta: document.querySelector('#allSolvesMeta'),
  allSolvesRows: document.querySelector('#allSolvesRows'),
  allSolvesSearch: document.querySelector('#allSolvesSearch'),
  allSolvesSortBy: document.querySelector('#allSolvesSortBy'),
  allSolvesSortDirection: document.querySelector('#allSolvesSortDirection'),
  selectAllSessionSolves: document.querySelector('#selectAllSessionSolves'),
  allMarkSelectedButton: document.querySelector('#allMarkSelectedButton'),
  allTagSelectedButton: document.querySelector('#allTagSelectedButton'),
  allMoveSelectedButton: document.querySelector('#allMoveSelectedButton'),
  allDeleteSelectedButton: document.querySelector('#allDeleteSelectedButton'),
  statsDialog: document.querySelector('#statsDialog'),
  statsDialogMeta: document.querySelector('#statsDialogMeta'),
  statsTrendChart: document.querySelector('#statsTrendChart'),
  statsChartMeta: document.querySelector('#statsChartMeta'),
  statsDetailGrid: document.querySelector('#statsDetailGrid'),
  copyStatsSummaryButton: document.querySelector('#copyStatsSummaryButton'),
  exportDialog: document.querySelector('#exportDialog'),
  exportDialogMeta: document.querySelector('#exportDialogMeta'),
  exportSessionJsonButton: document.querySelector('#exportSessionJsonButton'),
  exportSessionCsvButton: document.querySelector('#exportSessionCsvButton'),
  exportSessionCstimerButton: document.querySelector('#exportSessionCstimerButton'),
  exportSelectedJsonButton: document.querySelector('#exportSelectedJsonButton'),
  exportSelectedCsvButton: document.querySelector('#exportSelectedCsvButton'),
  exportSelectedCstimerButton: document.querySelector('#exportSelectedCstimerButton'),
  exportAllJsonButton: document.querySelector('#exportAllJsonButton'),
  exportAllCsvButton: document.querySelector('#exportAllCsvButton'),
  exportAllCstimerButton: document.querySelector('#exportAllCstimerButton'),
  importDialog: document.querySelector('#importDialog'),
  importDialogMeta: document.querySelector('#importDialogMeta'),
  importPreviewList: document.querySelector('#importPreviewList'),
  appendImportButton: document.querySelector('#appendImportButton'),
  replaceImportButton: document.querySelector('#replaceImportButton'),
  markPenaltyDialog: document.querySelector('#markPenaltyDialog'),
  markPenaltyMeta: document.querySelector('#markPenaltyMeta'),
  markPenaltySelect: document.querySelector('#markPenaltySelect'),
  confirmMarkPenaltyButton: document.querySelector('#confirmMarkPenaltyButton'),
  moveSolvesDialog: document.querySelector('#moveSolvesDialog'),
  moveSolvesMeta: document.querySelector('#moveSolvesMeta'),
  moveSessionSelect: document.querySelector('#moveSessionSelect'),
  confirmMoveButton: document.querySelector('#confirmMoveButton'),
  tagSolvesDialog: document.querySelector('#tagSolvesDialog'),
  tagSolvesMeta: document.querySelector('#tagSolvesMeta'),
  tagSolvesInput: document.querySelector('#tagSolvesInput'),
  confirmTagButton: document.querySelector('#confirmTagButton'),
  manualEntryDialog: document.querySelector('#manualEntryDialog'),
  manualEntryMeta: document.querySelector('#manualEntryMeta'),
  manualTimeInput: document.querySelector('#manualTimeInput'),
  manualPenaltySelect: document.querySelector('#manualPenaltySelect'),
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
  solveDetailScramble: document.querySelector('#solveDetailScramble'),
  solveDetailComment: document.querySelector('#solveDetailComment'),
  solveDetailTagsInput: document.querySelector('#solveDetailTagsInput'),
  solveDetailBluetoothStats: document.querySelector('#solveDetailBluetoothStats'),
  solveDetailBluetoothMoves: document.querySelector('#solveDetailBluetoothMoves'),
  solveBluetoothReplay: document.querySelector('#solveBluetoothReplay'),
  solveBluetoothReplayMeta: document.querySelector('#solveBluetoothReplayMeta'),
  solveBluetoothReplayNet: document.querySelector('#solveBluetoothReplayNet'),
  copySolveSummaryButton: document.querySelector('#copySolveSummaryButton'),
  copyScrambleButton: document.querySelector('#copyScrambleButton'),
  saveTimeButton: document.querySelector('#saveTimeButton'),
  saveTagsButton: document.querySelector('#saveTagsButton'),
  saveCommentButton: document.querySelector('#saveCommentButton'),
  bluetoothLogDialog: document.querySelector('#bluetoothLogDialog'),
  bluetoothLogMeta: document.querySelector('#bluetoothLogMeta'),
  bluetoothLogRows: document.querySelector('#bluetoothLogRows'),
  bluetoothMoveCount: document.querySelector('#bluetoothMoveCount'),
  bluetoothMoveRows: document.querySelector('#bluetoothMoveRows'),
  bluetoothSolveStatus: document.querySelector('#bluetoothSolveStatus'),
  bluetoothStateMeta: document.querySelector('#bluetoothStateMeta'),
  bluetoothStateNet: document.querySelector('#bluetoothStateNet'),
  clearBluetoothLogButton: document.querySelector('#clearBluetoothLogButton'),
  copyBluetoothLogButton: document.querySelector('#copyBluetoothLogButton'),
};

let appState = 'loading';
let scramble = null;
let solves = [];
let sessions = [];
let inspectionEnabled = localStorage.getItem('trainTimer.inspection') === '1';
let currentSessionId = localStorage.getItem('trainTimer.session') || 'default';
let startedAt = 0;
let inspectionStartedAt = 0;
let holdStartedAt = 0;
let holdConfirmed = false;
let timerFrame = null;
let inspectionFrame = null;
let holdFrame = null;
let holdReturnState = 'ready';
let reminded = new Set();
let activePenalty = 'ok';
let finishSource = 'manual';
let selectedSolveIds = new Set();
let pendingDeletedSolves = [];
let pendingImportSnapshot = null;
let pendingImportPreview = null;
let currentDetailSolveId = null;
let bluetoothDevice = null;
let bluetoothSubscriptions = [];
let bluetoothLog = [];
let bluetoothMoves = [];
let bluetoothSolved = false;
let bluetoothBatteryLevel = null;
let previewScrambleText = '';
let previewRequestId = 0;
const previewCache = new Map();

elements.inspectionToggle.checked = inspectionEnabled;
elements.inspectionToggle.addEventListener('change', () => {
  inspectionEnabled = elements.inspectionToggle.checked;
  localStorage.setItem('trainTimer.inspection', inspectionEnabled ? '1' : '0');
  render();
});
elements.nextButton.addEventListener('click', nextSolve);
elements.scrambleButton.addEventListener('click', loadScramble);
elements.lastOkButton.addEventListener('click', () => updateLatestSolvePenalty('ok'));
elements.lastPlusTwoButton.addEventListener('click', () => updateLatestSolvePenalty('+2'));
elements.lastDnfButton.addEventListener('click', () => updateLatestSolvePenalty('dnf'));
elements.lastDeleteButton.addEventListener('click', deleteLatestSolve);
elements.bluetoothButton.addEventListener('click', () => connectBluetoothCube());
elements.bluetoothAnyButton.addEventListener('click', () => connectBluetoothCube({ compatibilityMode: true }));
elements.bluetoothLogButton.addEventListener('click', openBluetoothLogDialog);
elements.sessionSelect.addEventListener('change', switchSession);
elements.newSessionButton.addEventListener('click', createSession);
elements.renameSessionButton.addEventListener('click', renameSession);
elements.deleteSessionButton.addEventListener('click', deleteCurrentSession);
elements.manualEntryButton.addEventListener('click', openManualEntryDialog);
elements.exportButton.addEventListener('click', openExportDialog);
elements.exportSessionJsonButton.addEventListener('click', () => exportSolves('json', 'session'));
elements.exportSessionCsvButton.addEventListener('click', () => exportSolves('csv', 'session'));
elements.exportSessionCstimerButton.addEventListener('click', () => exportSolves('cstimer', 'session'));
elements.exportSelectedJsonButton.addEventListener('click', () => exportSelectedSolves('json'));
elements.exportSelectedCsvButton.addEventListener('click', () => exportSelectedSolves('csv'));
elements.exportSelectedCstimerButton.addEventListener('click', () => exportSelectedSolves('cstimer'));
elements.exportAllJsonButton.addEventListener('click', () => exportSolves('json', 'all'));
elements.exportAllCsvButton.addEventListener('click', () => exportSolves('csv', 'all'));
elements.exportAllCstimerButton.addEventListener('click', () => exportSolves('cstimer', 'all'));
elements.importButton.addEventListener('click', () => elements.importFile.click());
elements.importFile.addEventListener('change', importSolves);
elements.appendImportButton.addEventListener('click', () => confirmImport('append'));
elements.replaceImportButton.addEventListener('click', () => confirmImport('replace'));
elements.statsDetailButton.addEventListener('click', openStatsDialog);
elements.manageSolvesButton.addEventListener('click', openAllSolvesDialog);
elements.markSelectedButton.addEventListener('click', openMarkPenaltyDialog);
elements.tagSelectedButton.addEventListener('click', openTagSolvesDialog);
elements.moveSelectedButton.addEventListener('click', openMoveSolvesDialog);
elements.deleteSelectedButton.addEventListener('click', deleteSelectedSolves);
elements.undoDeleteButton.addEventListener('click', undoLastDelete);
elements.clearAllButton.addEventListener('click', clearAllSolves);
elements.allMarkSelectedButton.addEventListener('click', openMarkPenaltyDialog);
elements.allTagSelectedButton.addEventListener('click', openTagSolvesDialog);
elements.allMoveSelectedButton.addEventListener('click', openMoveSolvesDialog);
elements.allDeleteSelectedButton.addEventListener('click', deleteSelectedSolves);
elements.confirmMarkPenaltyButton.addEventListener('click', markSelectedPenalty);
elements.confirmMoveButton.addEventListener('click', moveSelectedSolves);
elements.confirmTagButton.addEventListener('click', saveSelectedTags);
elements.copySolveSummaryButton.addEventListener('click', copySelectedSolveSummary);
elements.copyScrambleButton.addEventListener('click', copySelectedScramble);
elements.copyStatsSummaryButton.addEventListener('click', copyStatsSummary);
elements.saveTimeButton.addEventListener('click', saveSolveTime);
elements.saveTagsButton.addEventListener('click', saveSolveTags);
elements.saveCommentButton.addEventListener('click', saveSolveComment);
elements.saveManualEntryButton.addEventListener('click', saveManualEntry);
elements.clearBluetoothLogButton.addEventListener('click', clearBluetoothLog);
elements.copyBluetoothLogButton.addEventListener('click', copyBluetoothLog);
elements.solveDialog.addEventListener('close', () => {
  currentDetailSolveId = null;
});
elements.allSolvesDialog.addEventListener('close', () => {
  selectedSolveIds.clear();
  render();
});
elements.importDialog.addEventListener('close', () => {
  pendingImportPreview = null;
});
elements.selectAllSolves.addEventListener('change', toggleSelectAllSolves);
elements.selectAllSessionSolves.addEventListener('change', toggleSelectAllSessionSolves);
elements.allSolvesSearch.addEventListener('input', handleAllSolvesSearch);
elements.allSolvesSortBy.addEventListener('change', renderAllSolvesDialog);
elements.allSolvesSortDirection.addEventListener('change', renderAllSolvesDialog);
elements.historyRows.addEventListener('change', handleHistoryChange);
elements.historyRows.addEventListener('click', handleHistoryClick);
elements.allSolvesRows.addEventListener('change', handleHistoryChange);
elements.allSolvesRows.addEventListener('click', handleHistoryClick);

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
  state() {
    return {
      appState,
      bluetoothMoveCount: bluetoothMoves.length,
      bluetoothMoves: bluetoothMoveSequence(),
      bluetoothSolved,
      bluetoothState: elements.bluetoothStateMeta.textContent,
    };
  },
};

document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);

await bootstrap();

async function bootstrap() {
  try {
    const data = await getJson('/api/bootstrap');
    scramble = data.scramble;
    solves = data.solves;
    sessions = data.sessions;
    if (!sessions.some((session) => session.id === currentSessionId)) currentSessionId = 'default';
    elements.historyPath.textContent = data.historyPath;
    appState = 'ready';
    render();
  } catch (error) {
    appState = 'error';
    elements.statusText.textContent = '无法连接本地服务';
    elements.statusText.classList.add('error');
    elements.timerHint.textContent = error.message;
  }
}

function handleKeyDown(event) {
  if (shouldIgnoreTimerKey(event)) return;

  if (appState === 'done' && handleDoneQuickAction(event)) return;

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

function startInspection() {
  appState = 'inspection';
  inspectionStartedAt = performance.now();
  reminded = new Set();
  activePenalty = 'ok';
  cancelAnimationFrame(inspectionFrame);
  inspectionTick();
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

async function finishTiming() {
  if (appState !== 'timing') return;
  cancelAnimationFrame(timerFrame);
  const durationMs = performance.now() - startedAt;
  appState = 'saving';
  render();

  const data = await postJson('/api/solves', {
    durationMs,
    scramble: scramble.scramble,
    scrambleSource: scramble.source,
    inspectionEnabled,
    sessionId: currentSessionId,
    penalty: activePenalty,
    timerSource: finishSource,
    bluetoothMoves: bluetoothMoveSequence(),
  });

  solves = data.solves;
  selectedSolveIds.clear();
  finishSource = 'manual';
  appState = 'done';
  render();
}

async function nextSolve() {
  await loadScramble();
  activePenalty = 'ok';
  inspectionStartedAt = 0;
  appState = 'ready';
  render();
}

async function loadScramble() {
  elements.scrambleButton.disabled = true;
  try {
    const data = await postJson('/api/scramble', {});
    scramble = data.scramble;
    resetBluetoothSolveTracking();
    render();
  } finally {
    elements.scrambleButton.disabled = false;
  }
}

async function updateSolvePenalty(id, penalty) {
  const data = await requestJson(`/api/solves/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { penalty },
  });
  solves = data.solves;
  if (data.sessions) sessions = data.sessions;
  renderSolveDialog();
  render();
}

async function updateLatestSolvePenalty(penalty) {
  const solve = latestSessionSolve();
  if (!solve) return;
  await updateSolvePenalty(solve.id, penalty);
}

async function deleteSolve(id) {
  const solve = solves.find((item) => item.id === id);
  if (!solve || !confirm(`删除成绩 ${displaySolveTime(solve)}？`)) return;
  const data = await requestJson(`/api/solves/${encodeURIComponent(id)}`, { method: 'DELETE' });
  stageDeletedSolves([solve]);
  solves = data.solves;
  selectedSolveIds.delete(id);
  if (currentDetailSolveId === id) elements.solveDialog.close();
  render();
}

async function deleteLatestSolve() {
  const solve = latestSessionSolve();
  if (!solve || !confirm(`删除上一把 ${displaySolveTime(solve)}？`)) return;
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
  if (!confirm(`删除选中的 ${ids.length} 条成绩？`)) return;
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
  renderMarkPenaltyDialog();
  if (!elements.markPenaltyDialog.open) elements.markPenaltyDialog.showModal();
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

function openTagSolvesDialog() {
  if (selectedSolveIds.size === 0) return;
  renderTagSolvesDialog();
  if (!elements.tagSolvesDialog.open) elements.tagSolvesDialog.showModal();
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

function openMoveSolvesDialog() {
  if (selectedSolveIds.size === 0) return;
  renderMoveSolvesDialog();
  if (!elements.moveSolvesDialog.open) elements.moveSolvesDialog.showModal();
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
  if (ids.length === 0 || !confirm('清空当前会话的所有成绩？清空后可用撤销删除恢复本次操作。')) return;
  const deleted = solves.filter((solve) => ids.includes(solve.id));
  const data = await postJson('/api/solves/delete', { ids });
  stageDeletedSolves(deleted);
  solves = data.solves;
  selectedSolveIds.clear();
  if (ids.includes(currentDetailSolveId)) elements.solveDialog.close();
  render();
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

  downloadTextFile(
    `traintimer-solves-${suffix}.json`,
    `${JSON.stringify(createExportPayload('selected', exportHistory.sessions, exportHistory.solves), null, 2)}\n`,
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
  selectedSolveIds = elements.selectAllSolves.checked ? new Set(visibleSolves().map((solve) => solve.id)) : new Set();
  render();
}

function toggleSelectAllSessionSolves() {
  selectedSolveIds = elements.selectAllSessionSolves.checked ? new Set(filteredAllSolves().map((solve) => solve.id)) : new Set();
  render();
}

function openAllSolvesDialog() {
  elements.allSolvesSearch.value = '';
  if (!elements.allSolvesDialog.open) elements.allSolvesDialog.showModal();
  renderAllSolvesDialog();
  elements.allSolvesSearch.focus();
}

function handleAllSolvesSearch() {
  selectedSolveIds.clear();
  render();
}

function openStatsDialog() {
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
  currentSessionId = elements.sessionSelect.value;
  localStorage.setItem('trainTimer.session', currentSessionId);
  selectedSolveIds.clear();
  if (currentDetailSolveId && !filteredSolves().some((solve) => solve.id === currentDetailSolveId)) elements.solveDialog.close();
  render();
}

async function createSession() {
  const name = prompt('新会话名称', `Session ${sessions.length + 1}`);
  if (!name) return;
  const data = await postJson('/api/sessions', { name });
  sessions = data.sessions;
  solves = data.solves;
  currentSessionId = data.session.id;
  localStorage.setItem('trainTimer.session', currentSessionId);
  selectedSolveIds.clear();
  if (elements.solveDialog.open) elements.solveDialog.close();
  render();
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
  const detailId = event.target.dataset.detailId;
  if (detailId) {
    if (elements.allSolvesDialog.open) elements.allSolvesDialog.close();
    openSolveDialog(detailId);
    return;
  }

  const id = event.target.dataset.deleteId;
  if (id) deleteSolve(id);
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

  elements.solveDetailTitle.textContent = `成绩 ${displaySolveTime(solve)}`;
  const timerSource = solve.timerSource === 'bluetooth' ? '蓝牙停表' : '手动停表';
  const bluetoothMoveCount = solve.bluetoothMoveCount ?? (Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves.length : 0);
  const bluetoothTps = Number.isFinite(solve.bluetoothTps) ? `${solve.bluetoothTps.toFixed(3)} TPS` : 'TPS -';
  elements.solveDetailMeta.textContent = `${new Date(solve.createdAt).toLocaleString()} · ${timerSource} · ${solve.inspectionEnabled ? '开启观察' : '无观察'} · ${bluetoothMoveCount} 次蓝牙转动 · ${bluetoothTps} · ${solve.scrambleSource || 'unknown'}`;
  elements.solveDetailTimeInput.value = solve.duration || formatTime(solve.durationMs);
  elements.solveDetailError.textContent = '';
  elements.solveDetailScramble.textContent = solve.scramble || '-';
  elements.solveDetailComment.value = solve.comment || '';
  elements.solveDetailTagsInput.value = formatTags(solve.tags);
  elements.solveDetailBluetoothStats.textContent = `蓝牙转动 · ${bluetoothMoveCount} 次 · ${bluetoothTps}`;
  elements.solveDetailBluetoothMoves.textContent = bluetoothMoveCount > 0 ? solve.bluetoothMoves.join(' ') : '-';
  renderSolveBluetoothReplay(solve);
}

function renderSolveBluetoothReplay(solve) {
  const moves = Array.isArray(solve.bluetoothMoves) ? solve.bluetoothMoves : [];
  const canReplay = moves.length > 0 && solve.scramble;
  elements.solveBluetoothReplay.hidden = !canReplay;
  elements.solveBluetoothReplay.classList.remove('solved', 'invalid');
  elements.solveBluetoothReplayNet.replaceChildren();
  if (!canReplay) {
    elements.solveBluetoothReplayMeta.textContent = '-';
    return;
  }

  try {
    const faces = cubeStateFromScramble(`${solve.scramble} ${moves.join(' ')}`);
    const solved = isSolvedFaces(faces);
    renderCubeFacesNet(elements.solveBluetoothReplayNet, faces, 'solve-bluetooth-state-net');
    elements.solveBluetoothReplayMeta.textContent = `${moves.length} 步 · ${solved ? '已复原' : '未复原'}`;
    elements.solveBluetoothReplay.classList.toggle('solved', solved);
  } catch (error) {
    elements.solveBluetoothReplay.classList.add('invalid');
    elements.solveBluetoothReplayMeta.textContent = '转动无法复盘';
    elements.solveBluetoothReplayNet.className = 'solve-bluetooth-state-net preview-loading';
    elements.solveBluetoothReplayNet.textContent = '无法渲染';
  }
}

async function saveSolveTime() {
  if (!currentDetailSolveId) return;
  let durationMs;
  try {
    durationMs = parseTimeInput(elements.solveDetailTimeInput.value);
  } catch (error) {
    elements.solveDetailError.textContent = error.message;
    elements.solveDetailTimeInput.focus();
    return;
  }

  elements.saveTimeButton.disabled = true;
  elements.solveDetailError.textContent = '';
  try {
    const data = await requestJson(`/api/solves/${encodeURIComponent(currentDetailSolveId)}`, {
      method: 'PATCH',
      body: { durationMs },
    });
    solves = data.solves;
    if (data.sessions) sessions = data.sessions;
    renderSolveDialog();
    render();
  } catch (error) {
    elements.solveDetailError.textContent = `保存失败：${error.message}`;
  } finally {
    elements.saveTimeButton.disabled = false;
  }
}

async function saveSolveComment() {
  if (!currentDetailSolveId) return;
  const data = await requestJson(`/api/solves/${encodeURIComponent(currentDetailSolveId)}`, {
    method: 'PATCH',
    body: { comment: elements.solveDetailComment.value },
  });
  solves = data.solves;
  if (data.sessions) sessions = data.sessions;
  renderSolveDialog();
  render();
}

async function saveSolveTags() {
  if (!currentDetailSolveId) return;
  const data = await requestJson(`/api/solves/${encodeURIComponent(currentDetailSolveId)}`, {
    method: 'PATCH',
    body: { tags: parseTagsInput(elements.solveDetailTagsInput.value) },
  });
  solves = data.solves;
  if (data.sessions) sessions = data.sessions;
  renderSolveDialog();
  render();
}

async function copySelectedScramble() {
  const solve = solves.find((item) => item.id === currentDetailSolveId);
  if (!solve?.scramble) return;
  try {
    await navigator.clipboard.writeText(solve.scramble);
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
  const text = buildSolveSummary(solve, session?.name || solve.sessionId);
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
  if (!navigator.bluetooth) {
    elements.bluetoothStatus.textContent = '浏览器不支持';
    addBluetoothLog('错误', '浏览器不支持 Web Bluetooth', window.location.protocol);
    return;
  }

  try {
    if (bluetoothDevice?.gatt?.connected) {
      addBluetoothLog('连接', '请求断开设备', bluetoothDevice.name || bluetoothDevice.id || '');
      bluetoothDevice.gatt.disconnect();
      return;
    }

    setBluetoothScanningState(true, compatibilityMode);
    resetBluetoothBattery();
    addBluetoothLog('扫描', compatibilityMode ? '打开兼容设备选择器' : '打开设备选择器');
    bluetoothDevice = await navigator.bluetooth.requestDevice(bluetoothRequestOptions(compatibilityMode));

    addBluetoothLog('设备', bluetoothDevice.name || '未命名设备', bluetoothDevice.id || '');
    bluetoothDevice.addEventListener('gattserverdisconnected', () => {
      cleanupBluetoothSubscriptions();
      resetBluetoothBattery();
      elements.bluetoothStatus.textContent = '已断开';
      setBluetoothConnectedState(false);
      addBluetoothLog('连接', '设备已断开', bluetoothDevice?.name || '');
    });
    addBluetoothLog('连接', '正在连接 GATT');
    const server = await bluetoothDevice.gatt.connect();
    setBluetoothConnectedState(true);
    elements.bluetoothStatus.textContent = '读取服务...';
    addBluetoothLog('连接', 'GATT 已连接', bluetoothDevice.name || '');

    const discovery = await discoverBluetoothServices(server);
    const deviceName = bluetoothDevice.name || '已连接';
    const initDetail = discovery.writeCount > 0 ? ` · ${discovery.writeCount} 次初始化` : '';
    elements.bluetoothStatus.textContent = discovery.notifyCount > 0
      ? `${deviceName} · ${discovery.notifyCount} 路通知${initDetail}`
      : `${deviceName} · 未发现通知`;
    elements.bluetoothStatus.title = discovery.detail;
    addBluetoothLog('服务', `发现 ${discovery.serviceCount} 个服务`, `${discovery.notifyCount} 路通知 · ${discovery.writeCount} 次初始化 · ${discovery.detail}`);
  } catch (error) {
    cleanupBluetoothSubscriptions();
    resetBluetoothBattery();
    if (bluetoothDevice?.gatt?.connected) bluetoothDevice.gatt.disconnect();
    elements.bluetoothStatus.textContent = error.name === 'NotFoundError' ? '已取消' : '连接失败';
    setBluetoothConnectedState(false);
    addBluetoothLog('错误', error.name || 'BluetoothError', error.message || String(error));
    console.error(error);
  }
}

function bluetoothRequestOptions(compatibilityMode) {
  return compatibilityMode
    ? { acceptAllDevices: true, optionalServices: bluetoothOptionalServices }
    : { filters: bluetoothDeviceFilters, optionalServices: bluetoothOptionalServices };
}

function setBluetoothScanningState(scanning, compatibilityMode) {
  elements.bluetoothButton.disabled = scanning;
  elements.bluetoothAnyButton.disabled = scanning;
  elements.bluetoothStatus.textContent = compatibilityMode ? '兼容扫描中...' : '扫描中...';
}

function setBluetoothConnectedState(connected) {
  elements.bluetoothButton.disabled = false;
  elements.bluetoothButton.textContent = connected ? '断开蓝牙' : '连接蓝牙魔方';
  elements.bluetoothAnyButton.disabled = connected;
}

async function discoverBluetoothServices(server) {
  const services = await server.getPrimaryServices();
  const detail = [];
  let notifyCount = 0;
  let writeCount = 0;

  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    detail.push(`${shortUuid(service.uuid)}:${characteristics.length}`);
    addBluetoothLog('服务', shortUuid(service.uuid), `${characteristics.length} 个特征`);

    for (const characteristic of characteristics) {
      const properties = characteristic.properties;
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
    if (!updateBluetoothBattery(decodeBatteryLevel(value), shortUuid(characteristic.uuid))) {
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
    addBluetoothLog('通知', shortUuid(characteristic.uuid), characteristicProperties(characteristic.properties).join(', '));
    return true;
  } catch (error) {
    addBluetoothLog('警告', `订阅失败 ${shortUuid(characteristic.uuid)}`, error.message || String(error));
    console.warn('Bluetooth notification subscription failed', characteristic.uuid, error);
    return false;
  }
}

async function primeBluetoothService(service, characteristics) {
  const serviceUuid = String(service.uuid).toLowerCase();
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
    addBluetoothLog('警告', 'GoCube 写特征未找到', shortUuid(service.uuid));
    return 0;
  }

  let count = 0;
  count += await writeBluetoothValue(writeCharacteristic, [51], 'GoCube 状态请求');
  count += await writeBluetoothValue(writeCharacteristic, [50], 'GoCube 电量请求');
  return count;
}

async function primeGiikerBatteryService(service, characteristics) {
  const writeCharacteristic = characteristics.find((characteristic) => {
    const uuid = String(characteristic.uuid).toLowerCase();
    return uuid === bluetoothGiikerBatteryWriteUuid
      && (characteristic.properties.write || characteristic.properties.writeWithoutResponse);
  });

  if (!writeCharacteristic) {
    addBluetoothLog('警告', 'Giiker 电量写特征未找到', shortUuid(service.uuid));
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
    addBluetoothLog('写入', label, `${shortUuid(characteristic.uuid)} ${bytesToHex(payload)}`);
    return 1;
  } catch (error) {
    addBluetoothLog('警告', `${label} 写入失败`, error.message || String(error));
    return 0;
  }
}

function handleBluetoothNotification(event) {
  const characteristic = event.target;
  processBluetoothPacket(characteristic.uuid, characteristic.value, bluetoothDevice?.name || '蓝牙魔方');
}

function processBluetoothPacket(uuid, value, deviceName) {
  const hex = dataViewToHex(value);
  const label = shortUuid(uuid);
  if (isBatteryLevelCharacteristic(uuid)) {
    const batteryLevel = decodeBatteryLevel(value);
    if (updateBluetoothBattery(batteryLevel, label)) {
      elements.bluetoothStatus.textContent = `${deviceName} · 电量更新`;
      elements.bluetoothStatus.title = `${uuid} ${hex}`;
      return;
    }
  }

  if (isGiikerBatteryCharacteristic(uuid)) {
    const batteryLevel = decodeGiikerBatteryLevel(value);
    if (updateBluetoothBattery(batteryLevel, label)) {
      elements.bluetoothStatus.textContent = `${deviceName} · 电量 ${batteryLevel}%`;
      elements.bluetoothStatus.title = `${uuid} ${hex}`;
      addBluetoothLog('数据/电量', label, `${hex} · battery=${batteryLevel}%`);
      return;
    }
  }

  const decoded = decodeBluetoothMoves(value);
  if (decoded.batteryLevel != null) {
    updateBluetoothBattery(decoded.batteryLevel, decoded.protocol || label);
  }
  const parsedMoves = decoded.moves;
  const trackingMoves = parsedMoves.length > 0 && shouldTrackBluetoothMoves();
  elements.bluetoothStatus.title = `${uuid} ${hex}`;
  if (trackingMoves) addBluetoothMoves(parsedMoves, label);
  if (trackingMoves) finishTimingFromBluetooth();
  const statusDetail = parsedMoves.length > 0
    ? `${parsedMoves.join(' ')} · ${trackingMoves ? (bluetoothSolved ? '已复原' : '未复原') : '等待计时'}`
    : (decoded.batteryLevel != null ? `电量 ${decoded.batteryLevel}%` : `${label} ${hex.slice(0, 17)}`);
  elements.bluetoothStatus.textContent = `${deviceName} · ${statusDetail}`;
  addBluetoothLog(
    parsedMoves.length > 0 ? (trackingMoves ? '数据/转动' : '数据/预备转动') : '数据',
    label,
    logBluetoothPacket(hex, decoded, parsedMoves.length > 0 && !trackingMoves ? '等待计时' : ''),
  );
  console.info('Bluetooth cube notification', {
    characteristic: uuid,
    value: hex,
    moves: parsedMoves,
    tracked: trackingMoves,
  });
}

function finishTimingFromBluetooth() {
  if (appState !== 'timing' || !bluetoothSolved) return;
  finishSource = 'bluetooth';
  finishTiming();
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
  elements.bluetoothBattery.title = bluetoothBatteryLevel == null ? '未读取到标准蓝牙电量' : `标准蓝牙电量 ${bluetoothBatteryLevel}%`;
  elements.bluetoothBattery.classList.toggle('low', bluetoothBatteryLevel != null && bluetoothBatteryLevel <= 20);
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
  renderBluetoothLog();
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
  renderBluetoothMoves();
  renderBluetoothLog();
}

async function copyBluetoothLog() {
  const text = JSON.stringify({ events: bluetoothLog, moves: bluetoothMoves }, null, 2);
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

function armBluetoothSolveTracking() {
  resetBluetoothSolveTracking();
  if (bluetoothDevice?.gatt?.connected) {
    addBluetoothLog('状态', '计时开始', '蓝牙转动从此刻计入本把成绩');
  }
}

function shouldTrackBluetoothMoves() {
  return appState === 'timing';
}

function addBluetoothMoves(moves, source) {
  const now = new Date();
  bluetoothMoves.unshift(...moves.map((move) => ({
    move,
    source,
    time: now.toLocaleTimeString(),
    isoTime: now.toISOString(),
  })).reverse());
  bluetoothMoves = bluetoothMoves.slice(0, 160);
  bluetoothSolved = isBluetoothSolved();
  renderBluetoothMoves();
}

function renderBluetoothMoves() {
  elements.bluetoothMoveCount.textContent = String(bluetoothMoves.length);
  elements.bluetoothSolveStatus.parentElement.classList.toggle('solved', bluetoothSolved);
  elements.bluetoothSolveStatus.textContent = bluetoothMoves.length === 0
    ? (appState === 'timing' ? '未同步' : '等待计时')
    : (bluetoothSolved ? '已复原' : '未复原');
  if (bluetoothMoves.length === 0) {
    elements.bluetoothMoveRows.textContent = appState === 'timing' ? '暂无解析出的转动' : '计时开始后记录转动';
    elements.bluetoothMoveRows.title = '';
    renderBluetoothStatePreview();
    return;
  }

  const moveText = bluetoothMoves.slice(0, 40).map((entry) => entry.move).reverse().join(' ');
  elements.bluetoothMoveRows.textContent = moveText;
  elements.bluetoothMoveRows.title = moveText;
  renderBluetoothStatePreview();
}

function bluetoothMoveSequence() {
  return bluetoothMoves.slice().reverse().map((entry) => entry.move);
}

function resetBluetoothSolveTracking() {
  bluetoothMoves = [];
  bluetoothSolved = false;
  renderBluetoothMoves();
}

function isBluetoothSolved() {
  if (!scramble?.scramble || bluetoothMoves.length === 0) return false;
  try {
    const moves = bluetoothMoves.slice().reverse().map((entry) => entry.move).join(' ');
    return isSolvedFaces(cubeStateFromScramble(`${scramble.scramble} ${moves}`));
  } catch (error) {
    addBluetoothLog('警告', '蓝牙转动无法应用到当前打乱', error.message || String(error));
    return false;
  }
}

function renderBluetoothStatePreview() {
  elements.bluetoothStateNet.replaceChildren();
  if (!scramble?.scramble) {
    elements.bluetoothStateMeta.textContent = '等待打乱';
    elements.bluetoothStateNet.className = 'bluetooth-state-net preview-loading';
    elements.bluetoothStateNet.textContent = '暂无状态';
    return;
  }

  const moveText = bluetoothMoveSequence().join(' ');
  const stateText = [scramble.scramble, moveText].filter(Boolean).join(' ');
  try {
    const faces = cubeStateFromScramble(stateText);
    renderCubeFacesNet(elements.bluetoothStateNet, faces, 'bluetooth-state-net');
    elements.bluetoothStateMeta.textContent = bluetoothMoves.length === 0
      ? (appState === 'timing' ? '打乱状态' : '计时开始后同步')
      : `${bluetoothMoves.length} 步 · ${isSolvedFaces(faces) ? '已复原' : '未复原'}`;
  } catch (error) {
    elements.bluetoothStateMeta.textContent = '状态无效';
    elements.bluetoothStateNet.className = 'bluetooth-state-net preview-loading';
    elements.bluetoothStateNet.textContent = '无法渲染';
  }
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
  renderSessions();
  renderScramble();
  renderStats();
  renderHistory();
  renderQuickActions();
  renderAllSolvesDialog();
  renderStatsDialog();
  renderExportDialog();
  renderImportDialog();
  renderTagSolvesDialog();
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
  elements.deleteSessionButton.disabled = currentSessionId === 'default';
}

function renderTimer() {
  document.body.dataset.state = appState;
  elements.inspectionToggle.disabled = appState === 'timing' || appState === 'inspection' || appState === 'hold';

  if (appState === 'ready') {
    elements.statusText.textContent = '准备';
    elements.timerDisplay.textContent = '0.000';
    elements.timerHint.textContent = inspectionEnabled ? '按 Space 开始观察' : '长按 Space 超过 0.5s，松开开始计时';
  } else if (appState === 'inspection') {
    const elapsed = (performance.now() - inspectionStartedAt) / 1000;
    const remaining = Math.max(0, inspectionSeconds - elapsed);
    const penalty = inspectionPenaltyForElapsed(elapsed);
    elements.statusText.textContent = penalty === 'ok' ? '观察中' : '观察超时';
    elements.timerDisplay.textContent = inspectionDisplayForElapsed(elapsed);
    elements.timerHint.textContent = penalty === 'ok'
      ? '长按 Space 超过 0.5s，松开开始计时'
      : `长按 Space 后松开开始计时，本次 ${penalty.toUpperCase()}`;
  } else if (appState === 'hold') {
    elements.statusText.textContent = holdConfirmed ? '松开空格开始计时' : '长按确认中';
    elements.timerHint.textContent = '短按不会启动';
  } else if (appState === 'timing') {
    elements.statusText.textContent = '计时中';
    elements.timerDisplay.textContent = formatTime(performance.now() - startedAt);
    elements.timerHint.textContent = '按任意键结束本次计时';
  } else if (appState === 'saving') {
    elements.statusText.textContent = finishSource === 'bluetooth' ? '蓝牙复原' : '保存中';
    elements.timerHint.textContent = finishSource === 'bluetooth' ? '检测到已复原，正在写入成绩' : '正在写入成绩';
  } else if (appState === 'done') {
    elements.statusText.textContent = '已记录';
    elements.timerHint.textContent = 'Space 下一把 · O/2/D 快速改上一把';
  }
}

function renderQuickActions() {
  const solve = latestSessionSolve();
  const disabled = !solve || appState === 'timing' || appState === 'inspection' || appState === 'hold' || appState === 'saving';
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
  elements.scrambleText.textContent = scramble.scramble;
  elements.scrambleSource.textContent = scramble.source;
  renderScramblePreview(scramble.scramble);
}

function renderScramblePreview(scrambleText) {
  if (previewScrambleText === scrambleText && elements.cubeNet.hasChildNodes()) return;

  previewScrambleText = scrambleText;
  previewRequestId += 1;
  const requestId = previewRequestId;
  const cached = previewCache.get(scrambleText);

  if (cached?.svg) {
    renderTnoodleCubeSvg(cached.svg);
    return;
  }

  if (cached?.fallback) {
    renderCubeNet(scrambleText);
    return;
  }

  renderPreviewLoading();
  loadScramblePreview(scrambleText, requestId);
}

async function loadScramblePreview(scrambleText, requestId) {
  try {
    const data = await postJson('/api/scramble-preview', { scramble: scrambleText });
    if (requestId !== previewRequestId || previewScrambleText !== scrambleText) return;

    if (data.svg) {
      previewCache.set(scrambleText, { svg: data.svg });
      renderTnoodleCubeSvg(data.svg);
    } else {
      previewCache.set(scrambleText, { fallback: true });
      renderCubeNet(scrambleText);
    }
  } catch {
    if (requestId !== previewRequestId || previewScrambleText !== scrambleText) return;
    previewCache.set(scrambleText, { fallback: true });
    renderCubeNet(scrambleText);
  }
}

function renderStats() {
  const sessionSummary = summarizeSolves(filteredSolves());
  elements.countStat.textContent = sessionSummary.count ?? 0;
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

function renderStatsDialog() {
  if (!elements.statsDialog.open) return;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const sessionSolves = filteredSolves();
  const summary = summarizeSolves(sessionSolves);
  elements.statsDialogMeta.textContent = `${currentSession?.name || currentSessionId} · ${summary.count} 条成绩`;
  renderStatsTrendChart(sessionSolves);

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

async function copyStatsSummary() {
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const sessionSolves = filteredSolves();
  const summary = summarizeSolves(sessionSolves);
  const text = buildStatsSummary(currentSession?.name || currentSessionId, summary, sessionSolves);
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

function renderStatsTrendChart(sessionSolves) {
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
  const points = chartSolves
    .map((solve, index) => ({ index, solve, value: effectiveDurationMs(solve) }))
    .filter((point) => Number.isFinite(point.value));

  if (points.length === 0) {
    drawEmptyTrendChart(context, width, height);
    elements.statsChartMeta.textContent = '暂无有效成绩';
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

  context.lineWidth = 2.5;
  context.strokeStyle = '#0071e3';
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
    context.fillStyle = point.solve.penalty === '+2' ? '#bf7a00' : '#0071e3';
    context.arc(x, y, 3.8, 0, Math.PI * 2);
    context.fill();
  }

  const dnfCount = chartSolves.filter((solve) => solve.penalty === 'dnf').length;
  elements.statsChartMeta.textContent = `最近 ${chartSolves.length} 把 · 有效 ${points.length} · DNF ${dnfCount}`;
}

function drawChartGrid(context, width, height, padding, yMin, yMax) {
  context.fillStyle = '#fbfbfd';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#d2d2d7';
  context.lineWidth = 1;
  context.strokeRect(padding.left, padding.top, width - padding.left - padding.right, height - padding.top - padding.bottom);

  context.fillStyle = '#6e6e73';
  context.font = '12px Inter, system-ui, sans-serif';
  context.textAlign = 'right';
  context.textBaseline = 'middle';

  for (let line = 0; line <= 3; line += 1) {
    const ratio = line / 3;
    const y = padding.top + ratio * (height - padding.top - padding.bottom);
    const value = yMax - ratio * (yMax - yMin);
    context.strokeStyle = line === 3 ? '#d2d2d7' : '#ededf0';
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(formatTime(value), padding.left - 8, y);
  }
}

function drawEmptyTrendChart(context, width, height) {
  context.fillStyle = '#fbfbfd';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#d2d2d7';
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
  context.fillStyle = '#6e6e73';
  context.font = '14px Inter, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('暂无有效成绩', width / 2, height / 2);
}

function renderExportDialog() {
  if (!elements.exportDialog.open) return;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const sessionCount = filteredSolves().length;
  elements.exportDialogMeta.textContent = `${currentSession?.name || currentSessionId} · 当前会话 ${sessionCount} 条 · 选中 ${selectedSolveIds.size} 条 · 全部 ${solves.length} 条`;
  elements.exportSessionJsonButton.disabled = sessionCount === 0;
  elements.exportSessionCsvButton.disabled = sessionCount === 0;
  elements.exportSessionCstimerButton.disabled = sessionCount === 0;
  elements.exportSelectedJsonButton.disabled = selectedSolveIds.size === 0;
  elements.exportSelectedCsvButton.disabled = selectedSolveIds.size === 0;
  elements.exportSelectedCstimerButton.disabled = selectedSolveIds.size === 0;
  elements.exportAllJsonButton.disabled = solves.length === 0;
  elements.exportAllCsvButton.disabled = solves.length === 0;
  elements.exportAllCstimerButton.disabled = solves.length === 0;
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
  if (source === 'csv') return 'TrainTimer CSV';
  if (source === 'json') return 'TrainTimer JSON';
  return '未知格式';
}

function renderMarkPenaltyDialog() {
  if (!elements.markPenaltyDialog.open && selectedSolveIds.size === 0) return;
  const selectedSolves = solves.filter((solve) => selectedSolveIds.has(solve.id));
  elements.markPenaltyMeta.textContent = `选中 ${selectedSolveIds.size} 条`;
  const penalties = new Set(selectedSolves.map((solve) => solve.penalty));
  if (penalties.size === 1) elements.markPenaltySelect.value = selectedSolves[0]?.penalty || 'ok';
  elements.confirmMarkPenaltyButton.disabled = selectedSolveIds.size === 0;
}

function renderTagSolvesDialog() {
  if (!elements.tagSolvesDialog.open && selectedSolveIds.size === 0) return;
  const selectedSolves = solves.filter((solve) => selectedSolveIds.has(solve.id));
  const tagSets = selectedSolves.map((solve) => formatTags(solve.tags));
  const sharedTags = tagSets.length > 0 && tagSets.every((value) => value === tagSets[0]) ? tagSets[0] : '';
  elements.tagSolvesMeta.textContent = sharedTags
    ? `选中 ${selectedSolveIds.size} 条 · 当前 ${sharedTags}`
    : `选中 ${selectedSolveIds.size} 条 · 输入新标签，留空可清除`;
  elements.tagSolvesInput.value = sharedTags;
  elements.confirmTagButton.disabled = selectedSolveIds.size === 0;
}

function renderMoveSolvesDialog() {
  if (!elements.moveSolvesDialog.open && selectedSolveIds.size === 0) return;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const targetSessions = sessions.filter((session) => session.id !== currentSessionId);
  elements.moveSolvesMeta.textContent = targetSessions.length === 0
    ? '请先新建另一个会话'
    : `${currentSession?.name || currentSessionId} · 选中 ${selectedSolveIds.size} 条`;
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

function openManualEntryDialog() {
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  elements.manualEntryMeta.textContent = currentSession?.name || currentSessionId;
  elements.manualTimeInput.value = '';
  elements.manualPenaltySelect.value = 'ok';
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
  try {
    durationMs = parseTimeInput(elements.manualTimeInput.value);
  } catch (error) {
    elements.manualEntryError.textContent = error.message;
    elements.manualTimeInput.focus();
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
      scramble: scrambleText,
      scrambleSource,
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
  } catch (error) {
    elements.manualEntryError.textContent = `保存失败：${error.message}`;
  } finally {
    elements.saveManualEntryButton.disabled = false;
  }
}

function renderHistory() {
  const sessionSolves = filteredSolves();
  const latest = sessionSolves.slice(-3).reverse();
  renderHistoryControls();
  elements.historyRows.replaceChildren(
    ...latest.map((solve, index) => renderSolveRow(solve, sessionSolves.length - index, sessionSolves)),
  );
}

function renderAllSolvesDialog() {
  if (!elements.allSolvesDialog.open) return;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const sessionSolves = filteredSolves();
  const listedSolves = filteredAllSolves();
  elements.allSolvesMeta.textContent = allSolvesQuery()
    ? `${currentSession?.name || currentSessionId} · 筛选 ${listedSolves.length} / ${sessionSolves.length} 条`
    : `${currentSession?.name || currentSessionId} · ${sessionSolves.length} 条`;
  elements.allSolvesRows.replaceChildren(
    ...listedSolves.map((solve) => renderSolveRow(solve, sessionSolves.indexOf(solve) + 1, sessionSolves)),
  );
  if (listedSolves.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = allSolvesQuery() ? '没有匹配的成绩' : '当前会话暂无成绩';
    elements.allSolvesRows.append(empty);
  }
  renderAllSolvesControls();
}

function renderSolveRow(solve, solveNumber, sessionSolves) {
  const solveIndex = Math.max(0, solveNumber - 1);
  const ao5 = rollingAverageAt(sessionSolves, solveIndex, 5);
  const ao12 = rollingAverageAt(sessionSolves, solveIndex, 12);
  const row = document.createElement('div');
  row.className = 'history-row';
  row.innerHTML = `
        <span><input class="solve-check" data-id="${solve.id}" type="checkbox" ${selectedSolveIds.has(solve.id) ? 'checked' : ''} aria-label="选择第 ${solveNumber} 条成绩" /></span>
        <span>${solveNumber}</span>
        <span class="time" title="${escapeHtml(solve.duration)}">${displaySolveTime(solve)}</span>
        <span class="rolling-average" title="第 ${solveNumber} 条后的 ao5">${timeOrDash(ao5)}</span>
        <span class="rolling-average" title="第 ${solveNumber} 条后的 ao12">${timeOrDash(ao12)}</span>
        <span>
          <select class="penalty-select" data-id="${solve.id}" aria-label="成绩罚时">
            <option value="ok" ${solve.penalty === 'ok' ? 'selected' : ''}>OK</option>
            <option value="+2" ${solve.penalty === '+2' ? 'selected' : ''}>+2</option>
            <option value="dnf" ${solve.penalty === 'dnf' ? 'selected' : ''}>DNF</option>
          </select>
        </span>
        <span>${new Date(solve.createdAt).toLocaleString()}</span>
        <span class="row-actions">
          <button data-detail-id="${solve.id}" type="button">详情</button>
          <button data-delete-id="${solve.id}" type="button">删</button>
        </span>
      `;
  return row;
}

function renderHistoryControls() {
  const canMoveSelected = selectedSolveIds.size > 0 && sessions.some((session) => session.id !== currentSessionId);
  elements.markSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.tagSelectedButton.disabled = selectedSolveIds.size === 0;
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
  } else if (pendingImportSnapshot?.mode === 'mark-penalty') {
    elements.undoDeleteButton.textContent = '撤销标记';
    elements.undoDeleteButton.title = `恢复标记前的数据：${pendingImportSnapshot.fileName || '选中成绩'}`;
  } else if (pendingImportSnapshot?.mode === 'tag-solves') {
    elements.undoDeleteButton.textContent = '撤销标签';
    elements.undoDeleteButton.title = `恢复标签修改前的数据：${pendingImportSnapshot.fileName || '选中成绩'}`;
  } else if (canUndoSnapshot) {
    elements.undoDeleteButton.textContent = '撤销导入';
    elements.undoDeleteButton.title = `恢复导入前的数据：${pendingImportSnapshot.fileName || '导入文件'}`;
  } else {
    elements.undoDeleteButton.textContent = '撤销删除';
    elements.undoDeleteButton.title = canUndoDelete ? `恢复 ${pendingDeletedSolves.length} 条刚删除的成绩` : '没有可撤销的操作';
  }
  elements.clearAllButton.disabled = filteredSolves().length === 0;
  elements.manageSolvesButton.disabled = filteredSolves().length === 0;
  const visibleIds = visibleSolves().map((solve) => solve.id);
  elements.selectAllSolves.checked = visibleIds.length > 0 && visibleIds.every((id) => selectedSolveIds.has(id));
  elements.selectAllSolves.indeterminate = visibleIds.some((id) => selectedSolveIds.has(id)) && !elements.selectAllSolves.checked;
}

function renderAllSolvesControls() {
  const sessionIds = filteredAllSolves().map((solve) => solve.id);
  elements.allMarkSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.allTagSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.allMoveSelectedButton.disabled = selectedSolveIds.size === 0 || !sessions.some((session) => session.id !== currentSessionId);
  elements.allDeleteSelectedButton.disabled = selectedSolveIds.size === 0;
  elements.selectAllSessionSolves.checked = sessionIds.length > 0 && sessionIds.every((id) => selectedSolveIds.has(id));
  elements.selectAllSessionSolves.indeterminate = sessionIds.some((id) => selectedSolveIds.has(id)) && !elements.selectAllSessionSolves.checked;
}

function renderSelectionControls() {
  renderHistoryControls();
  if (elements.allSolvesDialog.open) renderAllSolvesControls();
  if (elements.exportDialog.open) renderExportDialog();
  if (elements.markPenaltyDialog.open) renderMarkPenaltyDialog();
  if (elements.tagSolvesDialog.open) renderTagSolvesDialog();
  if (elements.moveSolvesDialog.open) renderMoveSolvesDialog();
}

function visibleSolves() {
  return filteredSolves().slice(-3).reverse();
}

function filteredSolves() {
  return solves.filter((solve) => solve.sessionId === currentSessionId);
}

function filteredAllSolves() {
  const query = allSolvesQuery();
  const listedSolves = query
    ? filteredSolves().filter((solve) => searchableSolveText(solve).includes(query))
    : filteredSolves();
  return sortAllSolves(listedSolves);
}

function allSolvesQuery() {
  return elements.allSolvesSearch.value.trim().toLowerCase();
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
    formatTags(solve.tags),
    solve.comment,
    solve.scramble,
    solve.scrambleSource,
    new Date(solve.createdAt).toLocaleString(),
  ].join(' ').toLowerCase();
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
    renderCubeNet(previewScrambleText);
    return;
  }

  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'TNoodle 打乱结果预览');
  svg.classList.add('cube-svg');
  elements.cubeNet.className = 'cube-net official-preview';
  elements.cubeNet.replaceChildren(document.importNode(svg, true));
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
        sticker.style.background = faces[face][row][col].color;
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

function timeOrDash(value) {
  return value == null ? '-' : formatTime(value);
}

function numberOrDash(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function currentInspectionPenalty() {
  if (!inspectionEnabled || inspectionStartedAt === 0) return 'ok';
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
  const response = await fetch(url);
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
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
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
