using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using Microsoft.Win32;

namespace TrainTimer.Launcher;

public enum LauncherStateKind
{
    Starting,
    Ready,
    Stopped,
    Error
}

public sealed record LauncherSnapshot(
    LauncherStateKind Kind,
    string Title,
    string Message,
    string Url,
    bool IsRunning,
    bool IsBusy,
    bool OwnsProcess,
    bool ChromeAvailable,
    string BrowserMessage,
    DateTime CheckedAt,
    string? Feedback = null);

public sealed class LauncherController : IAsyncDisposable
{
    private const string Host = "127.0.0.1";
    private const int BasePort = 3211;
    private const int ManagedPortCount = 30;
    private readonly HttpClient _http = new();
    private readonly SemaphoreSlim _operationGate = new(1, 1);
    private readonly object _logLock = new();
    private Process? _serverProcess;
    private bool _disposing;

    public LauncherController()
    {
        var stateDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TrainTimer");
        Directory.CreateDirectory(stateDirectory);
        LogPath = Path.Combine(stateDirectory, "launcher.log");

        Current = CreateSnapshot(
            LauncherStateKind.Starting,
            "正在准备 TrainTimer",
            "正在检查本地服务。",
            DefaultUrl,
            isRunning: false,
            isBusy: true,
            ownsProcess: false);
    }

    public event EventHandler<LauncherSnapshot>? StateChanged;

    public LauncherSnapshot Current { get; private set; }

    public string LogPath { get; }

    private static string DefaultUrl => BuildUrl(BasePort);

    public async Task InitializeAsync(bool autoOpenBrowser)
    {
        await _operationGate.WaitAsync();
        try
        {
            Publish(CreateSnapshot(
                LauncherStateKind.Starting,
                "正在准备 TrainTimer",
                "正在检查端口和本地运行环境。",
                Current.Url,
                isRunning: false,
                isBusy: true,
                ownsProcess: false));

            var existingUrl = await FindHealthyServiceAsync();
            if (existingUrl is not null)
            {
                AppendLog($"Attached to existing TrainTimer service at {existingUrl}");
                PublishReady(existingUrl, ownsProcess: false, "已连接正在运行的本地服务。");
                if (autoOpenBrowser) await OpenBrowserCoreAsync(existingUrl);
                return;
            }

            await StartServiceCoreAsync(autoOpenBrowser);
        }
        finally
        {
            _operationGate.Release();
        }
    }

    public async Task StartServiceAsync(bool openBrowserWhenReady)
    {
        await _operationGate.WaitAsync();
        try
        {
            await StartServiceCoreAsync(openBrowserWhenReady);
        }
        finally
        {
            _operationGate.Release();
        }
    }

    public async Task StopServiceAsync()
    {
        await _operationGate.WaitAsync();
        try
        {
            await StopServiceCoreAsync(showStoppedState: true);
        }
        finally
        {
            _operationGate.Release();
        }
    }

    public async Task RestartServiceAsync()
    {
        await _operationGate.WaitAsync();
        try
        {
            if (_serverProcess is null)
            {
                Publish(Current with
                {
                    Feedback = "当前服务不是由此启动器创建，不能直接重新启动。",
                    CheckedAt = DateTime.Now
                });
                return;
            }

            Publish(Current with
            {
                Kind = LauncherStateKind.Starting,
                Title = "正在重新启动",
                Message = "正在安全地重建本地服务。",
                IsBusy = true,
                Feedback = null,
                CheckedAt = DateTime.Now
            });

            await StopServiceCoreAsync(showStoppedState: false);
            await StartServiceCoreAsync(openBrowserWhenReady: false);
        }
        finally
        {
            _operationGate.Release();
        }
    }

