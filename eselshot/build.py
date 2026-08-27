"""Build-Skript: erzeugt EselShot.exe mit PyInstaller.

Ergebnis liegt in ``dist/EselShot.exe`` und ist eigenständig - der Nutzer
braucht kein installiertes Python mehr. Voraussetzung nur beim Bauen:
``pip install pyinstaller``.

Verwendung:
    python build.py
    python build.py --onedir      # schnellerer Start, aber Ordner statt Datei
"""

import argparse
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


def clean():
    for name in ('build', 'dist', 'EselShot.spec'):
        path = os.path.join(HERE, name)
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
        elif os.path.isfile(path):
            os.remove(path)


def build(*, onefile=True):
    clean()
    ico = build_icon()

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
        '--hidden-import', 'eselshot.installer',
    ]
    cmd.append('--onefile' if onefile else '--onedir')
    cmd.append(os.path.join(HERE, 'eselshot_launcher.py'))

    print('>> Baue EselShot.exe mit PyInstaller …')
    subprocess.run(cmd, check=True, cwd=HERE)

    exe = os.path.join(HERE, 'dist',
                       'EselShot.exe' if onefile else os.path.join('EselShot', 'EselShot.exe'))
    size = os.path.getsize(exe) if os.path.isfile(exe) else 0
    print(f'\nfertig: {exe}  ({size / 1024 / 1024:.1f} MB)')
    return exe


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--onedir', action='store_true',
                        help='Ordner statt einzelner .exe (schnellerer Start)')
    args = parser.parse_args()
    build(onefile=not args.onedir)
