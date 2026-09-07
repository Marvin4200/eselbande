"""Build-Skript: erzeugt EselShot-Setup-<Version>.exe mit PyInstaller + Inno Setup.

PyInstaller baut zunaechst einen --onedir-Ordner (exe + _internal/), danach
verpackt Inno Setup das Ganze zu einem echten Windows-Installer mit
Fortschrittsanzeige, Verzeichniswahl, Autostart-Option und einem sauberen
Eintrag unter "Apps & Features" - siehe installer.iss.

--onedir statt --onefile: --onefile entpackt sich bei *jedem* Start neu in
einen Temp-Ordner und startet sich danach selbst als Kindprozess neu - genau
das Muster, das Windows Defender & Co. als "Behavior:Win32/Persistence"
markieren, wenn ein Programm zusaetzlich Autostart-Registry-Eintraege setzt
(wie EselShot es tut). --onedir laeuft als ein einzelner Prozess ohne
Selbstentpacken und senkt die Trefferquote deutlich.

Voraussetzungen zum Bauen: ``pip install pyinstaller`` und Inno Setup 6
(https://jrsoftware.org/isinfo.php, oder ``winget install JRSoftware.InnoSetup``).
Wer EselShot nur benutzt, braucht davon nichts - das Ergebnis ist eigenstaendig.

Verwendung:
    python build.py
"""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def build_icon():
    """Programmicon vor dem PyInstaller-Lauf erzeugen."""
    sys.path.insert(0, HERE)
    from eselshot import icon
    ico = os.path.join(HERE, 'EselShot.ico')
    icon.write_ico(ico)
    return ico


def read_version():
    sys.path.insert(0, HERE)
    from eselshot import __version__
    return __version__


def clean():
    for name in ('build', 'dist', 'EselShot.spec'):
        path = os.path.join(HERE, name)
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
        elif os.path.isfile(path):
            os.remove(path)


def find_iscc():
    """ISCC.exe suchen - winget installiert je nach Modus in unterschiedliche Pfade."""
    candidates = [
        os.path.expandvars(r'%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe'),
        os.path.expandvars(r'%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe'),
        os.path.expandvars(r'%ProgramFiles%\Inno Setup 6\ISCC.exe'),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    found = shutil.which('ISCC.exe') or shutil.which('iscc')
    if found:
        return found
    raise RuntimeError(
        'Inno Setup (ISCC.exe) nicht gefunden. Installieren mit:\n'
        '  winget install --id JRSoftware.InnoSetup -e'
    )


def build():
    clean()
    ico = build_icon()
    version = read_version()

    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--noconfirm', '--clean',
        '--noconsole',                 # kein schwarzes Konsolenfenster
        '--name', 'EselShot',
        '--icon', ico,
        '--paths', HERE,
        # Tkinter kommt mit, aber PyInstaller ist gelegentlich zickig.
        # Explizit einsammeln, damit die tcl-/tk-Dateien mitkopiert werden.
        '--collect-all', 'tkinter',
        '--hidden-import', 'eselshot',
        '--hidden-import', 'eselshot.app',
        '--hidden-import', 'eselshot.editor',
        '--hidden-import', 'eselshot.tray',
        '--onedir',
        os.path.join(HERE, 'eselshot_launcher.py'),
    ]

    print('>> Baue EselShot mit PyInstaller …')
    subprocess.run(cmd, check=True, cwd=HERE)

    iscc = find_iscc()
    print('>> Baue Installer mit Inno Setup …')
    subprocess.run(
        [iscc, f'/DMyAppVersion={version}', 'installer.iss'],
        check=True, cwd=HERE,
    )

    setup_exe = os.path.join(HERE, 'dist', f'EselShot-Setup-{version}.exe')
    size = os.path.getsize(setup_exe) if os.path.isfile(setup_exe) else 0
    print(f'\nfertig: {setup_exe}  ({size / 1024 / 1024:.1f} MB)')
    return setup_exe


if __name__ == '__main__':
    build()
