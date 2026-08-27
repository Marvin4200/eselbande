r"""Installer und Deinstallation - läuft als eigenes Python-Modul.

Alles pro Nutzer (kein Admin nötig):

- Programmdateien kopieren nach %LOCALAPPDATA%\EselShot\app
- .ico erzeugen
- Verknüpfungen im Startmenü und auf dem Desktop
- Autostart über HKCU\...\Run
- Eintrag unter „Apps & Features" mit passendem Deinstallieren
"""

import ctypes
import os
import shutil
import sys
from ctypes import wintypes

from . import __version__, icon

APP_NAME = 'EselShot'
PUBLISHER = 'eselbande.com'
HOMEPAGE = 'https://files.eselbande.com'
UNINSTALL_KEY = r'Software\Microsoft\Windows\CurrentVersion\Uninstall\EselShot'
RUN_KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'


def install_root():
    """Installationsordner - bewusst im Nutzerprofil, nicht in %LOCALAPPDATA%.

    Ein von der Microsoft-Store-Version von Python gestarteter Installer würde
    %LOCALAPPDATA%\\EselShot transparent in seine eigene Sandbox umleiten
    (…\\Packages\\PythonSoftwareFoundation.Python…\\LocalCache\\Local\\EselShot),
    Verknüpfungen zeigten dann ins Leere. %USERPROFILE% wird nicht umgeleitet.
    """
    home = os.environ.get('USERPROFILE') or os.path.expanduser('~')
    return os.path.join(home, APP_NAME, 'app')


def _shell_folder(csidl):
    """CSIDL-Ordner ohne Fremdpakete auflösen (Startmenü, Desktop, …)."""
    buf = ctypes.create_unicode_buffer(260)
    ctypes.windll.shell32.SHGetFolderPathW(None, csidl, None, 0, buf)
    return buf.value


def startmenu_dir():
    programs = _shell_folder(0x0002)  # CSIDL_PROGRAMS
    path = os.path.join(programs, APP_NAME)
    os.makedirs(path, exist_ok=True)
    return path


def desktop_dir():
    return _shell_folder(0x0000)  # CSIDL_DESKTOPDIRECTORY


def _pythonw():
    """pythonw.exe im Verzeichnis der laufenden Python-Installation."""
    exe = sys.executable
    candidate = os.path.join(os.path.dirname(exe), 'pythonw.exe')
    return candidate if os.path.exists(candidate) else exe


def _copy_program(target):
    """Modul-Ordner in den Installationspfad kopieren.

    Beim Installieren aus einer bereits installierten Kopie könnten Quelle und
    Ziel identisch sein; das ist erlaubt und ändert dann nichts.
    """
    src = os.path.dirname(os.path.abspath(__file__))
    dst = os.path.join(target, 'eselshot')
    if os.path.abspath(src) == os.path.abspath(dst):
        return
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))


def _make_shortcut(path, target, arguments, icon_path, description, working_dir):
    """Verknüpfung erzeugen. Das Skript wird in eine temporäre Datei geschrieben,
    damit PowerShell den Inhalt aus der Datei liest und keine Sonderzeichen
    (Umlaute, Gedankenstrich) als Kommandozeilen-Argumente missversteht."""
    import subprocess
    import tempfile

    def esc(value):
        return str(value or '').replace("'", "''")

    parent = os.path.dirname(path).replace("'", "''")
    script = "\n".join([
        "$ErrorActionPreference = 'Stop'",
        f"New-Item -ItemType Directory -Force -Path '{parent}' | Out-Null",
        f"$s = (New-Object -ComObject WScript.Shell).CreateShortcut('{esc(path)}')",
        f"$s.TargetPath = '{esc(target)}'",
        f"$s.Arguments = '{esc(arguments)}'",
        f"$s.WorkingDirectory = '{esc(working_dir)}'",
        f"$s.IconLocation = '{esc(icon_path)}'",
        f"$s.Description = '{esc(description)}'",
        "$s.WindowStyle = 7",
        "$s.Save()",
        f"if (-not (Test-Path -LiteralPath '{esc(path)}')) {{ throw 'Verknuepfung nicht angelegt' }}",
    ])

    fd, script_path = tempfile.mkstemp(suffix='.ps1')
    try:
        # UTF-8 mit BOM, damit PowerShell 5.1 unter Windows die Umlaute versteht.
        with os.fdopen(fd, 'wb') as fh:
            fh.write(b'\xef\xbb\xbf' + script.encode('utf-8'))
        subprocess.run(
            ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
             '-File', script_path],
            check=True, capture_output=True)
    finally:
        try:
            os.remove(script_path)
        except OSError:
            pass


