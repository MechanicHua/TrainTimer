#ifndef SourceRoot
  #error SourceRoot must point to the staged TrainTimer-Windows directory.
#endif
#ifndef OutputRoot
  #define OutputRoot "..\\..\\dist"
#endif
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{D69C05F0-970D-4A6B-84A9-2FA6AA3B31C4}
AppName=TrainTimer
AppVersion={#AppVersion}
AppPublisher=TrainTimer
DefaultDirName={localappdata}\Programs\TrainTimer
DefaultGroupName=TrainTimer
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputRoot}
OutputBaseFilename=TrainTimer-Windows-x64-Setup
SetupIconFile=..\TrainTimer.Launcher\Assets\TrainTimerIcon.ico
UninstallDisplayIcon={app}\TrainTimer.exe
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppVersion}
VersionInfoProductName=TrainTimer
VersionInfoDescription=TrainTimer Windows 安装程序

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加快捷方式："; Flags: unchecked

[Files]
Source: "{#SourceRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\TrainTimer"; Filename: "{app}\TrainTimer.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\TrainTimer"; Filename: "{app}\TrainTimer.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\TrainTimer.exe"; Description: "启动 TrainTimer"; Flags: nowait postinstall skipifsilent
