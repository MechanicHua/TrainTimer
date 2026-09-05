import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = join(import.meta.dirname, '..');
const windowsRoot = join(projectRoot, 'windows', 'TrainTimer.Native');

test('Windows launcher builds as a native x64 Win32 application', async () => {
  const project = await readFile(join(windowsRoot, 'TrainTimer.Native.vcxproj'), 'utf8');
  const manifest = await readFile(join(windowsRoot, 'TrainTimer.manifest'), 'utf8');
  assert.match(project, /<ConfigurationType>Application<\/ConfigurationType>/);
  assert.match(project, /<PlatformToolset>v143<\/PlatformToolset>/);
  assert.match(project, /<RuntimeLibrary>MultiThreaded<\/RuntimeLibrary>/);
  assert.match(project, /<SubSystem>Windows<\/SubSystem>/);
  assert.match(project, /<Manifest Include="TrainTimer\.manifest" \/>/);
  assert.match(project, /TRAINTIMER_MSVC_MANIFEST/);
  assert.doesNotMatch(project, /<GenerateManifest>false<\/GenerateManifest>/);
  assert.doesNotMatch(project, /UseWPF|TargetFramework|SelfContained|PublishSingleFile/);
  assert.match(manifest, /PerMonitorV2/);
  assert.match(manifest, /requestedExecutionLevel level="asInvoker"/);
});
test('native Windows UI preserves the launcher control surface and accessibility labels', async () => {
  const source = await readFile(join(windowsRoot, 'launcher.c'), 'utf8');
  for (const label of [
    'TrainTimer 已就绪',
    '网页地址',
    '浏览器',
    '访问范围',
    '停止服务',
    '重新启动',
    '在 Chrome 中打开',
  ]) {
    assert.ok(source.includes(label), `missing Windows launcher label: ${label}`);
  }
  assert.match(source, /WS_TABSTOP \| BS_OWNERDRAW/);
  assert.match(source, /DrawFocusRect/);
  assert.match(source, /DetectDarkMode/);
  assert.match(source, /WM_DPICHANGED/);
});

test('native launcher validates TrainTimer health and owns only its child process tree', async () => {
  const source = await readFile(join(windowsRoot, 'launcher.c'), 'utf8');
  assert.match(source, /#define BASE_PORT 3211/);
  assert.match(source, /#define MANAGED_PORT_COUNT 30/);
  assert.match(source, /L"\/api\/health"/);
  assert.match(source, /"\\\"app\\\":\\\"TrainTimer\\\""/);
  assert.match(source, /Resources\\\\node\\\\node\.exe/);
  assert.match(source, /App Paths\\\\chrome\.exe/);
  assert.match(source, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
  assert.match(source, /AssignProcessToJobObject/);
  assert.match(source, /CREATE_NO_WINDOW \| CREATE_SUSPENDED/);
});

test('Windows packaging uses one native UI runtime and a compressed installer', async () => {
  const powershell = await readFile(join(projectRoot, 'scripts', 'build-windows-launcher.ps1'), 'utf8');
  const shell = await readFile(join(projectRoot, 'scripts', 'build-windows-launcher.sh'), 'utf8');
  const installer = await readFile(join(projectRoot, 'windows', 'installer', 'TrainTimer.iss'), 'utf8');
  const combined = `${powershell}\n${shell}`;
  for (const required of ['package.json', '"src"', '"public"', '"vendor"']) {
    assert.ok(combined.includes(required), `missing packaged runtime item: ${required}`);
  }
  assert.doesNotMatch(combined, /node_modules[\\/]three/);
  assert.doesNotMatch(combined, /dotnet publish|SelfContained|TrainTimer\.Launcher\.csproj/);
  assert.match(installer, /Compression=lzma2\/ultra64/);
  assert.match(installer, /SolidCompression=yes/);
  assert.match(installer, /PrivilegesRequired=lowest/);
  assert.match(installer, /MessagesFile: "compiler:Default\.isl"/);
  assert.doesNotMatch(installer, /ChineseSimplified\.isl/);
});
