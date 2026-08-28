"""Upload zum Filehoster (files.eselbande.com) per API-Token."""

import json
import os
import urllib.error
import urllib.request
import uuid

USER_AGENT = 'EselShot/1.0 (+https://files.eselbande.com)'


class UploadError(Exception):
    """Fehler mit einer Meldung, die direkt angezeigt werden kann."""


def _request(url, token, data=None, content_type=None, method=None, timeout=120):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('User-Agent', USER_AGENT)
    if content_type:
        req.add_header('Content-Type', content_type)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as err:
        body = err.read().decode('utf-8', 'replace')
        try:
            message = json.loads(body).get('error')
        except ValueError:
            message = None
        if err.code == 401 and message in (None, 'Unauthorized'):
            message = 'Token ungültig – bitte in den Einstellungen prüfen.'
        raise UploadError(message or f'Server-Fehler {err.code}') from err
    except urllib.error.URLError as err:
        raise UploadError(f'Keine Verbindung: {err.reason}') from err
    except ValueError as err:
        raise UploadError('Unerwartete Antwort vom Server') from err


def check_token(base_url, token):
    """Prüft das Token und liefert die Kontodaten zurück."""
    if not token:
        raise UploadError('Kein Token hinterlegt')
    return _request(f'{base_url.rstrip("/")}/api/me', token, timeout=20)


def upload(base_url, token, data, filename, mime='image/png'):
    """Datei hochladen, liefert die öffentliche URL."""
    if not token:
        raise UploadError('Kein Token hinterlegt - bitte zuerst einrichten.')

    boundary = f'----EselShot{uuid.uuid4().hex}'
    head = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f'Content-Type: {mime}\r\n\r\n'
    ).encode('utf-8')
    body = head + data + f'\r\n--{boundary}--\r\n'.encode('utf-8')

    result = _request(f'{base_url.rstrip("/")}/api/upload', token, data=body,
                      content_type=f'multipart/form-data; boundary={boundary}')
    url = result.get('url')
    if not url:
        raise UploadError('Server hat keinen Link zurückgegeben')
    return url


def upload_file(base_url, token, path):
    """Beliebige Datei von der Platte hochladen."""
    import mimetypes
    with open(path, 'rb') as fh:
        data = fh.read()
    mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    return upload(base_url, token, data, os.path.basename(path), mime)
