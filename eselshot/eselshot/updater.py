"""Update-Check und In-App-Updater für EselShot.

Der eigentliche Installationsschritt läuft komplett über den von Inno Setup
gebauten "EselShot-Setup-X.Y.Z.exe" im stillen Modus - kein selbstgebauter
Kopier-/Registry-/Verknüpfungscode mehr. Inno Setup übernimmt dabei auch das
Schließen der laufenden Instanz (CloseApplications, siehe installer.iss'
AppMutex/CloseApplicationsFilter) und startet EselShot danach selbst neu.
"""

import json
import os
import subprocess
import tempfile
import urllib.request

from eselshot import __version__ as CURRENT_VERSION

USER_AGENT = 'EselShot/1.0 (+https://files.eselbande.com)'


def _parse(v):
    try:
        return [int(x) for x in str(v).strip().split('.')]
    except Exception:
        return [0]


def is_newer(remote, local):
    return _parse(remote) > _parse(local)


def check(base_url, timeout=10):
    """Gibt (remote_version, setup_url) zurück wenn Update verfügbar, sonst None."""
    try:
        req = urllib.request.Request(
            f'{base_url.rstrip("/")}/api/eselshot/version',
            headers={'User-Agent': USER_AGENT},
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read())
        remote = data.get('version', '')
        if remote and is_newer(remote, CURRENT_VERSION):
            # ?v=<version> als Cache-Buster: files.eselbande.com liegt hinter
            # Cloudflare, das den Download bis zu 4 Stunden cached (eigener
            # Server-Header wird dabei überschrieben). Ohne das hier bekämen
            # Nutzer nach einem Release stundenlang eine alte gecachte Version
            # ausgeliefert, obwohl die API schon die neue meldet - und landen
            # dann in einer Update-Schleife, weil die "aktualisierte" Version
            # sich selbst sofort wieder als veraltet meldet.
            return remote, f'{base_url.rstrip("/")}/download/EselShot-Setup.exe?v={remote}'
    except Exception:
        pass
    return None


def download_and_install(setup_url, on_progress=None):
    """Setup-Installer herunterladen und still ausführen."""
    tmp_dir = tempfile.mkdtemp(prefix='EselShot_update_')
    setup_path = os.path.join(tmp_dir, 'EselShot-Setup.exe')

    req = urllib.request.Request(setup_url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=180) as r:
        total = int(r.headers.get('Content-Length') or 0)
        downloaded = 0
        with open(setup_path, 'wb') as fh:
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                fh.write(chunk)
                downloaded += len(chunk)
                if on_progress and total:
                    on_progress(downloaded / total)

    # Der Installer schließt die laufende Instanz selbst per taskkill
    # (installer.iss, InitializeSetup) und startet EselShot danach neu
    # ([Run]-Eintrag ohne skipifsilent) - kein eigener Prozess-Code mehr
    # nötig. Windows' eigener CloseApplications/RestartApplications-Mechanismus
    # (Restart Manager) erwies sich beim Testen als unzuverlässig, deshalb
    # der einfachere, nachweislich funktionierende taskkill-Weg.
    DETACHED = 0x00000008
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    subprocess.Popen([
        setup_path, '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART',
    ], creationflags=DETACHED | CREATE_NEW_PROCESS_GROUP, close_fds=True)
    return setup_path
