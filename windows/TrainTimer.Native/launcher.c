#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif

#include <winsock2.h>
#include <windows.h>
#include <commctrl.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <strsafe.h>
#include <uxtheme.h>
#include <winhttp.h>

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#include "resource.h"

#ifdef _MSC_VER
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "uxtheme.lib")
#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "ws2_32.lib")
#endif

#define APP_CLASS_NAME L"TrainTimerNativeLauncherWindow"
#define APP_MUTEX_NAME L"Local\\TrainTimerNativeLauncher"
#define BASE_PORT 3211
#define MANAGED_PORT_COUNT 30
#define HEALTH_TIMEOUT_MS 350
#define START_TIMEOUT_MS 18000
#define WM_APP_SNAPSHOT (WM_APP + 1)
#define WM_APP_OPERATION_DONE (WM_APP + 2)
#define TIMER_REFRESH 1

#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif
#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif
#ifndef DWMWA_SYSTEMBACKDROP_TYPE
#define DWMWA_SYSTEMBACKDROP_TYPE 38
#endif

typedef enum LauncherStateKind {
    STATE_STARTING,
    STATE_READY,
    STATE_STOPPED,
    STATE_ERROR
} LauncherStateKind;

typedef enum OperationKind {
    OP_INITIALIZE,
    OP_START,
    OP_REFRESH,
    OP_REFRESH_AUTO,
    OP_STOP,
    OP_RESTART
} OperationKind;

typedef struct LauncherSnapshot {
    LauncherStateKind kind;
    WCHAR title[128];
    WCHAR message[384];
    WCHAR url[96];
    WCHAR feedback[192];
    BOOL isRunning;
    BOOL isBusy;
    BOOL ownsProcess;
    BOOL chromeAvailable;
    SYSTEMTIME checkedAt;
} LauncherSnapshot;

typedef struct ThemeColors {
    COLORREF background;
    COLORREF card;
    COLORREF border;
    COLORREF divider;
    COLORREF textPrimary;
    COLORREF textSecondary;
    COLORREF textTertiary;
    COLORREF quietButton;
    COLORREF quietButtonHover;
    COLORREF quietButtonPressed;
    COLORREF quietButtonDisabled;
    COLORREF primaryButton;
    COLORREF primaryButtonHover;
    COLORREF primaryButtonPressed;
    COLORREF primaryButtonDisabled;
    COLORREF onPrimary;
    COLORREF statusGreen;
    COLORREF statusAmber;
    COLORREF statusRed;
} ThemeColors;

static HINSTANCE gInstance;
static HWND gWindow;
static HWND gButtons[6];
static HICON gAppIcon;
static HANDLE gMutex;
static HANDLE gWorkerThread;
static HANDLE gNodeProcess;
static HANDLE gNodeJob;
static CRITICAL_SECTION gProcessLock;
static volatile LONG gWorkerBusy;
static volatile LONG gClosing;
static int gCurrentPort = BASE_PORT;
static UINT gDpi = 96;
static BOOL gDarkMode;
static ThemeColors gColors;
static LauncherSnapshot gSnapshot;
static WCHAR gExeDirectory[MAX_PATH * 2];
static WCHAR gLogPath[MAX_PATH * 2];

static HFONT gFontTitle;
static HFONT gFontSubtitle;
static HFONT gFontStatus;
static HFONT gFontBody;
static HFONT gFontLabel;
static HFONT gFontMono;
static HFONT gFontButton;

static const int gButtonIds[6] = {
    IDC_REFRESH, IDC_LOG, IDC_COPY, IDC_STOP, IDC_RESTART, IDC_PRIMARY
};

static const WCHAR *gButtonLabels[6] = {
    L"刷新", L"日志", L"复制", L"停止服务", L"重新启动", L"启动服务"
};

static BOOL FileExists(const WCHAR *path) {
    DWORD attributes = GetFileAttributesW(path);
    return attributes != INVALID_FILE_ATTRIBUTES && !(attributes & FILE_ATTRIBUTE_DIRECTORY);
}

static BOOL DirectoryExists(const WCHAR *path) {
    DWORD attributes = GetFileAttributesW(path);
    return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY);
}

static void CopyText(WCHAR *destination, size_t capacity, const WCHAR *source) {
    StringCchCopyW(destination, capacity, source ? source : L"");
}

static void JoinPath(WCHAR *destination, size_t capacity, const WCHAR *left, const WCHAR *right) {
    size_t length = left ? wcslen(left) : 0;
    const WCHAR *separator = (length > 0 && (left[length - 1] == L'\\' || left[length - 1] == L'/')) ? L"" : L"\\";
    StringCchPrintfW(destination, capacity, L"%ls%ls%ls", left ? left : L"", separator, right ? right : L"");
}

static void ParentDirectory(WCHAR *path) {
    WCHAR *slash = wcsrchr(path, L'\\');
    WCHAR *forwardSlash = wcsrchr(path, L'/');
    if (forwardSlash && (!slash || forwardSlash > slash)) slash = forwardSlash;
    if (slash && slash > path) *slash = L'\0';
}

static void InitializePaths(void) {
    WCHAR executable[MAX_PATH * 2];
    DWORD length = GetModuleFileNameW(NULL, executable, (DWORD)(sizeof(executable) / sizeof(executable[0])));
    if (length == 0 || length >= (DWORD)(sizeof(executable) / sizeof(executable[0]))) {
        CopyText(executable, sizeof(executable) / sizeof(executable[0]), L"TrainTimer.exe");
    }
    CopyText(gExeDirectory, sizeof(gExeDirectory) / sizeof(gExeDirectory[0]), executable);
    ParentDirectory(gExeDirectory);

    WCHAR localAppData[MAX_PATH * 2];
    DWORD localLength = GetEnvironmentVariableW(L"LOCALAPPDATA", localAppData, (DWORD)(sizeof(localAppData) / sizeof(localAppData[0])));
    if (localLength == 0 || localLength >= (DWORD)(sizeof(localAppData) / sizeof(localAppData[0]))) {
        CopyText(localAppData, sizeof(localAppData) / sizeof(localAppData[0]), gExeDirectory);
    }

    WCHAR stateDirectory[MAX_PATH * 2];
    JoinPath(stateDirectory, sizeof(stateDirectory) / sizeof(stateDirectory[0]), localAppData, L"TrainTimer");
    CreateDirectoryW(stateDirectory, NULL);
    JoinPath(gLogPath, sizeof(gLogPath) / sizeof(gLogPath[0]), stateDirectory, L"launcher.log");
}

static void AppendLog(const WCHAR *message) {
    SYSTEMTIME now;
    WCHAR line[2304];
    char utf8[8192];
    GetLocalTime(&now);
    StringCchPrintfW(
        line,
        sizeof(line) / sizeof(line[0]),
        L"[%04u-%02u-%02u %02u:%02u:%02u.%03u] %ls\r\n",
        now.wYear,
        now.wMonth,
        now.wDay,
        now.wHour,
        now.wMinute,
        now.wSecond,
        now.wMilliseconds,
        message ? message : L"");

    int bytes = WideCharToMultiByte(CP_UTF8, 0, line, -1, utf8, (int)sizeof(utf8), NULL, NULL);
    if (bytes <= 1) return;

    HANDLE file = CreateFileW(
        gLogPath,
        FILE_APPEND_DATA,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        OPEN_ALWAYS,
        FILE_ATTRIBUTE_NORMAL,
        NULL);
    if (file == INVALID_HANDLE_VALUE) return;
    DWORD written = 0;
    WriteFile(file, utf8, (DWORD)(bytes - 1), &written, NULL);
    CloseHandle(file);
}

