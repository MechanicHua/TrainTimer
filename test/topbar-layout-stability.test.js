import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stylesUrl = new URL('../public/styles.css', import.meta.url);
const indexUrl = new URL('../public/index.html', import.meta.url);
const appUrl = new URL('../public/app.js', import.meta.url);

test('header controls use the grouped reference layout without changing their ids', async () => {
  const [stylesSource, indexSource] = await Promise.all([
    readFile(stylesUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
  ]);

  assert.match(
    stylesSource,
    /\.app-shell\s*\{[^}]*grid-template-rows:\s*76px\s+minmax\(116px,\s*auto\)/s,
  );
  assert.match(
    stylesSource,
    /\.topbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(124px,\s*1fr\)[^}]*border-radius:\s*16px;[^}]*backdrop-filter:\s*blur\(18px\)/s,
  );
  assert.match(
    stylesSource,
    /\.session-select-control\s*\{[^}]*width:\s*164px;/s,
  );
  assert.match(
    stylesSource,
    /\.brand-box\s*\{(?=[^}]*align-items:\s*baseline;)(?=[^}]*flex-direction:\s*row;)[^}]*\}/s,
  );
  assert.match(
    stylesSource,
    /\.session-box\s*\{(?=[^}]*align-items:\s*center;)[^}]*\}/s,
  );
  assert.match(
    stylesSource,
    /\.session-box \.topbar-icon-action\s*\{(?=[^}]*grid-template-rows:\s*38px;)(?=[^}]*min-height:\s*38px;)[^}]*\}/s,
  );
  assert.match(
    stylesSource,
    /\.topbar-icon-frame\s*\{(?=[^}]*width:\s*38px;)(?=[^}]*height:\s*38px;)[^}]*box-shadow:\s*var\(--topbar-edge-glow\);/s,
  );
  assert.match(
    stylesSource,
    /\.topbar :is\([\s\S]*?\.bluetooth-status[\s\S]*?\)\s*\{[^}]*box-shadow:\s*var\(--topbar-edge-glow\);/s,
  );
  assert.match(
    stylesSource,
    /\.bluetooth-box\s*\{[^}]*border-left:\s*1px solid/s,
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*1120px\)[\s\S]*?grid-template-areas:\s*"brand session puzzle inspection"\s*"bluetooth bluetooth bluetooth bluetooth";/s,
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*980px\)[\s\S]*?grid-template-areas:\s*"brand session session"\s*"puzzle inspection bluetooth";/s,
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*720px\)[\s\S]*?grid-template-areas:\s*"brand brand"\s*"session session"\s*"puzzle inspection"\s*"bluetooth bluetooth";[\s\S]*?\.session-box\s*\{[^}]*flex-wrap:\s*nowrap;/s,
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*720px\)[\s\S]*?\.bluetooth-box\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow:\s*hidden;/s,
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*720px\)[\s\S]*?\.session-box select[\s\S]*?min-height:\s*38px;[\s\S]*?\.topbar-icon-frame\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;/s,
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*980px\) and \(max-height:\s*620px\)[\s\S]*?\.session-box select[\s\S]*?min-height:\s*38px;/s,
  );

  for (const id of [
    'sessionSelect',
    'newSessionButton',
    'duplicateSessionButton',
    'mergeSessionButton',
    'renameSessionButton',
    'timerSettingsButton',
    'deleteSessionButton',
    'inspectionToggle',
    'bluetoothButton',
    'bluetoothAnyButton',
    'bluetoothReconnectButton',
    'bluetoothDisconnectButton',
    'bluetoothLogButton',
    'bluetoothStatus',
  ]) {
    assert.match(indexSource, new RegExp(`id=["']${id}["']`), `${id} should remain wired`);
  }

  assert.match(indexSource, /class="session-grid-icon"/);
  assert.match(indexSource, /id="newSessionButton"[^>]*aria-label="新会话"[^>]*title="新会话"/);
  assert.match(indexSource, /id="duplicateSessionButton"[^>]*aria-label="复制会话"/);
  assert.match(indexSource, /id="renameSessionButton"[^>]*aria-label="重命名会话"/);
  assert.match(indexSource, /id="timerSettingsButton"[^>]*aria-label="计时器设置"/);
  assert.doesNotMatch(indexSource, /class="topbar-action-label"/);
  assert.match(indexSource, /id="bluetoothAnyButton"[^>]*aria-label="兼容扫描"/);
  assert.match(indexSource, /id="bluetoothReconnectButton"[^>]*aria-label="重新连接蓝牙魔方"/);
  assert.match(indexSource, /id="bluetoothDisconnectButton"[^>]*aria-label="断开蓝牙魔方"/);
  assert.match(indexSource, /id="bluetoothLogButton"[^>]*aria-label="蓝牙日志"/);
  assert.match(indexSource, /id="bluetoothButton"[\s\S]*?class="topbar-control-label">连接蓝牙魔方</);
  assert.match(indexSource, /class="inspection-check"/);
});

test('dynamic bluetooth rendering preserves the grouped button and connection indicator', async () => {
  const appSource = await readFile(appUrl, 'utf8');

  assert.match(appSource, /setTopbarControlLabel\(elements\.bluetoothButton,\s*'连接蓝牙魔方'\)/);
  assert.match(appSource, /closest\('\.bluetooth-status'\)\?\.classList\.toggle\('connected',\s*connected\)/);
  assert.match(appSource, /function setTopbarControlLabel\(button,\s*label\)[\s\S]*?querySelector\('\.topbar-control-label'\)/);
});