    public async Task RefreshAsync(bool forceFeedback = false)
    {
        if (!await _operationGate.WaitAsync(0)) return;
        try
        {
            var currentUrl = Current.Url;
            var healthy = await IsHealthyAsync(currentUrl);
            if (healthy)
            {
                var ownsProcess = _serverProcess is { HasExited: false };
                PublishReady(
                    currentUrl,
                    ownsProcess,
                    ownsProcess ? "本地服务正在运行，可以开始计时。" : "已连接正在运行的本地服务。",
                    forceFeedback ? "服务状态已刷新" : null);
                return;
            }

            var discovered = await FindHealthyServiceAsync();
            if (discovered is not null)
            {
                PublishReady(discovered, ownsProcess: false, "已连接正在运行的本地服务。", forceFeedback ? "服务状态已刷新" : null);
                return;
            }

            if (_serverProcess is { HasExited: false })
            {
                Publish(CreateSnapshot(
                    LauncherStateKind.Starting,
                    "服务正在启动",
                    "正在等待本地服务完成初始化。",
                    currentUrl,
                    isRunning: false,
                    isBusy: true,
                    ownsProcess: true,
                    forceFeedback ? "服务状态已刷新" : null));
            }
            else
            {
                Publish(CreateSnapshot(
                    LauncherStateKind.Stopped,
                    "TrainTimer 已停止",
                    "点击“启动服务”重新开始。",
                    currentUrl,
                    isRunning: false,
                    isBusy: false,
                    ownsProcess: false,
                    forceFeedback ? "服务状态已刷新" : null));
            }
        }
        finally
        {
            _operationGate.Release();
        }
    }

    public async Task OpenBrowserAsync()
    {
        await OpenBrowserCoreAsync(Current.Url);
    }

    public void OpenLog()
    {
        try
        {
            if (!File.Exists(LogPath)) File.WriteAllText(LogPath, string.Empty);
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"/select,\"{LogPath}\"",
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            AppendLog($"Unable to show log file: {ex.Message}");
            Publish(Current with
            {
                Feedback = $"无法打开日志：{ex.Message}",
                CheckedAt = DateTime.Now
            });
        }
    }