static BOOL DetectDarkMode(void) {
    DWORD value = 1;
    DWORD size = sizeof(value);
    LSTATUS status = RegGetValueW(
        HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        L"AppsUseLightTheme",
        RRF_RT_REG_DWORD,
        NULL,
        &value,
        &size);
    return status == ERROR_SUCCESS && value == 0;
}

static void LoadThemeColors(void) {
    if (gDarkMode) {
        const ThemeColors darkColors = {
            RGB(17, 24, 39), RGB(24, 36, 47), RGB(50, 68, 78), RGB(45, 61, 70),
            RGB(242, 247, 247), RGB(190, 204, 211), RGB(148, 165, 174),
            RGB(37, 54, 66), RGB(48, 70, 81), RGB(57, 82, 94), RGB(29, 42, 51),
            RGB(20, 184, 166), RGB(13, 148, 136), RGB(15, 118, 110), RGB(44, 85, 80),
            RGB(255, 255, 255), RGB(34, 197, 94), RGB(245, 158, 11), RGB(239, 68, 68)
        };
        gColors = darkColors;
    } else {
        const ThemeColors lightColors = {
            RGB(244, 248, 250), RGB(255, 255, 255), RGB(220, 231, 236), RGB(229, 237, 240),
            RGB(19, 50, 47), RGB(68, 91, 101), RGB(100, 116, 125),
            RGB(232, 241, 244), RGB(217, 232, 236), RGB(199, 220, 225), RGB(235, 239, 241),
            RGB(13, 148, 136), RGB(15, 118, 110), RGB(17, 94, 89), RGB(144, 184, 179),
            RGB(255, 255, 255), RGB(15, 157, 88), RGB(242, 153, 0), RGB(209, 52, 56)
        };
        gColors = lightColors;
    }
}

static int Scale(int value) {
    return MulDiv(value, (int)gDpi, 96);
}

static HFONT CreateUiFont(int pointSize, int weight, const WCHAR *face) {
    return CreateFontW(
        -MulDiv(pointSize, (int)gDpi, 72), 0, 0, 0, weight, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
        DEFAULT_PITCH | FF_DONTCARE, face);
}

static void DeleteUiFonts(void) {
    DeleteObject(gFontTitle);
    DeleteObject(gFontSubtitle);
    DeleteObject(gFontStatus);
    DeleteObject(gFontBody);
    DeleteObject(gFontLabel);
    DeleteObject(gFontMono);
    DeleteObject(gFontButton);
    gFontTitle = NULL;
    gFontSubtitle = NULL;
    gFontStatus = NULL;
    gFontBody = NULL;
    gFontLabel = NULL;
    gFontMono = NULL;
    gFontButton = NULL;
}

static void CreateUiFonts(void) {
    DeleteUiFonts();
    gFontTitle = CreateUiFont(22, FW_SEMIBOLD, L"Segoe UI Variable Display");
    gFontSubtitle = CreateUiFont(10, FW_NORMAL, L"Segoe UI Variable Text");
    gFontStatus = CreateUiFont(18, FW_SEMIBOLD, L"Segoe UI Variable Display");
    gFontBody = CreateUiFont(10, FW_NORMAL, L"Segoe UI Variable Text");
    gFontLabel = CreateUiFont(10, FW_SEMIBOLD, L"Segoe UI Variable Text");
    gFontMono = CreateUiFont(10, FW_NORMAL, L"Cascadia Mono");
    gFontButton = CreateUiFont(10, FW_SEMIBOLD, L"Segoe UI Variable Text");
}

static void ApplyWindowTheme(void) {
    gDarkMode = DetectDarkMode();
    LoadThemeColors();
    BOOL dark = gDarkMode;
    int corner = 2;
    DwmSetWindowAttribute(gWindow, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark, sizeof(dark));
    DwmSetWindowAttribute(gWindow, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));
    for (size_t index = 0; index < sizeof(gButtons) / sizeof(gButtons[0]); ++index) {
        if (gButtons[index]) SetWindowTheme(gButtons[index], gDarkMode ? L"DarkMode_Explorer" : L"Explorer", NULL);
    }
    InvalidateRect(gWindow, NULL, TRUE);
}

static BOOL QueryRegistryExecutable(HKEY root, const WCHAR *subkey, REGSAM access, WCHAR *output, size_t capacity) {
    HKEY key = NULL;
    if (RegOpenKeyExW(root, subkey, 0, KEY_QUERY_VALUE | access, &key) != ERROR_SUCCESS) return FALSE;

    DWORD type = 0;
    DWORD bytes = (DWORD)(capacity * sizeof(WCHAR));
    LSTATUS status = RegQueryValueExW(key, NULL, NULL, &type, (BYTE *)output, &bytes);
    RegCloseKey(key);
    if (status != ERROR_SUCCESS || (type != REG_SZ && type != REG_EXPAND_SZ)) return FALSE;
    output[capacity - 1] = L'\0';

    if (type == REG_EXPAND_SZ) {
        WCHAR expanded[MAX_PATH * 2];
        DWORD result = ExpandEnvironmentStringsW(output, expanded, (DWORD)(sizeof(expanded) / sizeof(expanded[0])));
        if (result > 0 && result < (DWORD)(sizeof(expanded) / sizeof(expanded[0]))) {
            CopyText(output, capacity, expanded);
        }
    }
    return FileExists(output);
}

static BOOL ResolveChromePath(WCHAR *output, size_t capacity) {
    const WCHAR *appPath = L"Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe";
    if (QueryRegistryExecutable(HKEY_CURRENT_USER, appPath, 0, output, capacity)) return TRUE;
    if (QueryRegistryExecutable(HKEY_LOCAL_MACHINE, appPath, KEY_WOW64_64KEY, output, capacity)) return TRUE;
    if (QueryRegistryExecutable(HKEY_LOCAL_MACHINE, appPath, KEY_WOW64_32KEY, output, capacity)) return TRUE;

    WCHAR base[MAX_PATH * 2];
    WCHAR candidate[MAX_PATH * 2];
    const WCHAR *variables[] = { L"LOCALAPPDATA", L"ProgramFiles", L"ProgramFiles(x86)" };
    for (size_t index = 0; index < sizeof(variables) / sizeof(variables[0]); ++index) {
        DWORD result = GetEnvironmentVariableW(variables[index], base, (DWORD)(sizeof(base) / sizeof(base[0])));
        if (result == 0 || result >= (DWORD)(sizeof(base) / sizeof(base[0]))) continue;
        JoinPath(candidate, sizeof(candidate) / sizeof(candidate[0]), base, L"Google\\Chrome\\Application\\chrome.exe");
        if (FileExists(candidate)) {
            CopyText(output, capacity, candidate);
            return TRUE;
        }
    }
    output[0] = L'\0';
    return FALSE;
}

static BOOL ResolveNodePath(WCHAR *output, size_t capacity) {
    WCHAR candidate[MAX_PATH * 2];
    DWORD result = GetEnvironmentVariableW(L"TRAIN_TIMER_NODE", candidate, (DWORD)(sizeof(candidate) / sizeof(candidate[0])));
    if (result > 0 && result < (DWORD)(sizeof(candidate) / sizeof(candidate[0])) && FileExists(candidate)) {
        CopyText(output, capacity, candidate);
        return TRUE;
    }

    JoinPath(candidate, sizeof(candidate) / sizeof(candidate[0]), gExeDirectory, L"Resources\\node\\node.exe");
    if (FileExists(candidate)) {
        CopyText(output, capacity, candidate);
        return TRUE;
    }

    const WCHAR *variables[] = { L"ProgramFiles", L"ProgramFiles(x86)" };
    WCHAR base[MAX_PATH * 2];
    for (size_t index = 0; index < sizeof(variables) / sizeof(variables[0]); ++index) {
        result = GetEnvironmentVariableW(variables[index], base, (DWORD)(sizeof(base) / sizeof(base[0])));
        if (result == 0 || result >= (DWORD)(sizeof(base) / sizeof(base[0]))) continue;
        JoinPath(candidate, sizeof(candidate) / sizeof(candidate[0]), base, L"nodejs\\node.exe");
        if (FileExists(candidate)) {
            CopyText(output, capacity, candidate);
            return TRUE;
        }
    }

    result = SearchPathW(NULL, L"node.exe", NULL, (DWORD)capacity, output, NULL);
    return result > 0 && result < (DWORD)capacity && FileExists(output);
}

