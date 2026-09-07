"""Verlauf der letzten Uploads, persistiert in %APPDATA%\\EselShot\\history.json.

Nur Metadaten (Name, Link, Zeitpunkt, Art) - keine Bilddaten selbst, das Bild
liegt ja schon auf dem Filehoster.
"""

import json
import os
import time

from . import config

MAX_ENTRIES = 200


def _path():
    return os.path.join(config.config_dir(), 'history.json')


def load():
    try:
        with open(_path(), encoding='utf-8') as fh:
            data = json.load(fh)
        if isinstance(data, list):
            return data
    except (OSError, ValueError):
        pass
    return []


def add(name, url, kind='image'):
    """Neuen Eintrag vorn einreihen und speichern. Gibt die aktualisierte Liste zurück."""
    entries = load()
    entries.insert(0, {'name': name, 'url': url, 'kind': kind, 'ts': time.time()})
    del entries[MAX_ENTRIES:]
    tmp = _path() + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(entries, fh, indent=2)
    os.replace(tmp, _path())
    return entries


def clear():
    try:
        os.remove(_path())
    except OSError:
        pass
