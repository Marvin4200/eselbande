"""EselShot – Screenshots aufnehmen und auf files.eselbande.com teilen.

Das Programm läuft im Infobereich (Tray) und wartet auf einen Hotkey. Die
Oberfläche lebt komplett im Hauptthread; Tray und Hotkeys laufen daneben und
melden sich über eine Warteschlange.
"""

import argparse
import os
import queue
import sys
import threading
import time
import tkinter as tk
import webbrowser
from datetime import datetime
from tkinter import filedialog

from . import config, pngenc, uploader, winapi
from .editor import Editor
from .notify import Toast
from .settings import SettingsWindow
from .tray import Tray

HK_REGION, HK_REGION_ALT, HK_FULL, HK_WINDOW = 1, 2, 3, 4

MENU_REGION, MENU_FULL, MENU_WINDOW = 100, 101, 102
MENU_FILE, MENU_MYFILES, MENU_SETTINGS, MENU_AUTOSTART, MENU_QUIT = 103, 104, 110, 112, 199

HOTKEY_LABELS = {
    HK_REGION: 'Druck',
    HK_REGION_ALT: 'Strg+Umschalt+S',
    HK_FULL: 'Strg+Umschalt+F',
    HK_WINDOW: 'Strg+Umschalt+W',
}


def timestamp_name():
    return datetime.now().strftime('eselshot-%Y%m%d-%H%M%S.png')