static BOOL IsRuntimeRoot(const WCHAR *root) {
    WCHAR server[MAX_PATH * 2];
    WCHAR package[MAX_PATH * 2];
    WCHAR publicDirectory[MAX_PATH * 2];
    JoinPath(server, sizeof(server) / sizeof(server[0]), root, L"src\\server.js");
    JoinPath(package, sizeof(package) / sizeof(package[0]), root, L"package.json");
    JoinPath(publicDirectory, sizeof(publicDirectory) / sizeof(publicDirectory[0]), root, L"public");
    return FileExists(server) && FileExists(package) && DirectoryExists(publicDirectory);
}

static BOOL ResolveRuntimeRoot(WCHAR *output, size_t capacity) {
    WCHAR candidate[MAX_PATH * 2];
    JoinPath(candidate, sizeof(candidate) / sizeof(candidate[0]), gExeDirectory, L"Resources\\runtime");
    if (IsRuntimeRoot(candidate)) {
        CopyText(output, capacity, candidate);
        return TRUE;
    }

    CopyText(candidate, sizeof(candidate) / sizeof(candidate[0]), gExeDirectory);
    for (int depth = 0; depth < 8; ++depth) {
        if (IsRuntimeRoot(candidate)) {
            CopyText(output, capacity, candidate);
            return TRUE;
        }
        WCHAR before[MAX_PATH * 2];
        CopyText(before, sizeof(before) / sizeof(before[0]), candidate);
        ParentDirectory(candidate);
        if (wcscmp(before, candidate) == 0) break;
    }
    output[0] = L'\0';
    return FALSE;
}

static BOOL HealthCheckPort(int port) {
    BOOL healthy = FALSE;
    HINTERNET session = WinHttpOpen(
        L"TrainTimerLauncher/0.1",
        WINHTTP_ACCESS_TYPE_NO_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0);
    if (!session) return FALSE;
    WinHttpSetTimeouts(session, HEALTH_TIMEOUT_MS, HEALTH_TIMEOUT_MS, HEALTH_TIMEOUT_MS, HEALTH_TIMEOUT_MS);

    HINTERNET connection = WinHttpConnect(session, L"127.0.0.1", (INTERNET_PORT)port, 0);
    if (!connection) {
        WinHttpCloseHandle(session);
        return FALSE;
    }

    HINTERNET request = WinHttpOpenRequest(
        connection,
        L"GET",
        L"/api/health",
        NULL,
        WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES,
        WINHTTP_FLAG_REFRESH);
    if (request && WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, NULL, 0, 0, 0) && WinHttpReceiveResponse(request, NULL)) {
        DWORD status = 0;
        DWORD statusSize = sizeof(status);
        if (WinHttpQueryHeaders(
                request,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                WINHTTP_HEADER_NAME_BY_INDEX,
                &status,
                &statusSize,
                WINHTTP_NO_HEADER_INDEX) && status >= 200 && status < 300) {
            char response[4097];
            DWORD total = 0;
            while (total < sizeof(response) - 1) {
                DWORD read = 0;
                if (!WinHttpReadData(request, response + total, (DWORD)(sizeof(response) - 1 - total), &read) || read == 0) break;
                total += read;
            }
            response[total] = '\0';
            healthy = strstr(response, "\"app\":\"TrainTimer\"") != NULL && strstr(response, "\"ok\":true") != NULL;
        }
    }

    if (request) WinHttpCloseHandle(request);
    WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);
    return healthy;
}

static int FindHealthyService(void) {
    for (int port = BASE_PORT; port < BASE_PORT + MANAGED_PORT_COUNT && !gClosing; ++port) {
        if (HealthCheckPort(port)) return port;
    }
    return 0;
}

static int FindAvailablePort(void) {
    for (int port = BASE_PORT; port < BASE_PORT + MANAGED_PORT_COUNT; ++port) {
        SOCKET socketHandle = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (socketHandle == INVALID_SOCKET) return 0;

        struct sockaddr_in address;
        ZeroMemory(&address, sizeof(address));
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        address.sin_port = htons((u_short)port);
        int result = bind(socketHandle, (const struct sockaddr *)&address, sizeof(address));
        closesocket(socketHandle);
        if (result == 0) return port;
    }
    return 0;
}

static BOOL OwnedProcessIsAlive(void) {
    BOOL alive = FALSE;
    EnterCriticalSection(&gProcessLock);
    if (gNodeProcess) {
        DWORD exitCode = 0;
        alive = GetExitCodeProcess(gNodeProcess, &exitCode) && exitCode == STILL_ACTIVE;
    }
    LeaveCriticalSection(&gProcessLock);
    return alive;
}

static void StopOwnedProcess(void) {
    HANDLE process = NULL;
    HANDLE job = NULL;
    EnterCriticalSection(&gProcessLock);
    process = gNodeProcess;
    job = gNodeJob;
    gNodeProcess = NULL;
    gNodeJob = NULL;
    LeaveCriticalSection(&gProcessLock);

    if (job) TerminateJobObject(job, 0);
    if (process) WaitForSingleObject(process, 5000);
    if (process) CloseHandle(process);
    if (job) CloseHandle(job);
}

