; Inno-Setup-Skript für EselShot.
;
; MyAppVersion kommt von build.py per /DMyAppVersion=X.Y.Z - ohne diesen
; Aufruf-Parameter waere die Version im Setup falsch, deshalb hier kein
; stiller Fallback, sondern ein harter Fehler beim Kompilieren.
#ifndef MyAppVersion
  #error "MyAppVersion muss per /DMyAppVersion=X.Y.Z uebergeben werden (siehe build.py)"
#endif

#define MyAppName "EselShot"
#define MyAppPublisher "eselbande.com"
#define MyAppURL "https://files.eselbande.com"
#define MyAppExeName "EselShot.exe"

[Setup]
AppId={{B7E6C9F0-6C7B-4F9E-9C4D-EA1F6B7F2B3A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
; Pro Nutzer installieren, kein Admin/UAC noetig - EselShot ist ein
; Ein-Personen-Tray-Programm, kein Systemdienst. So laesst es sich auch an
; Freunde ohne Admin-Rechte auf ihrem Rechner weitergeben.
DefaultDirName={autopf}\EselShot
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DefaultGroupName=EselShot
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=EselShot-Setup-{#MyAppVersion}
SetupIconFile=EselShot.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableWelcomePage=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Windows' eigener Restart-Manager-Mechanismus (CloseApplications /
; RestartApplications) erwies sich beim Testen als unzuverlässig - weder
; Install noch vor allem Uninstall schlossen eine laufende Instanz
; zuverlässig (Uninstall lief einfach durch und meldete hinterher "einige
; Komponenten konnten nicht entfernt werden", weil _internal\*.pyd noch
; offen war). Stattdessen schließt [Code] unten die App explizit per
; taskkill, bevor irgendetwas installiert/entfernt wird - siehe
; InitializeSetup/InitializeUninstall.

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "Verknüpfung auf dem Desktop anlegen"; GroupDescription: "Zusätzliche Symbole:"
Name: "autostart"; Description: "EselShot beim Anmelden automatisch starten"; GroupDescription: "Zusätzliche Symbole:"

[Files]
; dist\EselShot\ ist der --onedir-Ausgabeordner von PyInstaller (build.py
; ruft ISCC erst danach auf) - exe plus _internal\ komplett mitnehmen.
Source: "dist\EselShot\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\EselShot"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\EselShot – Einstellungen"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--settings"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,EselShot}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\EselShot"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; Gleicher Registry-Wert, den auch der Einstellungen-Dialog schreibt
; (config.set_autostart) - beide Wege bleiben so austauschbar; ein Update
; ueberschreibt hier nichts, wenn der Haken beim Update nicht gesetzt wird.
; uninsdeletevalue: ohne dieses Flag laesst Inno Werte in geteilten
; System-Schluesseln wie ...\Run beim Deinstallieren stehen (nur eigene,
; leer gewordene Schluessel werden automatisch entfernt) - der Autostart-
; Eintrag ueberlebte beim Testen sonst jede Deinstallation.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "EselShot"; \
    ValueData: """{app}\{#MyAppExeName}"" --tray"; Tasks: autostart; \
    Flags: uninsdeletevalue

[Run]
; Kein skipifsilent: soll auch nach einem stillen Update automatisch wieder
; laufen, nicht nur nach der interaktiven Erstinstallation.
Filename: "{app}\{#MyAppExeName}"; Description: "EselShot jetzt starten"; Flags: nowait postinstall

[UninstallDelete]
; Konfiguration bewusst NICHT hier - die bleibt in %APPDATA%\EselShot
; erhalten, damit ein Neuinstallieren Token/Einstellungen nicht verliert.
Type: filesandordirs; Name: "{app}"

[Code]
// CloseApplications/CloseApplicationsFilter (oben in [Setup]) verlassen sich
// auf den Windows Restart Manager - beim Testen zeigte sich, dass weder
// Install noch (vor allem) Uninstall zuverlässig eine laufende EselShot-
// Instanz schließen: die Deinstallation lief einfach durch und meldete am
// Ende "einige Komponenten konnten nicht entfernt werden", weil _internal\
// *.pyd-Dateien noch geöffnet waren. taskkill ist deutlich simpler und
// funktioniert nachweislich zuverlässig - deshalb hier zusätzlich explizit.
procedure KillEselShot;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM EselShot.exe', '', SW_HIDE,
       ewWaitUntilTerminated, ResultCode);
end;

function InitializeSetup(): Boolean;
begin
  KillEselShot;
  Result := True;
end;

function InitializeUninstall(): Boolean;
begin
  KillEselShot;
  Result := True;
end;