    private async Task StartServiceCoreAsync(bool openBrowserWhenReady)
    {
        var existingUrl = await FindHealthyServiceAsync();
        if (existingUrl is not null)
        {
            PublishReady(existingUrl, ownsProcess: false, "已连接正在运行的本地服务。", "服务已经在运行");
            if (openBrowserWhenReady) await OpenBrowserCoreAsync(existingUrl);
            return;
        }

        var runtimeRoot = ResolveRuntimeRoot();
        var serverPath = Path.Combine(runtimeRoot, "src", "server.js");
        var packagePath = Path.Combine(runtimeRoot, "package.json");
        if (!File.Exists(serverPath) || !File.Exists(packagePath))
        {
            PublishError("找不到运行文件", $"缺少 Resources\\runtime：{runtimeRoot}");
            return;
        }

        var nodePath = ResolveNodePath();
        if (nodePath is null)
        {
            PublishError(
                "找不到 Node.js",
                "请安装 Node.js，或将 node.exe 放入 Resources\\node。然后重试。");
            return;
        }

        var port = FindAvailablePort();
        if (port is null)
        {
            PublishError("没有可用端口", $"端口 {BasePort}–{BasePort + ManagedPortCount - 1} 均被占用。");
            return;
        }

        var url = BuildUrl(port.Value);
        Publish(CreateSnapshot(
            LauncherStateKind.Starting,
            "正在启动 TrainTimer",
            "服务就绪后会自动在 Chrome 中打开。",
            url,
            isRunning: false,
            isBusy: true,
            ownsProcess: true));

        try
        {
            AppendLog($"Starting service with {nodePath} at {url}");
            var startInfo = new ProcessStartInfo
            {
                FileName = nodePath,
                WorkingDirectory = runtimeRoot,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            startInfo.ArgumentList.Add(serverPath);
            startInfo.Environment["HOST"] = Host;
            startInfo.Environment["PORT"] = port.Value.ToString();

            var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
            process.OutputDataReceived += (_, e) => { if (e.Data is not null) AppendLog(e.Data); };
            process.ErrorDataReceived += (_, e) => { if (e.Data is not null) AppendLog($"stderr: {e.Data}"); };
            process.Exited += (_, _) => ServerProcess_Exited(process);

            if (!process.Start())
            {
                process.Dispose();
                PublishError("无法启动服务", "Node.js 进程没有成功启动。");
                return;
            }

            _serverProcess = process;
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }
        catch (Exception ex)
        {
            AppendLog($"Start failed: {ex}");
            PublishError("无法启动服务", ex.Message);
            return;
        }

        var deadline = DateTime.UtcNow.AddSeconds(18);
        while (DateTime.UtcNow < deadline)
        {
            if (_serverProcess is null || _serverProcess.HasExited)
            {
                PublishError("服务意外停止", "请打开启动日志查看 Node.js 输出。");
                return;
            }

            if (await IsHealthyAsync(url))
            {
                PublishReady(url, ownsProcess: true, "本地服务正在运行，可以开始计时。");
                if (openBrowserWhenReady) await OpenBrowserCoreAsync(url);
                return;
            }

            await Task.Delay(250);
        }

        PublishError("服务启动超时", "本地服务没有在预期时间内响应，请查看启动日志。");
    }

    private async Task StopServiceCoreAsync(bool showStoppedState)
    {
        var process = _serverProcess;
        _serverProcess = null;

        if (process is not null)
        {
            try
            {
                if (!process.HasExited)
                {
                    AppendLog($"Stopping owned service process {process.Id}");
                    process.Kill(entireProcessTree: true);
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                    await process.WaitForExitAsync(timeout.Token);
                }
            }
            catch (OperationCanceledException)
            {
                AppendLog("Timed out while waiting for the service process to stop");
            }
            catch (Exception ex)
            {
                AppendLog($"Stop failed: {ex.Message}");
            }
            finally
            {
                process.Dispose();
            }
        }

        if (showStoppedState)
        {
            Publish(CreateSnapshot(
                LauncherStateKind.Stopped,
                "TrainTimer 已停止",
                "本地服务已安全停止。",
                Current.Url,
                isRunning: false,
                isBusy: false,
                ownsProcess: false,
                "服务已停止"));
        }
    }

    private void ServerProcess_Exited(Process process)
    {
        if (_disposing || !ReferenceEquals(_serverProcess, process)) return;

        var exitCode = -1;
        try { exitCode = process.ExitCode; } catch { }
        AppendLog($"Service process exited with code {exitCode}");
        _serverProcess = null;
        Publish(CreateSnapshot(
            LauncherStateKind.Error,
            "服务意外停止",
            "请打开启动日志查看详细信息。",
            Current.Url,
            isRunning: false,
            isBusy: false,
            ownsProcess: false));
    }

    private async Task OpenBrowserCoreAsync(string url)
    {
        try
        {
            var chromePath = ResolveChromePath();
            if (chromePath is not null)
            {
                var start = new ProcessStartInfo
                {
                    FileName = chromePath,
                    UseShellExecute = true
                };
                start.ArgumentList.Add(url);
                Process.Start(start);
                Publish(Current with
                {
                    BrowserMessage = "Google Chrome · 已打开",
                    Feedback = "已在 Chrome 中打开",
                    CheckedAt = DateTime.Now
                });
            }
            else
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                Publish(Current with
                {
                    BrowserMessage = "默认浏览器 · 已打开",
                    Feedback = "未找到 Chrome，已使用默认浏览器",
                    CheckedAt = DateTime.Now
                });
            }
        }
        catch (Exception ex)
        {
            AppendLog($"Browser open failed: {ex.Message}");
            Publish(Current with
            {
                Feedback = "无法自动打开网页，请重试或复制地址",
                CheckedAt = DateTime.Now
            });
        }

        await Task.CompletedTask;
    }

    private async Task<string?> FindHealthyServiceAsync()
    {
        for (var port = BasePort; port < BasePort + ManagedPortCount; port++)
        {
            var url = BuildUrl(port);
            if (await IsHealthyAsync(url)) return url;
        }
        return null;
    }