def _set_uninstall_entry(target, icon_path):
    import winreg
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY) as key:
        winreg.SetValueEx(key, 'DisplayName', 0, winreg.REG_SZ, APP_NAME)
        winreg.SetValueEx(key, 'DisplayVersion', 0, winreg.REG_SZ, __version__)
        winreg.SetValueEx(key, 'Publisher', 0, winreg.REG_SZ, PUBLISHER)
        winreg.SetValueEx(key, 'URLInfoAbout', 0, winreg.REG_SZ, HOMEPAGE)
        winreg.SetValueEx(key, 'DisplayIcon', 0, winreg.REG_SZ, icon_path)
        winreg.SetValueEx(key, 'InstallLocation', 0, winreg.REG_SZ, target)
        winreg.SetValueEx(key, 'UninstallString', 0, winreg.REG_SZ,
                          f'"{_pythonw()}" -m eselshot --uninstall')
        winreg.SetValueEx(key, 'QuietUninstallString', 0, winreg.REG_SZ,
                          f'"{_pythonw()}" -m eselshot --uninstall --silent')
        winreg.SetValueEx(key, 'NoModify', 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, 'NoRepair', 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, 'EstimatedSize', 0, winreg.REG_DWORD,
                          max(1, _dir_size(target) // 1024))


def _clear_uninstall_entry():
    import winreg
    try:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY)
    except OSError:
        pass


def _set_autostart(enable, launcher):
    """Autostart schalten. Registry-Wert zeigt direkt auf den Launcher-Alias."""
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enable:
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, f'"{launcher}"')
        else:
            try:
                winreg.DeleteValue(key, APP_NAME)
            except OSError:
                pass


def _dir_size(path):
    total = 0
    for base, _, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(base, name))
            except OSError:
                pass
    return total


def _remove_tree(path):
    if os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)


def _write_launcher(target, icon_path):
    """Eigene Startdatei mit Icon, die von den Verknüpfungen aufgerufen wird.

    Die Verknüpfung selbst zeigt auf diese .cmd. Sie ruft ``pythonw`` mit dem
    Installationspfad im PYTHONPATH auf - so muss auf dem Nutzerrechner nichts
    in PATH liegen außer Python selbst.
    """
    launcher = os.path.join(target, 'EselShot.cmd')
    with open(launcher, 'w', encoding='utf-8', newline='\r\n') as fh:
        fh.write(
            '@echo off\r\n'
            'rem Von EselShot erzeugt - bitte nicht von Hand bearbeiten.\r\n'
            f'set "PYTHONPATH={target};%PYTHONPATH%"\r\n'
            f'start "" "{_pythonw()}" -m eselshot %*\r\n'
        )
    return launcher


def _launch_after_install(launcher):
    """EselShot starten und *diesen* Prozess sofort verlassen, damit die
    Installation nicht wartet und der Tray-Prozess unabhängig läuft."""
    import subprocess
    subprocess.Popen([launcher], creationflags=0x00000008 | 0x00000200,
                     close_fds=True)  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP


def install(*, autostart=True, desktop=True, launch=True):
    target = install_root()
    os.makedirs(target, exist_ok=True)

    _copy_program(target)
    icon_path = os.path.join(target, 'EselShot.ico')
    icon.write_ico(icon_path)
    launcher = _write_launcher(target, icon_path)

    startmenu = startmenu_dir()
    _make_shortcut(os.path.join(startmenu, 'EselShot.lnk'),
                      launcher, '', icon_path,
                      'Screenshots aufnehmen und teilen', target)
    _make_shortcut(os.path.join(startmenu, 'EselShot – Einstellungen.lnk'),
                      launcher, '--settings', icon_path,
                      'EselShot einrichten', target)
    if desktop:
        _make_shortcut(os.path.join(desktop_dir(), 'EselShot.lnk'),
                          launcher, '', icon_path,
                          'Screenshots aufnehmen und teilen', target)

    _set_uninstall_entry(target, icon_path)
    _set_autostart(autostart, launcher)

    if launch:
        _launch_after_install(launcher)

    return {'target': target, 'launcher': launcher, 'icon': icon_path,
            'startmenu': startmenu, 'autostart': autostart}


def uninstall(*, keep_config=False):
    """Alles wieder wegräumen. Konfiguration bleibt auf Wunsch stehen."""
    target = install_root()
    _set_autostart(False, '')
    _clear_uninstall_entry()

    startmenu = os.path.join(_shell_folder(0x0002), APP_NAME)
    for path in (
        os.path.join(startmenu, 'EselShot.lnk'),
        os.path.join(startmenu, 'EselShot – Einstellungen.lnk'),
        os.path.join(desktop_dir(), 'EselShot.lnk'),
    ):
        try:
            os.remove(path)
        except OSError:
            pass
    _remove_tree(startmenu)

    # Programmdateien: gelegentlich hält Python noch die eigene .py-Datei;
    # dann eine zweite Runde beim nächsten Start erledigen.
    _remove_tree(target)
    parent = os.path.dirname(target)
    if os.path.isdir(parent) and not os.listdir(parent):
        try:
            os.rmdir(parent)
        except OSError:
            pass

    if not keep_config:
        cfg = os.path.join(os.environ.get('APPDATA', ''), APP_NAME)
        _remove_tree(cfg)


