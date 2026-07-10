; StudyLens — Inno Setup Installer Script
; Requires Inno Setup 6+  (https://jrsoftware.org/isinfo.php)
;
; Build:
;   1. First build StudyLens.exe with:   python build.py
;   2. Then open this file in Inno Setup Compiler and click Build → Compile
;   3. Output:  studylens/app/installer_output/StudyLens_Setup.exe

#define AppName    "StudyLens"
#define AppVersion "2.0.0"
#define AppPublisher "StudyLens"
#define AppURL     "http://localhost:7842"
#define AppExeName "StudyLens.exe"

[Setup]
AppId={{F3A8C1D2-7B4E-4A9F-8C3D-1E5F6A7B8C9D}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
; Installer output location
OutputDir=installer_output
OutputBaseFilename=StudyLens_Setup
; Compression
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
; Run without admin rights if possible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";  Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupentry"; Description: "Start StudyLens automatically when Windows starts";                Flags: checked

[Files]
; Main executable (built by PyInstaller)
Source: "dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu
Name: "{group}\{#AppName}";            Filename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall {#AppName}";  Filename: "{uninstallexe}"
; Desktop (optional)
Name: "{autodesktop}\{#AppName}";      Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Registry]
; Windows startup entry (runs silently on login)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "{#AppName}"; \
  ValueData: """{app}\{#AppExeName}"""; \
  Flags: uninsdeletevalue; \
  Tasks: startupentry

[Run]
; Launch after installation
Filename: "{app}\{#AppExeName}"; \
  Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; \
  Flags: nowait postinstall skipifsilent

[UninstallRun]
; Remove from startup on uninstall
Filename: "reg"; \
  Parameters: "delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Run"" /v ""{#AppName}"" /f"; \
  Flags: runhidden; RunOnceId: "RemoveStartup"

[Code]
// Show a friendly finish message
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssDone then begin
    MsgBox(
      'StudyLens has been installed!' + #13#10 + #13#10 +
      'The app will appear in your system tray.' + #13#10 +
      'Click the tray icon to open your study dashboard.' + #13#10 + #13#10 +
      'Tip: Install Ollama (ollama.com) for AI-powered study analysis.',
      mbInformation, MB_OK
    );
  end;
end;