    private async Task<bool> IsHealthyAsync(string baseUrl)
    {
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(350));
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/health");
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static int? FindAvailablePort()
    {
        for (var port = BasePort; port < BasePort + ManagedPortCount; port++)
        {
            TcpListener? listener = null;
            try
            {
                listener = new TcpListener(IPAddress.Loopback, port);
                listener.Start();
                return port;
            }
            catch (SocketException)
            {
            }
            finally
            {
                listener?.Stop();
            }
        }
        return null;
    }

    private static string ResolveRuntimeRoot()
    {
        var bundled = Path.Combine(AppContext.BaseDirectory, "Resources", "runtime");
        if (File.Exists(Path.Combine(bundled, "src", "server.js"))) return bundled;

        var current = new DirectoryInfo(AppContext.BaseDirectory);
        for (var depth = 0; depth < 8 && current is not null; depth++, current = current.Parent)
        {
            if (File.Exists(Path.Combine(current.FullName, "src", "server.js")) &&
                File.Exists(Path.Combine(current.FullName, "package.json")))
            {
                return current.FullName;
            }
        }

        return bundled;
    }

    private static string? ResolveNodePath()
    {
        var configured = Environment.GetEnvironmentVariable("TRAIN_TIMER_NODE");
        var bundled = Path.Combine(AppContext.BaseDirectory, "Resources", "node", "node.exe");
        var candidates = new[]
        {
            configured,
            bundled,
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe")
        };

        foreach (var candidate in candidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate) && File.Exists(candidate)) return candidate;
        }

        try
        {
            var where = Process.Start(new ProcessStartInfo
            {
                FileName = "where.exe",
                Arguments = "node.exe",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                CreateNoWindow = true
            });
            if (where is null) return null;
            var first = where.StandardOutput.ReadLine();
            where.WaitForExit(1500);
            where.Dispose();
            return !string.IsNullOrWhiteSpace(first) && File.Exists(first) ? first : null;
        }
        catch
        {
            return null;
        }
    }

    private static string? ResolveChromePath()
    {
        var registryKeys = new[]
        {
            @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
            @"HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
            @"HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
        };
        foreach (var key in registryKeys)
        {
            if (Registry.GetValue(key, string.Empty, null) is string value && File.Exists(value)) return value;
        }

        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe")
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    private static string BuildUrl(int port) => $"http://{Host}:{port}";

    private LauncherSnapshot CreateSnapshot(
        LauncherStateKind kind,
        string title,
        string message,
        string url,
        bool isRunning,
        bool isBusy,
        bool ownsProcess,
        string? feedback = null)
    {
        var hasChrome = ResolveChromePath() is not null;
        return new LauncherSnapshot(
            kind,
            title,
            message,
            url,
            isRunning,
            isBusy,
            ownsProcess,
            hasChrome,
            hasChrome ? "Google Chrome · 启动后自动打开" : "默认浏览器 · 未检测到 Google Chrome",
            DateTime.Now,
            feedback);
    }

    private void PublishReady(string url, bool ownsProcess, string message, string? feedback = null)
    {
        Publish(CreateSnapshot(
            LauncherStateKind.Ready,
            "TrainTimer 已就绪",
            message,
            url,
            isRunning: true,
            isBusy: false,
            ownsProcess,
            feedback));
    }

    private void PublishError(string title, string message)
    {
        Publish(CreateSnapshot(
            LauncherStateKind.Error,
            title,
            message,
            Current.Url,
            isRunning: false,
            isBusy: false,
            ownsProcess: false));
    }

    private void Publish(LauncherSnapshot snapshot)
    {
        Current = snapshot;
        StateChanged?.Invoke(this, snapshot);
    }

    private void AppendLog(string message)
    {
        try
        {
            lock (_logLock)
            {
                File.AppendAllText(LogPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}{Environment.NewLine}");
            }
        }
        catch
        {
        }
    }

    public async ValueTask DisposeAsync()
    {
        _disposing = true;
        await _operationGate.WaitAsync();
        try
        {
            await StopServiceCoreAsync(showStoppedState: false);
            _http.Dispose();
        }
        finally
        {
            _operationGate.Release();
            _operationGate.Dispose();
        }
    }
}
