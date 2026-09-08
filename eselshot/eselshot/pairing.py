"""Login mit Discord statt manuellem Token-Copy-Paste.

Ablauf: Server ausgeben lassen einen kurzen Code, Browser mit dem Code
öffnen, dort mit Discord anmelden und bestätigen - währenddessen hier im
Hintergrund abfragen, bis der Server das fertige API-Token bereitstellt.
Der Nutzer sieht nie eine rohe Tokenzeichenkette, geschweige denn muss er
sie irgendwo einfügen.
"""

import json
import threading
import time
import urllib.error
import urllib.request
import webbrowser

USER_AGENT = 'EselShot/1.0 (+https://files.eselbande.com)'
POLL_INTERVAL = 2.0
TIMEOUT_SECONDS = 5 * 60


class PairingError(Exception):
    """Fehler mit einer Meldung, die direkt angezeigt werden kann."""


def _post(url, payload=None, timeout=15):
    data = json.dumps(payload or {}).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('User-Agent', USER_AGENT)
    return _send(req, timeout)


def _get(url, timeout=15):
    req = urllib.request.Request(url)
    req.add_header('User-Agent', USER_AGENT)
    return _send(req, timeout)


def _send(req, timeout):
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as err:
        body = err.read().decode('utf-8', 'replace')
        try:
            message = json.loads(body).get('error')
        except ValueError:
            message = None
        raise PairingError(message or f'Server-Fehler {err.code}') from err
    except urllib.error.URLError as err:
        raise PairingError(f'Keine Verbindung: {err.reason}') from err
    except ValueError as err:
        raise PairingError('Unerwartete Antwort vom Server') from err


def start(base_url):
    """Code beim Server anfordern und die Bestätigungsseite im Browser öffnen.

    Gibt den Code zurück (zur Anzeige, falls der Browser sich nicht öffnen
    lässt)."""
    base = base_url.rstrip('/')
    data = _post(f'{base}/api/eselshot/pair/start')
    code = data['code']
    webbrowser.open(f'{base}/eselshot/pair?code={code}')
    return code


def poll_async(base_url, code, on_done, on_error, on_timeout, should_cancel=None):
    """In einem Hintergrund-Thread auf das Token warten.

    on_done(token, base_url) wird beim Erfolg aufgerufen, on_error(message)
    bei einem Serverfehler, on_timeout() falls niemand innerhalb von
    TIMEOUT_SECONDS bestätigt. Alle drei laufen im Hintergrund-Thread - der
    Aufrufer muss selbst über ``root.after(0, ...)`` in den Tk-Hauptthread
    wechseln."""
    base = base_url.rstrip('/')

    def work():
        deadline = time.monotonic() + TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            if should_cancel and should_cancel():
                return
            try:
                data = _get(f'{base}/api/eselshot/pair/poll?code={code}')
            except PairingError as err:
                on_error(str(err))
                return
            if data.get('ready'):
                on_done(data['token'], data.get('base_url') or base_url)
                return
            time.sleep(POLL_INTERVAL)
        on_timeout()

    threading.Thread(target=work, daemon=True).start()
