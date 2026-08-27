"""Einstellungen in %APPDATA%\\EselShot\\config.json."""

import json
import os
import sys

APP_NAME = 'EselShot'
DEFAULTS = {
    'base_url': 'https://files.eselbande.com',
    'token': '',
    'copy_link': True,       # Link nach dem Upload in die Zwischenablage
    'open_browser': False,   # Link zusätzlich im Browser öffnen
    'save_dir': '',          # leer = Ordner beim Speichern jedes Mal abfragen
    'hotkey_region': True,   # Druck-Taste für Bereichsauswahl belegen
}


def config_dir():
    base = os.environ.get('APPDATA') or os.path.expanduser('~')
    path = os.path.join(base, APP_NAME)
    os.makedirs(path, exist_ok=True)
    return path


def config_path():
    return os.path.join(config_dir(), 'config.json')


def load():
    cfg = dict(DEFAULTS)
    try:
        with open(config_path(), encoding='utf-8') as fh:
            stored = json.load(fh)
        if isinstance(stored, dict):
            cfg.update({k: v for k, v in stored.items() if k in DEFAULTS})
    except (OSError, ValueError):
        pass
    cfg['base_url'] = str(cfg['base_url']).rstrip('/')
    return cfg


def save(cfg):
    data = {k: cfg.get(k, v) for k, v in DEFAULTS.items()}
    tmp = config_path() + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2)
    os.replace(tmp, config_path())
    return data


# -- Autostart über den Run-Schlüssel der Registry -------------------------
RUN_KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'


def _pythonw():
    """pythonw.exe startet ohne Konsolenfenster."""
    exe = sys.executable
    candidate = os.path.join(os.path.dirname(exe), 'pythonw.exe')
    return candidate if os.path.exists(candidate) else exe


def autostart_command():
    package_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return f'"{_pythonw()}" -m eselshot --tray', package_root


def autostart_enabled():
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            winreg.QueryValueEx(key, APP_NAME)
        return True
    except OSError:
        return False


def set_autostart(enabled):
    """Beim Start von Windows mitstarten (an/aus)."""
    import winreg
    cmd, cwd = autostart_command()
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            # cmd /c wechselt erst in den Projektordner, damit -m eselshot gefunden wird
            full = f'cmd /c start "" /d "{cwd}" {cmd}'
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, full)
        else:
            try:
                winreg.DeleteValue(key, APP_NAME)
            except OSError:
                pass
    return enabled