static BOOL StartNodeProcess(const WCHAR *nodePath, const WCHAR *runtimeRoot, int port, WCHAR *error, size_t errorCapacity) {
    WCHAR serverPath[MAX_PATH * 2];
    WCHAR commandLine[MAX_PATH * 4];
    JoinPath(serverPath, sizeof(serverPath) / sizeof(serverPath[0]), runtimeRoot, L"src\\server.js");
    StringCchPrintfW(commandLine, sizeof(commandLine) / sizeof(commandLine[0]), L"\"%ls\" \"%ls\"", nodePath, serverPath);

    SECURITY_ATTRIBUTES security;
    ZeroMemory(&security, sizeof(security));
    security.nLength = sizeof(security);
    security.bInheritHandle = TRUE;

    HANDLE logFile = CreateFileW(
        gLogPath,
        FILE_APPEND_DATA,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        &security,
        OPEN_ALWAYS,
        FILE_ATTRIBUTE_NORMAL,
        NULL);
    if (logFile == INVALID_HANDLE_VALUE) {
        StringCchPrintfW(error, errorCapacity, L"无法创建启动日志（错误 %lu）。", GetLastError());
        return FALSE;
    }

    STARTUPINFOW startup;
    PROCESS_INFORMATION processInfo;
    ZeroMemory(&startup, sizeof(startup));
    ZeroMemory(&processInfo, sizeof(processInfo));
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdOutput = logFile;
    startup.hStdError = logFile;
    startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);

    HANDLE job = CreateJobObjectW(NULL, NULL);
    if (!job) {
        CloseHandle(logFile);
        StringCchPrintfW(error, errorCapacity, L"无法创建服务作业（错误 %lu）。", GetLastError());
        return FALSE;
    }

    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
    ZeroMemory(&limits, sizeof(limits));
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
        CloseHandle(job);
        CloseHandle(logFile);
        StringCchPrintfW(error, errorCapacity, L"无法配置服务作业（错误 %lu）。", GetLastError());
        return FALSE;
    }

    WCHAR oldHost[256];
    WCHAR oldPort[64];
    DWORD oldHostLength = GetEnvironmentVariableW(L"HOST", oldHost, (DWORD)(sizeof(oldHost) / sizeof(oldHost[0])));
    DWORD oldPortLength = GetEnvironmentVariableW(L"PORT", oldPort, (DWORD)(sizeof(oldPort) / sizeof(oldPort[0])));
    BOOL hadHost = oldHostLength > 0 && oldHostLength < (DWORD)(sizeof(oldHost) / sizeof(oldHost[0]));
    BOOL hadPort = oldPortLength > 0 && oldPortLength < (DWORD)(sizeof(oldPort) / sizeof(oldPort[0]));
    WCHAR portText[16];
    StringCchPrintfW(portText, sizeof(portText) / sizeof(portText[0]), L"%d", port);
    SetEnvironmentVariableW(L"HOST", L"127.0.0.1");
    SetEnvironmentVariableW(L"PORT", portText);

    BOOL created = CreateProcessW(
        nodePath,
        commandLine,
        NULL,
        NULL,
        TRUE,
        CREATE_NO_WINDOW | CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT,
        NULL,
        runtimeRoot,
        &startup,
        &processInfo);
    DWORD createError = GetLastError();

    SetEnvironmentVariableW(L"HOST", hadHost ? oldHost : NULL);
    SetEnvironmentVariableW(L"PORT", hadPort ? oldPort : NULL);
    CloseHandle(logFile);

    if (!created) {
        CloseHandle(job);
        StringCchPrintfW(error, errorCapacity, L"Node.js 进程启动失败（错误 %lu）。", createError);
        return FALSE;
    }

    if (!AssignProcessToJobObject(job, processInfo.hProcess)) {
        DWORD assignError = GetLastError();
        TerminateProcess(processInfo.hProcess, 1);
        CloseHandle(processInfo.hThread);
        CloseHandle(processInfo.hProcess);
        CloseHandle(job);
        StringCchPrintfW(error, errorCapacity, L"无法管理服务进程（错误 %lu）。", assignError);
        return FALSE;
    }

    EnterCriticalSection(&gProcessLock);
    if (gClosing) {
        LeaveCriticalSection(&gProcessLock);
        TerminateJobObject(job, 0);
        CloseHandle(processInfo.hThread);
        CloseHandle(processInfo.hProcess);
        CloseHandle(job);
        CopyText(error, errorCapacity, L"启动器正在关闭。");
        return FALSE;
    }
    gNodeProcess = processInfo.hProcess;
    gNodeJob = job;
    LeaveCriticalSection(&gProcessLock);
    ResumeThread(processInfo.hThread);
    CloseHandle(processInfo.hThread);
    return TRUE;
}

static LauncherSnapshot *NewSnapshot(
    LauncherStateKind kind,
    const WCHAR *title,
    const WCHAR *message,
    int port,
    BOOL running,
    BOOL busy,
    BOOL owns,
    const WCHAR *feedback) {
    LauncherSnapshot *snapshot = (LauncherSnapshot *)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(LauncherSnapshot));
    if (!snapshot) return NULL;
    snapshot->kind = kind;
    CopyText(snapshot->title, sizeof(snapshot->title) / sizeof(snapshot->title[0]), title);
    CopyText(snapshot->message, sizeof(snapshot->message) / sizeof(snapshot->message[0]), message);
    StringCchPrintfW(snapshot->url, sizeof(snapshot->url) / sizeof(snapshot->url[0]), L"http://127.0.0.1:%d", port > 0 ? port : BASE_PORT);
    CopyText(snapshot->feedback, sizeof(snapshot->feedback) / sizeof(snapshot->feedback[0]), feedback);
    snapshot->isRunning = running;
    snapshot->isBusy = busy;
    snapshot->ownsProcess = owns;
    WCHAR chrome[MAX_PATH * 2];
    snapshot->chromeAvailable = ResolveChromePath(chrome, sizeof(chrome) / sizeof(chrome[0]));
    GetLocalTime(&snapshot->checkedAt);
    return snapshot;
}

static void PostSnapshot(LauncherSnapshot *snapshot) {
    if (!snapshot) return;
    if (gClosing || !PostMessageW(gWindow, WM_APP_SNAPSHOT, 0, (LPARAM)snapshot)) {
        HeapFree(GetProcessHeap(), 0, snapshot);
    }
}

static void PublishReady(int port, BOOL owns, const WCHAR *message, const WCHAR *feedback) {
    gCurrentPort = port;
    PostSnapshot(NewSnapshot(
        STATE_READY,
        L"TrainTimer 已就绪",
        message,
        port,
        TRUE,
        FALSE,
        owns,
        feedback));
}

static BOOL OpenBrowser(int port, WCHAR *feedback, size_t capacity) {
    WCHAR url[96];
    WCHAR chrome[MAX_PATH * 2];
    StringCchPrintfW(url, sizeof(url) / sizeof(url[0]), L"http://127.0.0.1:%d", port);
    HINSTANCE result;
    if (ResolveChromePath(chrome, sizeof(chrome) / sizeof(chrome[0]))) {
        result = ShellExecuteW(NULL, L"open", chrome, url, NULL, SW_SHOWNORMAL);
        if ((INT_PTR)result > 32) {
            CopyText(feedback, capacity, L"已在 Chrome 中打开");
            return TRUE;
        }
    } else {
        result = ShellExecuteW(NULL, L"open", url, NULL, NULL, SW_SHOWNORMAL);
        if ((INT_PTR)result > 32) {
            CopyText(feedback, capacity, L"未找到 Chrome，已使用默认浏览器");
            return TRUE;
        }
    }
    CopyText(feedback, capacity, L"无法自动打开网页，请复制地址后重试");
    AppendLog(L"Unable to open the TrainTimer URL in a browser");
    return FALSE;
}