class EselShot:
    def __init__(self):
        self.cfg = config.load()
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title('EselShot')
        self.toast = Toast(self.root)
        self.settings = SettingsWindow(self.root, self.cfg, on_save=self._on_settings_saved)
        self.events = queue.Queue()
        self.busy = False
        self.tray = None
        self.pending_uploads = 0

    # -- Aufnahme --------------------------------------------------------------
    def capture(self, mode='region'):
        """mode: region | full | window"""
        if self.busy:
            return
        preset = None
        if mode == 'full':
            preset = winapi.virtual_screen()
        elif mode == 'window':
            preset = winapi.foreground_window_rect() or winapi.virtual_screen()

        self.busy = True
        self.toast.hide()
        self.root.update()
        time.sleep(0.12)  # Toast und Menü vom Bildschirm verschwinden lassen
        try:
            Editor(self.root, self._on_capture_done, self._on_capture_cancel).open(preset)
        except Exception as err:  # Overlay darf das Programm nie mitreißen
            self.busy = False
            self.toast.show('error', 'Aufnahme fehlgeschlagen', str(err))

    def _on_capture_cancel(self):
        self.busy = False

    def _on_capture_done(self, action, rgba, width, height):
        self.busy = False
        if action == 'copy':
            ok = winapi.set_clipboard_image(rgba, width, height)
            self.toast.show('success' if ok else 'error',
                            'In der Zwischenablage' if ok else 'Kopieren fehlgeschlagen',
                            f'{width} × {height} Pixel')
            return

        if action == 'save':
            self._save_to_disk(rgba, width, height)
            return

        self._upload(rgba, width, height)

    def _save_to_disk(self, rgba, width, height):
        name = timestamp_name()
        target_dir = self.cfg.get('save_dir') or ''
        if target_dir and os.path.isdir(target_dir):
            path = os.path.join(target_dir, name)
        else:
            path = filedialog.asksaveasfilename(
                parent=self.root, title='Screenshot speichern', initialfile=name,
                defaultextension='.png', filetypes=[('PNG-Bild', '*.png')])
            if not path:
                return
        try:
            with open(path, 'wb') as fh:
                fh.write(pngenc.encode(width, height, rgba))
        except OSError as err:
            self.toast.show('error', 'Speichern fehlgeschlagen', str(err))
            return
        self.toast.show('success', 'Gespeichert', path)

    def _upload(self, rgba, width, height):
        if not self.cfg.get('token'):
            self.toast.show('error', 'Kein Token hinterlegt',
                            'Einstellungen öffnen und Token eintragen.')
            self.settings.open()
            return

        self.toast.show('progress', 'Wird hochgeladen', f'{width} × {height} Pixel')
        name = timestamp_name()

        def work():
            try:
                data = pngenc.encode(width, height, rgba)
                url = uploader.upload(self.cfg['base_url'], self.cfg['token'], data, name)
            except (uploader.UploadError, OSError) as err:
                message = str(err)
                self.root.after(0, lambda: self.toast.show('error', 'Upload fehlgeschlagen', message))
                return
            self.root.after(0, lambda: self._upload_done(url))

        self._start_upload(work)

    def _start_upload(self, work):
        self.pending_uploads += 1

        def runner():
            try:
                work()
            finally:
                self.root.after(0, self._upload_finished)

        threading.Thread(target=runner, daemon=True).start()

    def _upload_finished(self):
        self.pending_uploads = max(0, self.pending_uploads - 1)

    def _upload_done(self, url):
        copied = winapi.set_clipboard_text(url) if self.cfg.get('copy_link', True) else False
        if self.cfg.get('open_browser'):
            webbrowser.open(url)
        title = 'Link kopiert' if copied else 'Hochgeladen'
        self.toast.show('success', title, url, url=url, timeout=6000)

    def upload_existing_file(self, path):
        """Beliebige Datei hochladen (Menüpunkt bzw. --file)."""
        if not os.path.isfile(path):
            self.toast.show('error', 'Datei nicht gefunden', path)
            return
        self.toast.show('progress', 'Wird hochgeladen', os.path.basename(path))

        def work():
            try:
                url = uploader.upload_file(self.cfg['base_url'], self.cfg['token'], path)
            except (uploader.UploadError, OSError) as err:
                message = str(err)
                self.root.after(0, lambda: self.toast.show('error', 'Upload fehlgeschlagen', message))
                return
            self.root.after(0, lambda: self._upload_done(url))

        self._start_upload(work)

    # -- Tray ------------------------------------------------------------------
    def _menu_items(self):
        return [
            (MENU_REGION, 'Bereich aufnehmen\tDruck', False),
            (MENU_FULL, 'Ganzer Bildschirm\tStrg+Umschalt+F', False),
            (MENU_WINDOW, 'Aktives Fenster\tStrg+Umschalt+W', False),
            None,
            (MENU_FILE, 'Datei hochladen …', False),
            (MENU_MYFILES, 'Meine Dateien im Browser', False),
            None,
            (MENU_SETTINGS, 'Einstellungen …', False),
            (MENU_AUTOSTART, 'Mit Windows starten', config.autostart_enabled()),
            None,
            (MENU_QUIT, 'Beenden', False),
        ]

    def _on_tray_event(self, event):
        """Läuft im Tray-Thread - nur einreihen, nichts anfassen."""
        self.events.put(event)

    def _poll_events(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == 'hotkey':
                    self._handle_hotkey(value)
                else:
                    self._handle_menu(value)
        except queue.Empty:
            pass
        self.root.after(40, self._poll_events)

    def _handle_hotkey(self, hotkey_id):
        if hotkey_id in (HK_REGION, HK_REGION_ALT):
            self.capture('region')
        elif hotkey_id == HK_FULL:
            self.capture('full')
        elif hotkey_id == HK_WINDOW:
            self.capture('window')

    def _handle_menu(self, item):
        if item in ('capture', MENU_REGION):
            self.capture('region')
        elif item == MENU_FULL:
            self.capture('full')
        elif item == MENU_WINDOW:
            self.capture('window')
        elif item == MENU_FILE:
            path = filedialog.askopenfilename(parent=self.root, title='Datei hochladen')
            if path:
                self.upload_existing_file(path)
        elif item == MENU_MYFILES:
            webbrowser.open(self.cfg['base_url'])
        elif item == MENU_SETTINGS:
            self.settings.open()
        elif item == MENU_AUTOSTART:
            try:
                config.set_autostart(not config.autostart_enabled())
            except OSError as err:
                self.toast.show('error', 'Autostart', str(err))
        elif item == MENU_QUIT:
            self.quit()

    def _on_settings_saved(self, cfg):
        self.cfg = cfg

    def quit(self):
        if self.tray:
            self.tray.stop()
        self.root.quit()

    # -- Start -----------------------------------------------------------------
    def run_tray(self):
        hotkeys = [
            (HK_REGION_ALT, winapi.MOD_CONTROL | winapi.MOD_SHIFT | winapi.MOD_NOREPEAT, ord('S')),
            (HK_FULL, winapi.MOD_CONTROL | winapi.MOD_SHIFT | winapi.MOD_NOREPEAT, ord('F')),
            (HK_WINDOW, winapi.MOD_CONTROL | winapi.MOD_SHIFT | winapi.MOD_NOREPEAT, ord('W')),
        ]
        if self.cfg.get('hotkey_region', True):
            hotkeys.insert(0, (HK_REGION, winapi.MOD_NOREPEAT, winapi.VK_SNAPSHOT))

        self.tray = Tray('EselShot – Druck für einen Screenshot',
                         self._on_tray_event, self._menu_items, hotkeys).start()

        self._announce_start(hotkeys)
        self._poll_events()
        self.root.mainloop()

    def _announce_start(self, hotkeys):
        """Beim Start zeigen, welche Tasten wirklich belegt werden konnten.

        Andere Programme (Snipping Tool, OBS, Discord …) greifen sich Hotkeys
        zuerst; RegisterHotKey scheitert dann still. Das soll man merken."""
        blocked = set(self.tray.failed_hotkeys)
        free = [HOTKEY_LABELS[i] for i, _, _ in hotkeys
                if i not in blocked and i in HOTKEY_LABELS]
        region = [HOTKEY_LABELS[i] for i in (HK_REGION, HK_REGION_ALT)
                  if i not in blocked and any(h[0] == i for h in hotkeys)]

        if not self.cfg.get('token'):
            self.toast.show('info', 'EselShot läuft',
                            'Noch kein Token – Einstellungen öffnen.', timeout=6000)
            self.root.after(400, self.settings.open)
        elif not free:
            self.toast.show('error', 'Alle Tastenkürzel belegt',
                            'Screenshot über das Tray-Symbol starten.', timeout=8000)
        elif region:
            note = ' oder '.join(region) + ' für einen Screenshot.'
            if blocked:
                note += f' Belegt: {", ".join(HOTKEY_LABELS[i] for i in sorted(blocked))}.'
            self.toast.show('info', 'EselShot läuft', note, timeout=5000)
        else:
            self.toast.show('info', 'EselShot läuft',
                            'Bereichsauswahl über das Tray-Symbol – ihre Tasten sind belegt.',
                            timeout=7000)

    def run_once(self, mode):
        """Einmalige Aufnahme ohne Tray - beendet sich danach selbst."""
        def done():
            self.root.after(1200, self.root.quit)

        original = self._on_capture_done

        def wrapped(action, rgba, width, height):
            original(action, rgba, width, height)
            if action == 'upload':
                self.root.after(200, self._wait_for_idle)
            else:
                done()

        self._on_capture_done = wrapped
        self.root.after(60, lambda: self.capture(mode))
        self._poll_events()
        self.root.mainloop()

    def _wait_for_idle(self):
        """Nach dem Upload noch kurz stehen bleiben, damit die Meldung sichtbar ist."""
        if self.pending_uploads:
            self.root.after(200, self._wait_for_idle)
        else:
            self.root.after(2500, self.root.quit)


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog='eselshot', description='Screenshots aufnehmen und auf eselbande.com teilen')
    parser.add_argument('--tray', action='store_true', help='im Infobereich starten (Standard)')
    parser.add_argument('--region', action='store_true', help='einmalig Bereich aufnehmen')
    parser.add_argument('--full', action='store_true', help='einmalig ganzen Bildschirm aufnehmen')
    parser.add_argument('--window', action='store_true', help='einmalig aktives Fenster aufnehmen')
    parser.add_argument('--file', metavar='PFAD', help='vorhandene Datei hochladen')
    parser.add_argument('--settings', action='store_true', help='nur die Einstellungen öffnen')
    parser.add_argument('--install', action='store_true',
                        help='installieren (Startmenü, Autostart, Deinstall-Eintrag)')
    parser.add_argument('--uninstall', action='store_true',
                        help='EselShot wieder entfernen')
    parser.add_argument('--silent', action='store_true',
                        help='ohne Rückfrage (nur zusammen mit --install/--uninstall)')
    args = parser.parse_args(argv)

    if args.install:
        from .installer import install, run_installer_ui
        if args.silent:
            install()
        else:
            run_installer_ui()
        return 0
    if args.uninstall:
        from .installer import run_uninstaller_ui
        run_uninstaller_ui(silent=args.silent)
        return 0


    winapi.enable_dpi_awareness()
    app = EselShot()

    if args.settings:
        app.settings.open()
        app.root.mainloop()
        return 0
    if args.file:
        app.upload_existing_file(args.file)
        app.root.after(300, app._wait_for_idle)
        app.root.mainloop()
        return 0
    if args.region or args.full or args.window:
        app.run_once('full' if args.full else ('window' if args.window else 'region'))
        return 0

    app.run_tray()
    return 0


if __name__ == '__main__':
    sys.exit(main())
