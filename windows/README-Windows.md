# TrainTimer Windows 启动器

## 使用

1. 解压整个 `TrainTimer-Windows-win-x64.zip`，不要只复制 EXE。
2. 双击 `TrainTimer.exe`。
3. 启动器会在 `127.0.0.1:3211–3240` 中选择可用端口，服务就绪后自动打开 Google Chrome。
4. 关闭启动器窗口时，由该窗口启动的本地服务也会停止。

启动日志位于：

```text
%LOCALAPPDATA%\TrainTimer\launcher.log
```

## Node.js

启动器按以下顺序查找 Node.js：

1. 环境变量 `TRAIN_TIMER_NODE` 指向的 `node.exe`
2. 程序目录内的 `Resources\node\node.exe`
3. Windows 常见 Node.js 安装目录
4. `PATH` 中的 `node.exe`

正式发布包已附带 `Resources\node\node.exe`，用户无需另外安装 Node.js。只有自行构建且没有传入 Node ZIP 时，启动器才会回退到系统 Node.js。

## 构建

需要 .NET 10 SDK。在 PowerShell 中运行：

```powershell
.\scripts\build-windows-launcher.ps1
```

打包便携 Node.js：

```powershell
.\scripts\build-windows-launcher.ps1 -NodeArchivePath C:\Downloads\node-v24-win-x64.zip
```

输出目录：

```text
dist\TrainTimer-Windows
dist\TrainTimer-Windows-win-x64.zip
```

## 系统行为

- Windows 11：使用系统 Mica 背景和圆角窗口。
- 较旧 Windows：自动退回标准 WPF 窗口背景，不影响服务功能。
- 支持 Windows 浅色和深色应用模式。
- 已运行的外部 TrainTimer 服务可以连接和打开，但启动器不会强制结束不属于它的进程。