static void StartTrainTimerService(BOOL autoOpenBrowser) {
    int existing = FindHealthyService();
    if (existing) {
        WCHAR feedback[192] = L"服务已经在运行";
        if (autoOpenBrowser) OpenBrowser(existing, feedback, sizeof(feedback) / sizeof(feedback[0]));
        PublishReady(existing, OwnedProcessIsAlive(), L"已连接正在运行的本地服务。", feedback);
        return;
    }

    WCHAR runtimeRoot[MAX_PATH * 2];
    if (!ResolveRuntimeRoot(runtimeRoot, sizeof(runtimeRoot) / sizeof(runtimeRoot[0]))) {
        PostSnapshot(NewSnapshot(
            STATE_ERROR,
            L"找不到运行文件",
            L"缺少 Resources\\runtime，请重新安装或完整解压发布包。",
            gCurrentPort,
            FALSE,
            FALSE,
            FALSE,
            NULL));
        return;
    }

    WCHAR nodePath[MAX_PATH * 2];
    if (!ResolveNodePath(nodePath, sizeof(nodePath) / sizeof(nodePath[0]))) {
        PostSnapshot(NewSnapshot(
            STATE_ERROR,
            L"找不到 Node.js",
            L"发布包不完整：Resources\\node\\node.exe 不存在。",
            gCurrentPort,
            FALSE,
            FALSE,
            FALSE,
            L"也可以设置 TRAIN_TIMER_NODE 后重试"));
        return;
    }

    int port = FindAvailablePort();
    if (!port) {
        PostSnapshot(NewSnapshot(
            STATE_ERROR,
            L"没有可用端口",
            L"端口 3211–3240 均被占用，请关闭冲突程序后重试。",
            gCurrentPort,
            FALSE,
            FALSE,
            FALSE,
            NULL));
        return;
    }

    gCurrentPort = port;
    PostSnapshot(NewSnapshot(
        STATE_STARTING,
        L"正在启动 TrainTimer",
        L"服务就绪后会自动在浏览器中打开。",
        port,
        FALSE,
        TRUE,
        TRUE,
        NULL));

    WCHAR logMessage[MAX_PATH * 4];
    StringCchPrintfW(logMessage, sizeof(logMessage) / sizeof(logMessage[0]), L"Starting service with %ls at http://127.0.0.1:%d", nodePath, port);
    AppendLog(logMessage);

    WCHAR error[256];
    if (!StartNodeProcess(nodePath, runtimeRoot, port, error, sizeof(error) / sizeof(error[0]))) {
        AppendLog(error);
        PostSnapshot(NewSnapshot(STATE_ERROR, L"无法启动服务", error, port, FALSE, FALSE, FALSE, NULL));
        return;
    }

    DWORD startedAt = GetTickCount();
    while (!gClosing && GetTickCount() - startedAt < START_TIMEOUT_MS) {
        if (!OwnedProcessIsAlive()) {
            StopOwnedProcess();
            PostSnapshot(NewSnapshot(
                STATE_ERROR,
                L"服务意外停止",
                L"Node.js 进程已经退出，请打开启动日志查看详细信息。",
                port,
                FALSE,
                FALSE,
                FALSE,
                NULL));
            return;
        }
        if (HealthCheckPort(port)) {
            WCHAR feedback[192] = L"";
            if (autoOpenBrowser) OpenBrowser(port, feedback, sizeof(feedback) / sizeof(feedback[0]));
            PublishReady(port, TRUE, L"本地服务正在运行，可以开始计时。", feedback);
            return;
        }
        Sleep(250);
    }

    if (!gClosing) {
        AppendLog(L"Service startup timed out");
        StopOwnedProcess();
        PostSnapshot(NewSnapshot(
            STATE_ERROR,
            L"服务启动超时",
            L"本地服务没有在预期时间内响应，请打开启动日志。",
            port,
            FALSE,
            FALSE,
            FALSE,
            NULL));
    }
}

static void RefreshService(BOOL forceFeedback) {
    int port = gCurrentPort;
    if (HealthCheckPort(port)) {
        BOOL owns = OwnedProcessIsAlive();
        PublishReady(
            port,
            owns,
            owns ? L"本地服务正在运行，可以开始计时。" : L"已连接正在运行的本地服务。",
            forceFeedback ? L"服务状态已刷新" : NULL);
        return;
    }

    int discovered = FindHealthyService();
    if (discovered) {
        BOOL owns = OwnedProcessIsAlive() && discovered == gCurrentPort;
        PublishReady(discovered, owns, owns ? L"本地服务正在运行，可以开始计时。" : L"已连接正在运行的本地服务。", forceFeedback ? L"服务状态已刷新" : NULL);
        return;
    }

    if (OwnedProcessIsAlive()) {
        PostSnapshot(NewSnapshot(
            STATE_STARTING,
            L"服务正在启动",
            L"正在等待本地服务完成初始化。",
            port,
            FALSE,
            FALSE,
            TRUE,
            forceFeedback ? L"服务状态已刷新" : NULL));
        return;
    }

    StopOwnedProcess();
    PostSnapshot(NewSnapshot(
        STATE_STOPPED,
        L"TrainTimer 已停止",
        L"点击“启动服务”重新开始。",
        port,
        FALSE,
        FALSE,
        FALSE,
        forceFeedback ? L"服务状态已刷新" : NULL));
}

static DWORD WINAPI OperationThread(LPVOID parameter) {
    OperationKind operation = (OperationKind)(INT_PTR)parameter;
    switch (operation) {
        case OP_INITIALIZE: {
            PostSnapshot(NewSnapshot(
                STATE_STARTING,
                L"正在准备 TrainTimer",
                L"正在检查端口和本地运行环境。",
                gCurrentPort,
                FALSE,
                TRUE,
                FALSE,
                NULL));
            StartTrainTimerService(TRUE);
            break;
        }
        case OP_START:
            StartTrainTimerService(TRUE);
            break;
        case OP_REFRESH:
            RefreshService(TRUE);
            break;
        case OP_REFRESH_AUTO:
            RefreshService(FALSE);
            break;
        case OP_STOP:
            AppendLog(L"Stopping owned service process");
            StopOwnedProcess();
            PostSnapshot(NewSnapshot(
                STATE_STOPPED,
                L"TrainTimer 已停止",
                L"本地服务已安全停止。",
                gCurrentPort,
                FALSE,
                FALSE,
                FALSE,
                L"服务已停止"));
            break;
        case OP_RESTART:
            if (!OwnedProcessIsAlive()) {
                PostSnapshot(NewSnapshot(
                    STATE_READY,
                    L"TrainTimer 已就绪",
                    L"当前服务不是由此启动器创建，不能直接重新启动。",
                    gCurrentPort,
                    TRUE,
                    FALSE,
                    FALSE,
                    L"外部服务未被修改"));
                break;
            }
            PostSnapshot(NewSnapshot(
                STATE_STARTING,
                L"正在重新启动",
                L"正在安全地重建本地服务。",
                gCurrentPort,
                FALSE,
                TRUE,
                TRUE,
                NULL));
            StopOwnedProcess();
            StartTrainTimerService(FALSE);
            break;
    }

    InterlockedExchange(&gWorkerBusy, 0);
    if (!gClosing) PostMessageW(gWindow, WM_APP_OPERATION_DONE, 0, 0);
    return 0;
}

static BOOL StartOperation(OperationKind operation) {
    if (InterlockedCompareExchange(&gWorkerBusy, 1, 0) != 0 || gClosing) return FALSE;
    HANDLE thread = CreateThread(NULL, 0, OperationThread, (LPVOID)(INT_PTR)operation, 0, NULL);
    if (!thread) {
        InterlockedExchange(&gWorkerBusy, 0);
        return FALSE;
    }
    if (gWorkerThread) CloseHandle(gWorkerThread);
    gWorkerThread = thread;
    return TRUE;
}

static void SetControlEnabled(HWND control, BOOL enabled) {
    EnableWindow(control, enabled);
    InvalidateRect(control, NULL, TRUE);
}

static void RenderSnapshot(void) {
    SetControlEnabled(gButtons[0], !gSnapshot.isBusy);
    SetControlEnabled(gButtons[1], TRUE);
    SetControlEnabled(gButtons[2], gSnapshot.isRunning);
    SetControlEnabled(gButtons[3], gSnapshot.ownsProcess && !gSnapshot.isBusy);
    SetControlEnabled(gButtons[4], gSnapshot.isRunning && gSnapshot.ownsProcess && !gSnapshot.isBusy);
    SetControlEnabled(gButtons[5], !gSnapshot.isBusy);
    SetWindowTextW(gButtons[5], gSnapshot.isRunning ? (gSnapshot.chromeAvailable ? L"在 Chrome 中打开" : L"在浏览器中打开") : L"启动服务");
    InvalidateRect(gWindow, NULL, TRUE);
}

static LRESULT CALLBACK ButtonSubclassProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam, UINT_PTR subclassId, DWORD_PTR referenceData) {
    (void)subclassId;
    (void)referenceData;
    if (message == WM_MOUSEMOVE && !GetPropW(window, L"TrainTimerHover")) {
        SetPropW(window, L"TrainTimerHover", (HANDLE)1);
        TRACKMOUSEEVENT tracking = { sizeof(tracking), TME_LEAVE, window, 0 };
        TrackMouseEvent(&tracking);
        InvalidateRect(window, NULL, TRUE);
    } else if (message == WM_MOUSELEAVE) {
        RemovePropW(window, L"TrainTimerHover");
        InvalidateRect(window, NULL, TRUE);
    } else if (message == WM_NCDESTROY) {
        RemoveWindowSubclass(window, ButtonSubclassProc, 1);
    }
    return DefSubclassProc(window, message, wParam, lParam);
}

