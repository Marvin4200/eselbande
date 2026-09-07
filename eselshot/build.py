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

Code-Signing (optional, entfernt Windows SmartScreens "Unbekannter
Herausgeber"-Warnung): ein Zertifikat kann dieses Skript nicht besorgen - das
ist ein gekauftes/identitaetsgeprueftes OV- oder EV-Code-Signing-Zertifikat
einer echten Zertifizierungsstelle (z.B. SSL.com, DigiCert, GlobalSign; grob
80-400 EUR/Jahr). Liegt eins vor, per Umgebungsvariable setzen und build.py
signiert automatisch beide Exen (PyInstaller-Ausgabe UND fertigen Installer):
    ESELSHOT_CERT_PFX=C:/pfad/zertifikat.pfx
    ESELSHOT_CERT_PASSWORD=...
oder, falls das Zertifikat schon im Windows-Zertifikatsspeicher liegt:
    ESELSHOT_CERT_THUMBPRINT=<40-stelliger Hex-Fingerabdruck>
Ohne eine dieser Variablen wird ungesigniert gebaut wie bisher.

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


def find_signtool():
    """signtool.exe suchen - kommt mit dem Windows SDK, nicht mit Python."""
    found = shutil.which('signtool.exe') or shutil.which('signtool')
    if found:
        return found
    roots = [os.path.expandvars(r'%ProgramFiles(x86)%\Windows Kits\10\bin')]
    for root in roots:
        if not os.path.isdir(root):
            continue
        for ver in sorted(os.listdir(root), reverse=True):
            for arch in ('x64', 'x86'):
                candidate = os.path.join(root, ver, arch, 'signtool.exe')
                if os.path.isfile(candidate):
                    return candidate
    return None


def sign(path):
    """Signiert ``path`` falls ein Zertifikat per Umgebungsvariable hinterlegt ist.

    Ohne ESELSHOT_CERT_PFX/-THUMBPRINT ein stiller No-Op - Signieren ist
    optional, siehe Modul-Docstring."""
    pfx = os.environ.get('ESELSHOT_CERT_PFX')
    thumbprint = os.environ.get('ESELSHOT_CERT_THUMBPRINT')
    if not pfx and not thumbprint:
        return False

    signtool = find_signtool()
    if not signtool:
        raise RuntimeError(
            'ESELSHOT_CERT_* gesetzt, aber signtool.exe nicht gefunden. '
            'Windows SDK installieren (winget install Microsoft.WindowsSDK).'
        )

    cmd = [signtool, 'sign', '/fd', 'sha256', '/tr', 'http://timestamp.digicert.com', '/td', 'sha256']
    if pfx:
        cmd += ['/f', pfx]
        password = os.environ.get('ESELSHOT_CERT_PASSWORD')
        if password:
            cmd += ['/p', password]
    else:
        cmd += ['/sha1', thumbprint]
    cmd.append(path)

    print(f'>> Signiere {os.path.basename(path)} …')
    subprocess.run(cmd, check=True, cwd=HERE)
    return True


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

    # Die innere .exe signieren, bevor Inno Setup sie einpackt - sonst waere
    # nur der Installer signiert, das ausgelieferte Programm selbst aber
    # weiterhin "Unbekannter Herausgeber".
    sign(os.path.join(HERE, 'dist', 'EselShot', 'EselShot.exe'))

    iscc = find_iscc()
    print('>> Baue Installer mit Inno Setup …')
    subprocess.run(
        [iscc, f'/DMyAppVersion={version}', 'installer.iss'],
        check=True, cwd=HERE,
    )

    setup_exe = os.path.join(HERE, 'dist', f'EselShot-Setup-{version}.exe')
    sign(setup_exe)

    size = os.path.getsize(setup_exe) if os.path.isfile(setup_exe) else 0
    print(f'\nfertig: {setup_exe}  ({size / 1024 / 1024:.1f} MB)')
    return setup_exe


if __name__ == '__main__':
    build()