def _ok(win, message):
    ctypes.windll.user32.MessageBoxW(win, message, APP_NAME, 0x40)


def _yes_no(win, message):
    return ctypes.windll.user32.MessageBoxW(win, message, APP_NAME, 0x24) == 6  # IDYES


def run_installer_ui():
    """Kleines Tk-Fenster: Häkchen, Installieren, Fertig."""
    import tkinter as tk

    root = tk.Tk()
    root.title(f'{APP_NAME} einrichten')
    root.configure(bg='#0f0f18')
    root.resizable(False, False)

    BG, CARD, TEXT, MUTED, ACCENT = '#0f0f18', '#16162a', '#e2e8f0', '#8b93a7', '#818cf8'

    tk.Label(root, text='EselShot einrichten', bg=BG, fg=TEXT,
             font=('Segoe UI', 15, 'bold')).pack(padx=28, pady=(22, 4))
    tk.Label(root, text='Screenshots aufnehmen und auf files.eselbande.com teilen',
             bg=BG, fg=MUTED, font=('Segoe UI', 9)).pack(padx=28)

    body = tk.Frame(root, bg=CARD, highlightbackground='#2b2b40', highlightthickness=1)
    body.pack(fill='x', padx=28, pady=16)

    autostart_var = tk.BooleanVar(value=True)
    desktop_var = tk.BooleanVar(value=True)
    launch_var = tk.BooleanVar(value=True)

    def cb(text, var):
        tk.Checkbutton(body, text=text, variable=var, bg=CARD, fg=TEXT,
                       selectcolor=BG, activebackground=CARD, activeforeground=TEXT,
                       bd=0, anchor='w', font=('Segoe UI', 10)).pack(anchor='w', padx=16, pady=3)

    cb('Verknüpfung auf dem Desktop anlegen', desktop_var)
    cb('Beim Anmelden automatisch starten', autostart_var)
    cb('Nach der Einrichtung sofort starten', launch_var)

    tk.Label(root, text=f'Zielordner: {install_root()}',
             bg=BG, fg=MUTED, font=('Segoe UI', 8)).pack(padx=28, pady=(0, 4))

    status = tk.Label(root, text='', bg=BG, fg=MUTED, font=('Segoe UI', 9))
    status.pack(padx=28, pady=(0, 4))

    row = tk.Frame(root, bg=BG)
    row.pack(fill='x', padx=28, pady=(4, 22))

    def close():
        root.destroy()

    def do_install():
        status.configure(text='Installiere …', fg=MUTED)
        root.update_idletasks()
        try:
            install(autostart=autostart_var.get(),
                    desktop=desktop_var.get(),
                    launch=launch_var.get())
        except Exception as err:
            status.configure(text=f'Fehler: {err}', fg='#ef4444')
            return
        status.configure(text='Fertig – Startmenü-Eintrag „EselShot" ist da.', fg='#22c55e')
        install_btn.configure(text='Fertig', command=close, bg=ACCENT)

    close_btn = tk.Label(row, text='  Abbrechen  ', bg=CARD, fg=TEXT,
                         font=('Segoe UI', 10, 'bold'), cursor='hand2', padx=8, pady=7,
                         highlightbackground='#2b2b40', highlightthickness=1)
    close_btn.pack(side='right', padx=(8, 0))
    close_btn.bind('<Button-1>', lambda e: close())

    install_btn = tk.Label(row, text='  Installieren  ', bg=ACCENT, fg='#0b0b14',
                           font=('Segoe UI', 10, 'bold'), cursor='hand2', padx=8, pady=7)
    install_btn.pack(side='right')
    install_btn.bind('<Button-1>', lambda e: do_install())

    root.update_idletasks()
    w, h = root.winfo_width(), root.winfo_height()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f'+{(sw - w) // 2}+{(sh - h) // 3}')
    root.mainloop()


def run_uninstaller_ui(silent=False):
    if not silent:
        answer = ctypes.windll.user32.MessageBoxW(
            None,
            'EselShot wirklich entfernen?\n\n'
            'Programmdateien, Verknüpfungen und Autostart werden gelöscht. '
            'Deine hochgeladenen Dateien auf files.eselbande.com bleiben unberührt.',
            APP_NAME, 0x24 | 0x30)  # YesNo + Warning
        if answer != 6:
            return
    uninstall()
    if not silent:
        _ok(None, 'EselShot wurde entfernt.')