static void CreateControls(void) {
    for (size_t index = 0; index < sizeof(gButtons) / sizeof(gButtons[0]); ++index) {
        gButtons[index] = CreateWindowExW(
            0,
            L"BUTTON",
            gButtonLabels[index],
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW,
            0, 0, 10, 10,
            gWindow,
            (HMENU)(INT_PTR)gButtonIds[index],
            gInstance,
            NULL);
        SendMessageW(gButtons[index], WM_SETFONT, (WPARAM)gFontButton, TRUE);
        SetWindowSubclass(gButtons[index], ButtonSubclassProc, 1, 0);
    }
}

static void LayoutControls(void) {
    RECT client;
    GetClientRect(gWindow, &client);
    int width = client.right - client.left;
    int height = client.bottom - client.top;
    int margin = Scale(34);

    int logWidth = Scale(66);
    int refreshWidth = Scale(74);
    int topHeight = Scale(38);
    MoveWindow(gButtons[1], width - margin - logWidth, Scale(31), logWidth, topHeight, TRUE);
    MoveWindow(gButtons[0], width - margin - logWidth - Scale(8) - refreshWidth, Scale(31), refreshWidth, topHeight, TRUE);

    int cardRight = width - margin;
    MoveWindow(gButtons[2], cardRight - Scale(82), Scale(227), Scale(66), Scale(32), TRUE);

    int bottomY = height - Scale(94);
    int primaryWidth = Scale(190);
    int restartWidth = Scale(106);
    int stopWidth = Scale(100);
    MoveWindow(gButtons[5], width - margin - primaryWidth, bottomY, primaryWidth, Scale(44), TRUE);
    MoveWindow(gButtons[4], width - margin - primaryWidth - Scale(14) - restartWidth, bottomY + Scale(2), restartWidth, Scale(40), TRUE);
    MoveWindow(gButtons[3], width - margin - primaryWidth - Scale(14) - restartWidth - Scale(10) - stopWidth, bottomY + Scale(2), stopWidth, Scale(40), TRUE);
}

static void FillSolidRect(HDC dc, const RECT *rectangle, COLORREF color) {
    HBRUSH brush = CreateSolidBrush(color);
    FillRect(dc, rectangle, brush);
    DeleteObject(brush);
}

static void FillRoundedRect(HDC dc, const RECT *rectangle, int radius, COLORREF fill, COLORREF border) {
    HBRUSH brush = CreateSolidBrush(fill);
    HPEN pen = CreatePen(PS_SOLID, 1, border);
    HGDIOBJ oldBrush = SelectObject(dc, brush);
    HGDIOBJ oldPen = SelectObject(dc, pen);
    RoundRect(dc, rectangle->left, rectangle->top, rectangle->right, rectangle->bottom, radius, radius);
    SelectObject(dc, oldPen);
    SelectObject(dc, oldBrush);
    DeleteObject(pen);
    DeleteObject(brush);
}

static void DrawTextLine(HDC dc, const WCHAR *text, RECT rectangle, HFONT font, COLORREF color, UINT format) {
    HGDIOBJ oldFont = SelectObject(dc, font);
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, color);
    DrawTextW(dc, text ? text : L"", -1, &rectangle, format | DT_NOPREFIX);
    SelectObject(dc, oldFont);
}

