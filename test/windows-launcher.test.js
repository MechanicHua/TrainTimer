import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = join(import.meta.dirname, '..');
const windowsRoot = join(projectRoot, 'windows', 'TrainTimer.Launcher');

test('Windows launcher targets a self-contained WPF win-x64 build', async () => {
  const project = await readFile(join(windowsRoot, 'TrainTimer.Launcher.csproj'), 'utf8');
  assert.match(project, /<TargetFramework>net10\.0-windows<\/TargetFramework>/);
  assert.match(project, /<UseWPF>true<\/UseWPF>/);
  assert.match(project, /<EnableWindowsTargeting>true<\/EnableWindowsTargeting>/);
  assert.match(project, /<RuntimeIdentifier>win-x64<\/RuntimeIdentifier>/);
  assert.match(project, /<SelfContained>true<\/SelfContained>/);
  assert.match(project, /<PublishSingleFile>true<\/PublishSingleFile>/);
});

test('Windows launcher mirrors the native service control surface', async () => {
  const xaml = await readFile(join(windowsRoot, 'MainWindow.xaml'), 'utf8');
  const appXaml = await readFile(join(windowsRoot, 'App.xaml'), 'utf8');
  const controller = await readFile(join(windowsRoot, 'LauncherController.cs'), 'utf8');
  const launcherSource = `${appXaml}\n${xaml}\n${controller}`;
  for (const label of ['TrainTimer 已就绪', '网页地址', '浏览器', '访问范围', '停止服务', '重新启动', '在 Chrome 中打开']) {
    assert.ok(launcherSource.includes(label), `missing Windows launcher label: ${label}`);
  }
  assert.match(launcherSource, /Segoe UI Variable/);
  assert.match(xaml, /Assets\/TrainTimerIcon\.png/);
});

test('Windows launcher manages health checks, ports, Chrome, and owned process shutdown', async () => {
  const controller = await readFile(join(windowsRoot, 'LauncherController.cs'), 'utf8');
  assert.match(controller, /BasePort = 3211/);
  assert.match(controller, /ManagedPortCount = 30/);
  assert.match(controller, /api\/health/);
  assert.match(controller, /Resources", "node", "node\.exe/);
  assert.match(controller, /App Paths\\chrome\.exe/);
  assert.match(controller, /Kill\(entireProcessTree: true\)/);
});

test('Windows packaging includes the complete local runtime', async () => {
  const script = await readFile(join(projectRoot, 'scripts', 'build-windows-launcher.ps1'), 'utf8');
  for (const required of ['package.json', '"src"', '"public"', '"vendor"', 'node_modules\\three', 'Compress-Archive']) {
    assert.ok(script.includes(required), `missing packaged runtime item: ${required}`);
  }
});
