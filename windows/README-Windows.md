# TrainTimer Windows 启动器

Windows 版现在使用原生 Win32 启动器，不再携带 .NET/WPF 运行时。正式分发包仍会内置 Node.js，因为 TrainTimer 的服务端逻辑由 Node.js 运行；用户电脑不需要预先安装 Node.js。

## 推荐的分发形式

- `TrainTimer-Windows-x64-Setup.exe`：推荐给普通用户。安装到当前用户目录，不需要管理员权限，并创建开始菜单快捷方式。
- `TrainTimer-Windows-win-x64.zip`：免安装便携包。需要完整解压后再运行，不能只复制其中的 `TrainTimer.exe`。

安装包使用 Inno Setup 的 LZMA2 固实压缩，因此下载大小会明显小于安装后的目录大小。`TrainTimer.exe` 只是轻量原生控制窗口；主要体积来自包内的 `Resources\node\node.exe` 和网页资源。

## 使用

1. 安装或完整解压 Windows 包。
2. 启动 `TrainTimer.exe`。
3. 启动器会在 `127.0.0.1:3211–3240` 中选择可用端口，服务就绪后自动打开 Google Chrome；未安装 Chrome 时使用系统默认浏览器。
4. 关闭启动器窗口时，仅停止由该窗口创建的服务，不会结束它连接到的外部 TrainTimer 服务。

启动日志位于：

```text
%LOCALAPPDATA%\TrainTimer\launcher.log
```

## 包内结构

```text
TrainTimer.exe
Resources\node\node.exe
Resources\runtime\package.json
Resources\runtime\src\
Resources\runtime\public\
Resources\runtime\vendor\
```

浏览器使用的是 `public\vendor\three.module.js`，所以发布包不再重复携带 `node_modules\three`。

## 在 Windows 上构建

需要：

- Visual Studio 2022 Build Tools，并安装“使用 C++ 的桌面开发”工作负载
- Inno Setup 6（只制作便携 ZIP 时可以省略）
- 一个 Windows x64 `node.exe`，或官方 Windows x64 Node ZIP

PowerShell 示例：

```powershell
.\scripts\build-windows-launcher.ps1 -NodeExecutablePath (Get-Command node.exe).Source
```

也可以从 Node ZIP 提取：

```powershell
.\scripts\build-windows-launcher.ps1 -NodeArchivePath C:\Downloads\node-v22-win-x64.zip
```

输出：

```text
dist\native-build\TrainTimer.exe
dist\TrainTimer-Windows\
dist\TrainTimer-Windows-win-x64.zip
dist\TrainTimer-Windows-x64-Setup.exe
```

GitHub Actions 中的 `Build Windows launcher` 工作流会在真实 Windows x64 环境完成相同构建，并上传 ZIP 和安装程序供测试。

## 在 macOS/Linux 上交叉构建便携包

安装 MinGW-w64 后运行：

```sh
NODE_ARCHIVE=/path/to/node-win-x64.zip ./scripts/build-windows-launcher.sh
```

交叉构建只生成便携目录和 ZIP；Inno Setup 安装程序由 Windows 构建或 GitHub Actions 生成。

## 运行环境说明

- 支持 Windows 10/11 x64、系统浅色/深色主题和高 DPI 缩放。
- Node.js 随正式包内置，不要求用户安装。
- Java 仍是可选依赖：缺少 Java 时基础 3×3 计时可用，依赖 TNoodle/Java 的高级打乱能力会降级。
- 对外发布前建议为安装程序和 `TrainTimer.exe` 添加 Authenticode 代码签名，以减少 SmartScreen 警告。