static void DrawStatusMark(HDC dc, int centerX, int centerY, int radius, LauncherStateKind kind) {
    COLORREF color = kind == STATE_READY ? gColors.statusGreen : (kind == STATE_ERROR ? gColors.statusRed : gColors.statusAmber);
    HBRUSH brush = CreateSolidBrush(color);
    HPEN outline = CreatePen(PS_NULL, 0, color);
    HGDIOBJ oldBrush = SelectObject(dc, brush);
    HGDIOBJ oldPen = SelectObject(dc, outline);
    Ellipse(dc, centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    SelectObject(dc, oldPen);
    SelectObject(dc, oldBrush);
    DeleteObject(outline);
    DeleteObject(brush);

    int markWidth = Scale(2) > 2 ? Scale(2) : 2;
    HPEN mark = CreatePen(PS_SOLID, markWidth, RGB(255, 255, 255));
    oldPen = SelectObject(dc, mark);
    if (kind == STATE_READY) {
        MoveToEx(dc, centerX - Scale(9), centerY, NULL);
        LineTo(dc, centerX - Scale(2), centerY + Scale(7));
        LineTo(dc, centerX + Scale(11), centerY - Scale(8));
    } else if (kind == STATE_ERROR) {
        MoveToEx(dc, centerX, centerY - Scale(10), NULL);
        LineTo(dc, centerX, centerY + Scale(4));
        MoveToEx(dc, centerX, centerY + Scale(9), NULL);
        LineTo(dc, centerX, centerY + Scale(10));
    } else {
        Ellipse(dc, centerX - Scale(9), centerY - Scale(9), centerX + Scale(9), centerY + Scale(9));
        MoveToEx(dc, centerX, centerY - Scale(7), NULL);
        LineTo(dc, centerX, centerY);
        LineTo(dc, centerX + Scale(6), centerY + Scale(4));
    }
    SelectObject(dc, oldPen);
    DeleteObject(mark);
}

static void PaintWindow(HDC dc) {
    RECT client;
    GetClientRect(gWindow, &client);
    FillSolidRect(dc, &client, gColors.background);

    int margin = Scale(34);
    if (gAppIcon) DrawIconEx(dc, margin, Scale(26), gAppIcon, Scale(52), Scale(52), 0, NULL, DI_NORMAL);

    RECT title = { margin + Scale(67), Scale(26), client.right - Scale(190), Scale(57) };
    DrawTextLine(dc, L"TrainTimer", title, gFontTitle, gColors.textPrimary, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
    RECT subtitle = { margin + Scale(67), Scale(58), client.right - Scale(190), Scale(80) };
    DrawTextLine(dc, L"本地计时器服务 · 就绪后自动在浏览器中打开", subtitle, gFontSubtitle, gColors.textSecondary, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);

    RECT card = { margin, Scale(105), client.right - margin, Scale(371) };
    FillRoundedRect(dc, &card, Scale(16), gColors.card, gColors.border);

    DrawStatusMark(dc, margin + Scale(48), Scale(157), Scale(22), gSnapshot.kind);
    RECT statusTitle = { margin + Scale(84), Scale(126), card.right - Scale(26), Scale(157) };
    DrawTextLine(dc, gSnapshot.title, statusTitle, gFontStatus, gColors.textPrimary, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);
    RECT statusMessage = { margin + Scale(84), Scale(158), card.right - Scale(26), Scale(181) };
    DrawTextLine(dc, gSnapshot.message, statusMessage, gFontBody, gColors.textSecondary, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);

    RECT divider = { margin + Scale(26), Scale(208), card.right - Scale(26), Scale(209) };
    FillSolidRect(dc, &divider, gColors.divider);

    int labelX = margin + Scale(28);
    int valueX = margin + Scale(128);
    RECT labelAddress = { labelX, Scale(229), valueX - Scale(10), Scale(259) };
    RECT valueAddress = { valueX, Scale(229), card.right - Scale(98), Scale(259) };
    DrawTextLine(dc, L"网页地址", labelAddress, gFontLabel, gColors.textSecondary, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
    DrawTextLine(dc, gSnapshot.url, valueAddress, gFontMono, gColors.textPrimary, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);

    RECT labelBrowser = { labelX, Scale(276), valueX - Scale(10), Scale(306) };
    RECT valueBrowser = { valueX, Scale(276), card.right - Scale(26), Scale(306) };
    DrawTextLine(dc, L"浏览器", labelBrowser, gFontLabel, gColors.textSecondary, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
    DrawTextLine(
        dc,
        gSnapshot.chromeAvailable ? L"Google Chrome · 启动后自动打开" : L"默认浏览器 · 未检测到 Google Chrome",
        valueBrowser,
        gFontBody,
        gColors.textPrimary,
        DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);

    RECT labelScope = { labelX, Scale(323), valueX - Scale(10), Scale(353) };
    RECT valueScope = { valueX, Scale(323), card.right - Scale(26), Scale(353) };
    DrawTextLine(dc, L"访问范围", labelScope, gFontLabel, gColors.textSecondary, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
    DrawTextLine(dc, L"仅这台 Windows 电脑可访问", valueScope, gFontBody, gColors.textPrimary, DT_LEFT | DT_VCENTER | DT_SINGLELINE);

    WCHAR checked[256];
    if (gSnapshot.feedback[0]) {
        CopyText(checked, sizeof(checked) / sizeof(checked[0]), gSnapshot.feedback);
    } else {
        StringCchPrintfW(checked, sizeof(checked) / sizeof(checked[0]), L"刚刚检查 · %02u:%02u:%02u", gSnapshot.checkedAt.wHour, gSnapshot.checkedAt.wMinute, gSnapshot.checkedAt.wSecond);
    }
    RECT checkedRect = { margin, client.bottom - Scale(39), client.right / 2, client.bottom - Scale(18) };
    DrawTextLine(dc, checked, checkedRect, gFontSubtitle, gColors.textTertiary, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);
    RECT closingRect = { client.right / 2, client.bottom - Scale(39), client.right - margin, client.bottom - Scale(18) };
    DrawTextLine(dc, L"关闭窗口即停止由本程序启动的服务", closingRect, gFontSubtitle, gColors.textTertiary, DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);
}

static void PaintButton(const DRAWITEMSTRUCT *item) {
    BOOL primary = item->CtlID == IDC_PRIMARY;
    BOOL disabled = (item->itemState & ODS_DISABLED) != 0;
    BOOL pressed = (item->itemState & ODS_SELECTED) != 0;
    BOOL hovered = GetPropW(item->hwndItem, L"TrainTimerHover") != NULL;

    COLORREF fill;
    COLORREF text;
    if (primary) {
        fill = disabled ? gColors.primaryButtonDisabled : (pressed ? gColors.primaryButtonPressed : (hovered ? gColors.primaryButtonHover : gColors.primaryButton));
        text = gColors.onPrimary;
    } else {
        fill = disabled ? gColors.quietButtonDisabled : (pressed ? gColors.quietButtonPressed : (hovered ? gColors.quietButtonHover : gColors.quietButton));
        text = disabled ? gColors.textTertiary : gColors.textPrimary;
    }

    RECT rectangle = item->rcItem;
    FillSolidRect(item->hDC, &rectangle, item->CtlID == IDC_COPY ? gColors.card : gColors.background);
    FillRoundedRect(item->hDC, &rectangle, Scale(primary ? 10 : 9), fill, fill);
    WCHAR label[96];
    GetWindowTextW(item->hwndItem, label, (int)(sizeof(label) / sizeof(label[0])));
    DrawTextLine(item->hDC, label, rectangle, gFontButton, text, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

    if (item->itemState & ODS_FOCUS) {
        RECT focus = rectangle;
        InflateRect(&focus, -Scale(3), -Scale(3));
        DrawFocusRect(item->hDC, &focus);
    }
}

static void CopyAddressToClipboard(void) {
    if (!OpenClipboard(gWindow)) return;
    EmptyClipboard();
    size_t bytes = (wcslen(gSnapshot.url) + 1) * sizeof(WCHAR);
    HGLOBAL memory = GlobalAlloc(GMEM_MOVEABLE, bytes);
    if (memory) {
        void *data = GlobalLock(memory);
        if (data) {
            memcpy(data, gSnapshot.url, bytes);
            GlobalUnlock(memory);
            if (!SetClipboardData(CF_UNICODETEXT, memory)) GlobalFree(memory);
            CopyText(gSnapshot.feedback, sizeof(gSnapshot.feedback) / sizeof(gSnapshot.feedback[0]), L"网页地址已复制");
            GetLocalTime(&gSnapshot.checkedAt);
            InvalidateRect(gWindow, NULL, TRUE);
        } else {
            GlobalFree(memory);
        }
    }
    CloseClipboard();
}

static void OpenLogFile(void) {
    HANDLE file = CreateFileW(gLogPath, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file != INVALID_HANDLE_VALUE) CloseHandle(file);
    WCHAR arguments[MAX_PATH * 2 + 32];
    StringCchPrintfW(arguments, sizeof(arguments) / sizeof(arguments[0]), L"/select,\"%ls\"", gLogPath);
    ShellExecuteW(gWindow, L"open", L"explorer.exe", arguments, NULL, SW_SHOWNORMAL);
}

static void OpenCurrentUrl(void) {
    WCHAR feedback[192];
    OpenBrowser(gCurrentPort, feedback, sizeof(feedback) / sizeof(feedback[0]));
    CopyText(gSnapshot.feedback, sizeof(gSnapshot.feedback) / sizeof(gSnapshot.feedback[0]), feedback);
    gSnapshot.chromeAvailable = ResolveChromePath(feedback, sizeof(feedback) / sizeof(feedback[0]));
    GetLocalTime(&gSnapshot.checkedAt);
    InvalidateRect(gWindow, NULL, TRUE);
}

static LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_CREATE:
            gWindow = window;
            gDpi = GetDpiForWindow(window);
            CreateUiFonts();
            CreateControls();
            ApplyWindowTheme();
            LayoutControls();
            SetTimer(window, TIMER_REFRESH, 5000, NULL);
            StartOperation(OP_INITIALIZE);
            return 0;

        case WM_SIZE:
            LayoutControls();
            InvalidateRect(window, NULL, TRUE);
            return 0;

        case WM_DPICHANGED: {
            gDpi = HIWORD(wParam);
            const RECT *suggested = (const RECT *)lParam;
            SetWindowPos(window, NULL, suggested->left, suggested->top, suggested->right - suggested->left, suggested->bottom - suggested->top, SWP_NOZORDER | SWP_NOACTIVATE);
            CreateUiFonts();
            for (size_t index = 0; index < sizeof(gButtons) / sizeof(gButtons[0]); ++index) {
                SendMessageW(gButtons[index], WM_SETFONT, (WPARAM)gFontButton, TRUE);
            }
            LayoutControls();
            InvalidateRect(window, NULL, TRUE);
            return 0;
        }

        case WM_SETTINGCHANGE:
            if (lParam && _wcsicmp((const WCHAR *)lParam, L"ImmersiveColorSet") == 0) ApplyWindowTheme();
            return 0;

        case WM_THEMECHANGED:
            ApplyWindowTheme();
            return 0;

        case WM_GETMINMAXINFO: {
            MINMAXINFO *limits = (MINMAXINFO *)lParam;
            limits->ptMinTrackSize.x = Scale(660);
            limits->ptMinTrackSize.y = Scale(520);
            return 0;
        }

        case WM_COMMAND:
            if (HIWORD(wParam) != BN_CLICKED) break;
            switch (LOWORD(wParam)) {
                case IDC_REFRESH:
                    StartOperation(OP_REFRESH);
                    return 0;
                case IDC_LOG:
                    OpenLogFile();
                    return 0;
                case IDC_COPY:
                    CopyAddressToClipboard();
                    return 0;
                case IDC_STOP:
                    StartOperation(OP_STOP);
                    return 0;
                case IDC_RESTART:
                    StartOperation(OP_RESTART);
                    return 0;
                case IDC_PRIMARY:
                    if (gSnapshot.isRunning) OpenCurrentUrl();
                    else StartOperation(OP_START);
                    return 0;
            }
            break;

        case WM_KEYDOWN:
            if (GetKeyState(VK_CONTROL) & 0x8000) {
                if (wParam == 'R') {
                    StartOperation(OP_REFRESH);
                    return 0;
                }
                if (wParam == 'L') {
                    OpenLogFile();
                    return 0;
                }
            }
            break;

        case WM_TIMER:
            if (wParam == TIMER_REFRESH && !gSnapshot.isBusy) StartOperation(OP_REFRESH_AUTO);
            return 0;

        case WM_DRAWITEM:
            PaintButton((const DRAWITEMSTRUCT *)lParam);
            return TRUE;

        case WM_ERASEBKGND:
            return TRUE;

        case WM_PAINT: {
            PAINTSTRUCT paint;
            HDC dc = BeginPaint(window, &paint);
            RECT client;
            GetClientRect(window, &client);
            HDC memoryDc = CreateCompatibleDC(dc);
            HBITMAP bitmap = CreateCompatibleBitmap(dc, client.right, client.bottom);
            HGDIOBJ oldBitmap = SelectObject(memoryDc, bitmap);
            PaintWindow(memoryDc);
            BitBlt(dc, 0, 0, client.right, client.bottom, memoryDc, 0, 0, SRCCOPY);
            SelectObject(memoryDc, oldBitmap);
            DeleteObject(bitmap);
            DeleteDC(memoryDc);
            EndPaint(window, &paint);
            return 0;
        }

        case WM_APP_SNAPSHOT: {
            LauncherSnapshot *snapshot = (LauncherSnapshot *)lParam;
            if (snapshot) {
                gSnapshot = *snapshot;
                HeapFree(GetProcessHeap(), 0, snapshot);
                RenderSnapshot();
            }
            return 0;
        }

        case WM_APP_OPERATION_DONE:
            RenderSnapshot();
            return 0;

        case WM_CLOSE:
            if (InterlockedExchange(&gClosing, 1) == 0) {
                KillTimer(window, TIMER_REFRESH);
                StopOwnedProcess();
            }
            DestroyWindow(window);
            return 0;

        case WM_DESTROY:
            DeleteUiFonts();
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(window, message, wParam, lParam);
}

static void ActivateExistingWindow(void) {
    HWND existing = FindWindowW(APP_CLASS_NAME, NULL);
    if (!existing) return;
    if (IsIconic(existing)) ShowWindow(existing, SW_RESTORE);
    SetForegroundWindow(existing);
}

int APIENTRY wWinMain(HINSTANCE instance, HINSTANCE previousInstance, LPWSTR commandLine, int showCommand) {
    (void)previousInstance;
    (void)commandLine;
    gInstance = instance;

    gMutex = CreateMutexW(NULL, FALSE, APP_MUTEX_NAME);
    if (!gMutex || GetLastError() == ERROR_ALREADY_EXISTS) {
        ActivateExistingWindow();
        if (gMutex) CloseHandle(gMutex);
        return 0;
    }

    INITCOMMONCONTROLSEX commonControls = { sizeof(commonControls), ICC_STANDARD_CLASSES };
    InitCommonControlsEx(&commonControls);
    InitializeCriticalSection(&gProcessLock);
    InitializePaths();

    WSADATA winsock;
    if (WSAStartup(MAKEWORD(2, 2), &winsock) != 0) {
        MessageBoxW(NULL, L"无法初始化 Windows 网络组件。", L"TrainTimer", MB_OK | MB_ICONERROR);
        DeleteCriticalSection(&gProcessLock);
        CloseHandle(gMutex);
        return 1;
    }

    ZeroMemory(&gSnapshot, sizeof(gSnapshot));
    gSnapshot.kind = STATE_STARTING;
    CopyText(gSnapshot.title, sizeof(gSnapshot.title) / sizeof(gSnapshot.title[0]), L"正在准备 TrainTimer");
    CopyText(gSnapshot.message, sizeof(gSnapshot.message) / sizeof(gSnapshot.message[0]), L"正在检查本地服务。");
    CopyText(gSnapshot.url, sizeof(gSnapshot.url) / sizeof(gSnapshot.url[0]), L"http://127.0.0.1:3211");
    gSnapshot.isBusy = TRUE;
    GetLocalTime(&gSnapshot.checkedAt);

    gAppIcon = (HICON)LoadImageW(instance, MAKEINTRESOURCEW(IDI_TRAINTIMER), IMAGE_ICON, 0, 0, LR_DEFAULTSIZE | LR_SHARED);
    WNDCLASSEXW windowClass;
    ZeroMemory(&windowClass, sizeof(windowClass));
    windowClass.cbSize = sizeof(windowClass);
    windowClass.style = CS_HREDRAW | CS_VREDRAW;
    windowClass.lpfnWndProc = WindowProc;
    windowClass.hInstance = instance;
    windowClass.hIcon = gAppIcon;
    windowClass.hIconSm = gAppIcon;
    windowClass.hCursor = LoadCursorW(NULL, IDC_ARROW);
    windowClass.hbrBackground = NULL;
    windowClass.lpszClassName = APP_CLASS_NAME;
    if (!RegisterClassExW(&windowClass)) {
        MessageBoxW(NULL, L"无法注册启动器窗口。", L"TrainTimer", MB_OK | MB_ICONERROR);
        WSACleanup();
        DeleteCriticalSection(&gProcessLock);
        CloseHandle(gMutex);
        return 1;
    }

    int width = MulDiv(720, (int)GetDpiForSystem(), 96);
    int height = MulDiv(520, (int)GetDpiForSystem(), 96);
    RECT workArea;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0);
    int x = workArea.left + ((workArea.right - workArea.left) - width) / 2;
    int y = workArea.top + ((workArea.bottom - workArea.top) - height) / 2;

    HWND window = CreateWindowExW(
        0,
        APP_CLASS_NAME,
        L"TrainTimer",
        WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN,
        x,
        y,
        width,
        height,
        NULL,
        NULL,
        instance,
        NULL);
    if (!window) {
        MessageBoxW(NULL, L"无法创建启动器窗口。", L"TrainTimer", MB_OK | MB_ICONERROR);
        WSACleanup();
        DeleteCriticalSection(&gProcessLock);
        CloseHandle(gMutex);
        return 1;
    }

    ShowWindow(window, showCommand);
    UpdateWindow(window);

    MSG message;
    ZeroMemory(&message, sizeof(message));
    while (GetMessageW(&message, NULL, 0, 0) > 0) {
        if (message.message == WM_KEYDOWN && (GetKeyState(VK_CONTROL) & 0x8000)) {
            if (message.wParam == 'R') {
                StartOperation(OP_REFRESH);
                continue;
            }
            if (message.wParam == 'L') {
                OpenLogFile();
                continue;
            }
        }
        if (!IsDialogMessageW(window, &message)) {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }

    InterlockedExchange(&gClosing, 1);
    StopOwnedProcess();
    if (gWorkerThread) {
        WaitForSingleObject(gWorkerThread, 7000);
        CloseHandle(gWorkerThread);
        gWorkerThread = NULL;
    }
    WSACleanup();
    DeleteCriticalSection(&gProcessLock);
    CloseHandle(gMutex);
    return (int)message.wParam;
}
