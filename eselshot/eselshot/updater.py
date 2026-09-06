"""Prueft auf eine neue EselShot-Version und aktualisiert sich selbst.

Nur relevant, wenn EselShot als von PyInstaller gebaute .exe laeuft
(``sys.frozen``) -- aus dem Quellcode gestartet (``python -m eselshot``) gibt
es kein "sich selbst ersetzen", dafuer bleibt es beim manuellen Update des
Quellcodes.

Der Server (``filehoster``) ist die einzige Quelle der Wahrheit fuer die
aktuelle Version -- siehe ``GET /api/eselshot/version``. Verglichen wird
gegen das hier laufende ``eselshot.__version__``.
"""

import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

from . import __version__

USER_AGENT = f'EselShot/{__version__} (+https://files.eselbande.com)'


class UpdateError(Exception):
    """Fehler mit einer Meldung, die direkt angezeigt werden kann."""


def _parse_version(text):
    """'1.4.0' -> (1, 4, 0). Robust gegen fehlende/zusaetzliche Teile und
    nicht-numerischen Kram (z.B. ein versehentliches 'v1.4.0')."""
    parts = []
    for chunk in str(text or '0').split('.'):
        digits = ''.join(ch for ch in chunk if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


def is_frozen():
    """True, wenn dieser Prozess die von PyInstaller gebaute .exe ist."""
    return bool(getattr(sys, 'frozen', False))


def check(base_url, timeout=10):
    """Fragt den Server nach der aktuellen Version.

    Liefert None bei Netzwerkfehlern, wenn der Server keine Version kennt,
    oder wenn die laufende Version bereits aktuell (oder neuer) ist -- sonst
    ein Dict mit ``version`` und ``download_url``.
    """
    url = f'{base_url.rstrip("/")}/api/eselshot/version'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            data = json.loads(res.read().decode('utf-8'))
    except (urllib.error.URLError, ValueError, OSError):
        return None

    if not data.get('available') or not data.get('version'):
        return None
    if _parse_version(data['version']) <= _parse_version(__version__):
        return None

    return {
        'version': data['version'],
        'size': data.get('size'),
        'download_url': f'{base_url.rstrip("/")}/download/EselShot-Setup.exe',
    }


def download(download_url, timeout=180):
    """Laedt die neue .exe in eine temporaere Datei, liefert deren Pfad.

    Bei jedem Fehler wird die (moeglicherweise unvollstaendige) Temp-Datei
    wieder geloescht -- nichts Halbfertiges soll je installiert werden.
    """
    req = urllib.request.Request(download_url, headers={'User-Agent': USER_AGENT})
    fd, path = tempfile.mkstemp(prefix='EselShot-update-', suffix='.exe')
    try:
        with os.fdopen(fd, 'wb') as fh, urllib.request.urlopen(req, timeout=timeout) as res:
            while True:
                chunk = res.read(262144)
                if not chunk:
                    break
                fh.write(chunk)
    except (urllib.error.URLError, OSError) as err:
        try:
            os.remove(path)
        except OSError:
            pass
        reason = getattr(err, 'reason', err)
        raise UpdateError(f'Download fehlgeschlagen: {reason}') from err

    if os.path.getsize(path) < 1_000_000:  # eine echte Setup.exe ist mehrere MB gross
        try:
            os.remove(path)
        except OSError:
            pass
        raise UpdateError('Heruntergeladene Datei sieht unvollstaendig aus.')

    return path


def apply_and_restart(new_exe_path):
    """Ersetzt die laufende .exe durch die heruntergeladene und startet neu.

    Windows haelt die Datei einer laufenden .exe gesperrt, solange sie laeuft
    -- ein kleines Hilfsskript wartet deshalb erst, bis DIESER Prozess (per
    PID) beendet ist, kopiert dann die neue Version drueber und startet sie
    am selben Pfad neu. Direkt nach dem Aufruf MUSS der Aufrufer sich beenden,
    sonst wartet das Skript endlos.
    """
    if not is_frozen():
        raise UpdateError('Automatisches Update ist nur in der .exe moeglich.')

    target = sys.executable
    fd, script_path = tempfile.mkstemp(prefix='EselShot-update-', suffix='.bat')
    os.close(fd)
    with open(script_path, 'w', encoding='utf-8', newline='\r\n') as fh:
        fh.write(
            '@echo off\r\n'
            'setlocal\r\n'
            'set "PID=%~1"\r\n'
            'set "NEWEXE=%~2"\r\n'
            'set "TARGET=%~3"\r\n'
            '\r\n'
            ':waitproc\r\n'
            'tasklist /FI "PID eq %PID%" 2>NUL | find "%PID%" >NUL\r\n'
            'if not errorlevel 1 (\r\n'
            '  timeout /t 1 /nobreak >NUL\r\n'
            '  goto waitproc\r\n'
            ')\r\n'
            '\r\n'
            'set /a TRIES=0\r\n'
            ':trycopy\r\n'
            'copy /Y "%NEWEXE%" "%TARGET%" >NUL 2>&1\r\n'
            'if errorlevel 1 (\r\n'
            '  set /a TRIES+=1\r\n'
            '  if %TRIES% GEQ 15 goto giveup\r\n'
            '  timeout /t 1 /nobreak >NUL\r\n'
            '  goto trycopy\r\n'
            ')\r\n'
            'del "%NEWEXE%" >NUL 2>&1\r\n'
            'start "" "%TARGET%"\r\n'
            'goto cleanup\r\n'
            '\r\n'
            ':giveup\r\n'
            'rem Kopieren nach 15 Versuchen weiter fehlgeschlagen -- alte Version bleibt nutzbar.\r\n'
            'start "" "%TARGET%"\r\n'
            '\r\n'
            ':cleanup\r\n'
            'del "%~f0"\r\n'
        )

    DETACHED_PROCESS = 0x00000008
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    subprocess.Popen(
        ['cmd', '/c', script_path, str(os.getpid()), new_exe_path, target],
        creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
        close_fds=True,
    )
