#!/usr/bin/env node
import readline from 'node:readline';
import { generateScramble } from './scramble.js';
import { formatTime, getHistoryPath, loadSolves, saveSolve, summarizeSolves } from './history.js';

const inspectionSeconds = 15;
const inspectionDnfSeconds = 17;
const holdToStartMs = 500;
const spaceReleaseQuietMs = 180;
const shortPressCancelQuietMs = holdToStartMs + 25;
const reminderSeconds = new Set([8, 12]);
const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  printHelp();
  process.exit(0);
}

if (args.has('history')) {
  await printHistory();
  process.exit(0);
}

const inspectionEnabled = args.has('--inspection') || (!args.has('--no-inspection') && process.env.TRAIN_TIMER_INSPECTION === '1');

await runTimer({ inspectionEnabled });

async function runTimer({ inspectionEnabled }) {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const solves = await loadSolves();
  const summary = summarizeSolves(solves);
  let scrambleResult = await generateScramble();
  let state = 'ready';
  let startedAt = null;
  let inspectionStartedAt = null;
  let latestDuration = null;
  let inspectionInterval = null;
  let timerInterval = null;
  let holdToStartStartedAt = null;
  let holdToStartLastSpaceAt = null;
  let holdToStartRepeatCount = 0;
  let holdToStartReady = false;
  let holdToStartMonitor = null;
  let lastRenderedScreen = null;
  let reminded = new Set();
  let activePenalty = 'ok';

  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();

  render();

  stdin.on('keypress', async (_chunk, key = {}) => {
    if (key.ctrl && key.name === 'c') {
      cleanup();
      process.exit(0);
    }

    if (state === 'timing') {
      await finishTiming();
      return;
    }

    if (key.name === 'q' || key.name === 'escape') {
      cleanup();
      process.exit(0);
    }

    if (state === 'ready' && key.name === 'space') {
      if (inspectionEnabled) {
        startInspection();
      } else {
        armHoldToStart();
      }
      return;
    }

    if (state === 'inspection' && key.name === 'space') {
      armHoldToStart();
      return;
    }

    if (state === 'hold-to-start' && key.name === 'space') {
      markHoldSpaceRepeat();
      return;
    }

    if (state === 'hold-to-start') {
      cancelHoldToStart();
      return;
    }

    if (state === 'done' && key.name === 'space') {
      latestDuration = null;
      inspectionStartedAt = null;
      activePenalty = 'ok';
      scrambleResult = await generateScramble();
      state = 'ready';
      render();
    }
  });

  function startInspection() {
    cancelHoldToStart();
    state = 'inspection';
    inspectionStartedAt = performance.now();
    reminded = new Set();
    activePenalty = 'ok';
    render();
    inspectionInterval = setInterval(() => {
      const elapsedSeconds = Math.floor((performance.now() - inspectionStartedAt) / 1000);
      if (reminderSeconds.has(elapsedSeconds) && !reminded.has(elapsedSeconds)) {
        reminded.add(elapsedSeconds);
        stdout.write('\x07');
      }
      render();
    }, 100);
  }

  function armHoldToStart() {
    if (holdToStartMonitor) return;
    state = 'hold-to-start';
    holdToStartStartedAt = performance.now();
    holdToStartLastSpaceAt = holdToStartStartedAt;
    holdToStartRepeatCount = 1;
    holdToStartReady = false;
    render();
    holdToStartMonitor = setInterval(updateHoldToStart, 25);
  }

  function markHoldSpaceRepeat() {
    holdToStartRepeatCount += 1;
    holdToStartLastSpaceAt = performance.now();
    if (!holdToStartReady && performance.now() - holdToStartStartedAt >= holdToStartMs) {
      holdToStartReady = true;
      render();
    }
  }

  function updateHoldToStart() {
    const now = performance.now();
    const quietMs = now - holdToStartLastSpaceAt;

    if (holdToStartReady && quietMs >= spaceReleaseQuietMs) {
      startTiming();
      return;
    }

    if (!holdToStartReady && quietMs >= shortPressCancelQuietMs) {
      cancelHoldToStart();
    }
  }

  function cancelHoldToStart({ restoreState = true } = {}) {
    if (holdToStartMonitor) clearInterval(holdToStartMonitor);
    holdToStartMonitor = null;
    holdToStartStartedAt = null;
    holdToStartLastSpaceAt = null;
    holdToStartRepeatCount = 0;
    holdToStartReady = false;
    if (restoreState && state === 'hold-to-start') {
      state = inspectionEnabled ? 'inspection' : 'ready';
      render();
    }
  }

  function startTiming() {
    cancelHoldToStart({ restoreState: false });
    if (inspectionInterval) clearInterval(inspectionInterval);
    inspectionInterval = null;
    activePenalty = currentInspectionPenalty();
    state = 'timing';
    startedAt = performance.now();
    render();
    timerInterval = setInterval(render, 32);
  }

  async function finishTiming() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    latestDuration = performance.now() - startedAt;
    const solve = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      durationMs: Math.round(latestDuration),
      duration: formatTime(latestDuration),
      scramble: scrambleResult.scramble,
      scrambleSource: scrambleResult.source,
      inspectionEnabled,
      penalty: activePenalty,
    };
    const nextSolves = await saveSolve(solve);
    Object.assign(summary, summarizeSolves(nextSolves));
    state = 'done';
    render();
  }

  function render() {
    const screen = buildScreen();
    if (screen === lastRenderedScreen) return;
    lastRenderedScreen = screen;
    stdout.write(`\x1b[2J\x1b[H${screen}`);
  }

  function buildScreen() {
    const lines = [
      'TrainTimer - 命令行魔方计时器',
      '='.repeat(36),
      '',
      `观察时间: ${inspectionEnabled ? '开启' : '关闭'}`,
      `打乱来源: ${scrambleResult.source}`,
    ];

    if (scrambleResult.warning) lines.push(`提示: ${scrambleResult.warning}`);
    lines.push(`打乱公式: ${scrambleResult.scramble}`, '');

    if (state === 'ready') {
      lines.push('状态: 准备');
      lines.push(inspectionEnabled ? '按空格开始 15s 观察。' : '持续按住空格超过 0.5s 后松开开始计时。');
    } else if (state === 'inspection') {
      const elapsed = (performance.now() - inspectionStartedAt) / 1000;
      const penalty = inspectionPenaltyForElapsed(elapsed);
      lines.push(`状态: ${penalty === 'ok' ? '观察中' : '观察超时'} ${inspectionDisplayForElapsed(elapsed)}`);
      lines.push(penalty === 'ok'
        ? '持续按住空格超过 0.5s 后松开开始计时；8s、12s 会响铃提醒。'
        : `持续按住空格超过 0.5s 后松开开始计时；本次 ${penalty.toUpperCase()}。`);
    } else if (state === 'hold-to-start') {
      lines.push(`状态: ${holdToStartReady ? '松开空格开始计时' : '长按确认中'}`);
      lines.push('短按不会启动。');
    } else if (state === 'timing') {
      lines.push(`状态: 计时中 ${formatTime(performance.now() - startedAt)}`);
      lines.push('按任意键结束本次计时。');
    } else if (state === 'done') {
      lines.push(`状态: 已记录 ${displayLatestTime()}`);
      lines.push('按空格进入下一把；按 q 退出。');
    }

    lines.push(
      '',
      '成绩统计',
      `次数: ${summary.count}`,
      `最佳: ${summary.best == null ? '-' : formatTime(summary.best)}`,
      `平均: ${summary.average == null ? '-' : formatTime(summary.average)}`,
      `最近: ${summary.latest == null ? '-' : formatTime(summary.latest)}`,
      '',
      `数据文件: ${getHistoryPath()}`,
      '退出: q / Esc / Ctrl+C',
    );

    return `${lines.join('\n')}\n`;
  }

  function cleanup() {
    cancelHoldToStart();
    if (inspectionInterval) clearInterval(inspectionInterval);
    if (timerInterval) clearInterval(timerInterval);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdout.write('\n');
  }

  function currentInspectionPenalty() {
    if (!inspectionEnabled || inspectionStartedAt == null) return 'ok';
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
    return `${Math.max(0, inspectionSeconds - elapsedSeconds).toFixed(1)}s`;
  }

  function displayLatestTime() {
    if (activePenalty === 'dnf') return 'DNF';
    if (activePenalty === '+2') return `${formatTime(latestDuration + 2000)}+`;
    return formatTime(latestDuration);
  }
}

async function printHistory() {
  const solves = await loadSolves();
  const summary = summarizeSolves(solves);
  console.log(`数据文件: ${getHistoryPath()}`);
  console.log(`次数: ${summary.count}`);
  console.log(`最佳: ${summary.best == null ? '-' : formatTime(summary.best)}`);
  console.log(`平均: ${summary.average == null ? '-' : formatTime(summary.average)}`);
  console.log('');

  for (const solve of solves.slice(-20).reverse()) {
    console.log(`${solve.createdAt}  ${solve.duration}  ${solve.scramble}`);
  }
}

function printHelp() {
  console.log(`TrainTimer

用法:
  npm start
  npm start -- --inspection
  npm start -- --no-inspection
  npm start -- history

按键:
  Space    开始观察；正式计时时持续按住超过 0.5s 后松开启动
  任意键   计时中结束并记录成绩
  q/Esc    退出

TNoodle:
  默认使用 vendor/tnoodle-cli-1.1.1.jar
  TNOODLE_CMD=/path/to/tnoodle npm start
  TNOODLE_JAR=/path/to/tnoodle-cli.jar npm start
  TNOODLE_PUZZLE=three npm start
`);
}
