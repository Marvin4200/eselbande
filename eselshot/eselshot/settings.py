"""Einstellungsfenster: Token hinterlegen, Verhalten festlegen."""

import threading
import tkinter as tk
from tkinter import filedialog

from . import __version__, config, pairing, uploader, winapi

BG = '#0f0f18'
CARD = '#16162a'
BORDER = '#2b2b40'
TEXT = '#e2e8f0'
MUTED = '#8b93a7'
ACCENT = '#818cf8'
SUCCESS = '#22c55e'
DANGER = '#ef4444'
DISCORD = '#5865F2'


class SettingsWindow:
    """Ein Fenster pro Programmstart; erneutes Öffnen holt es nach vorne."""

    def __init__(self, root, cfg, on_save=None):
        self.root = root
        self.cfg = cfg
        self.on_save = on_save or (lambda cfg: None)
        self.win = None

    def open(self):
        if self.win is not None and self.win.winfo_exists():
            self.win.lift()
            self.win.focus_force()
            return

        win = tk.Toplevel(self.root)
        self.win = win
        win.title('EselShot – Einstellungen')
        win.configure(bg=BG)
        win.resizable(False, False)
        win.protocol('WM_DELETE_WINDOW', self._close)
        win.update_idletasks()
        winapi.enable_dark_titlebar(win.winfo_id())
        self._pairing_active = False

        head = tk.Frame(win, bg=BG)
        head.pack(fill='x', padx=22, pady=(20, 6))
        tk.Label(head, text='EselShot', bg=BG, fg=TEXT,
                 font=('Segoe UI', 16, 'bold')).pack(side='left')
        tk.Label(head, text='files.eselbande.com', bg=BG, fg=MUTED,
                 font=('Segoe UI', 10)).pack(side='left', padx=(8, 0), pady=(6, 0))
        tk.Label(head, text=f'v{__version__}', bg=BG, fg=MUTED,
                 font=('Segoe UI', 9)).pack(side='right', pady=(6, 0))

        body = tk.Frame(win, bg=CARD, highlightbackground=BORDER, highlightthickness=1)
        body.pack(fill='both', padx=22, pady=(8, 6))

        self._label(body, 'Server')
        self.url_var = tk.StringVar(value=self.cfg.get('base_url', ''))
        self._entry(body, self.url_var)

        self.token_var = tk.StringVar(value=self.cfg.get('token', ''))
        self._label(body, 'Konto')
        account_row = tk.Frame(body, bg=CARD)
        account_row.pack(fill='x', padx=16, pady=(0, 4))
        self.account_row = account_row
        self._build_account_row()

        opts = tk.Frame(body, bg=CARD)
        opts.pack(fill='x', padx=12, pady=(14, 4))
        self.copy_var = tk.BooleanVar(value=self.cfg.get('copy_link', True))
        self.browser_var = tk.BooleanVar(value=self.cfg.get('open_browser', False))
        self.autostart_var = tk.BooleanVar(value=config.autostart_enabled())
        self._check(opts, 'Link nach dem Upload in die Zwischenablage', self.copy_var)
        self._check(opts, 'Link zusätzlich im Browser öffnen', self.browser_var)
        self._check(opts, 'EselShot mit Windows starten', self.autostart_var)

        self._label(body, 'Speicherordner (leer = jedes Mal fragen)')
        dir_row = tk.Frame(body, bg=CARD)
        dir_row.pack(fill='x', padx=16, pady=(0, 16))
        self.dir_var = tk.StringVar(value=self.cfg.get('save_dir', ''))
        tk.Entry(dir_row, textvariable=self.dir_var, bg=BG, fg=TEXT, insertbackground=TEXT,
                 relief='flat', font=('Segoe UI', 9), highlightthickness=1,
                 highlightbackground=BORDER).pack(side='left', fill='x', expand=True, ipady=5)
        self._button(dir_row, 'Wählen', self._pick_dir, primary=False).pack(side='left', padx=(8, 0))

        self.status = tk.Label(win, text='', bg=BG, fg=MUTED, font=('Segoe UI', 9),
                               wraplength=430, justify='left')
        self.status.pack(fill='x', padx=22, pady=(2, 0))

        actions = tk.Frame(win, bg=BG)
        actions.pack(fill='x', padx=22, pady=(10, 20))
        self._button(actions, 'Verbindung testen', self._test, primary=False).pack(side='left')
        self._button(actions, 'Schließen', self._close, primary=False).pack(side='right', padx=(8, 0))
        self._button(actions, 'Speichern', self._save, primary=True).pack(side='right')

        win.update_idletasks()
        w, h = win.winfo_width(), win.winfo_height()
        sw, sh = win.winfo_screenwidth(), win.winfo_screenheight()
        win.geometry(f'+{(sw - w) // 2}+{(sh - h) // 3}')
        win.lift()
        win.focus_force()

    # -- Bausteine ------------------------------------------------------------
    def _label(self, parent, text):
        tk.Label(parent, text=text, bg=CARD, fg=MUTED, font=('Segoe UI', 9)).pack(
            anchor='w', padx=16, pady=(14, 4))

    def _entry(self, parent, var):
        entry = tk.Entry(parent, textvariable=var, bg=BG, fg=TEXT, insertbackground=TEXT,
                         relief='flat', font=('Segoe UI', 10), highlightthickness=1,
                         highlightbackground=BORDER, highlightcolor=ACCENT)
        entry.pack(fill='x', padx=16, ipady=6)
        return entry

    def _check(self, parent, text, var):
        tk.Checkbutton(parent, text=text, variable=var, bg=CARD, fg=TEXT, selectcolor=BG,
                       activebackground=CARD, activeforeground=TEXT, bd=0, anchor='w',
                       font=('Segoe UI', 9)).pack(anchor='w', pady=1)

    def _button(self, parent, text, command, primary=False, bg=None, fg=None, hover=None):
        base_bg = bg if bg else (ACCENT if primary else CARD)
        base_fg = fg if fg else ('#0b0b14' if primary else TEXT)
        hover_bg = hover if hover else ('#a5aefc' if primary else '#20203a')
        btn = tk.Label(parent, text=f'  {text}  ', bg=base_bg, fg=base_fg,
                       font=('Segoe UI', 10, 'bold'), cursor='hand2', padx=8, pady=7,
                       highlightbackground=BORDER, highlightthickness=0 if (primary or bg) else 1)
        btn.bind('<Button-1>', lambda e: command())
        btn.bind('<Enter>', lambda e: btn.configure(bg=hover_bg))
        btn.bind('<Leave>', lambda e: btn.configure(bg=base_bg))
        return btn

    # -- Konto / Discord-Login --------------------------------------------------
    def _build_account_row(self):
        for child in self.account_row.winfo_children():
            child.destroy()

        if self._pairing_active:
            tk.Label(self.account_row, text='Warte auf Bestätigung im Browser …', bg=CARD,
                     fg=MUTED, font=('Segoe UI', 9)).pack(side='left')
            cancel = tk.Label(self.account_row, text='Abbrechen', bg=CARD, fg=ACCENT,
                              font=('Segoe UI', 9, 'underline'), cursor='hand2')
            cancel.pack(side='right')
            cancel.bind('<Button-1>', lambda e: self._cancel_pairing())
            return

        if self.token_var.get().strip():
            name = self.cfg.get('account_name', '')
            label = f'Verbunden als {name}' if name else 'Verbunden'
            tk.Label(self.account_row, text=label, bg=CARD, fg=SUCCESS,
                     font=('Segoe UI', 9, 'bold')).pack(side='left')
            switch = tk.Label(self.account_row, text='Trennen', bg=CARD, fg=MUTED,
                              font=('Segoe UI', 9, 'underline'), cursor='hand2')
            switch.pack(side='right')
            switch.bind('<Button-1>', lambda e: self._disconnect())
            return

        self._button(self.account_row, '🔗  Mit Discord anmelden', self._start_login,
                    bg=DISCORD, fg='#ffffff', hover='#6b74f5').pack(side='left', fill='x', expand=True)

    def _start_login(self):
        url = self.url_var.get().strip().rstrip('/') or 'https://files.eselbande.com'
        self._set_status('Öffne den Browser …')

        def work():
            try:
                code = pairing.start(url)
            except pairing.PairingError as err:
                text = str(err)
                self.win.after(0, lambda: self._set_status(text, DANGER))
                return
            self._pairing_active = True
            self.win.after(0, lambda: (self._build_account_row(),
                                       self._set_status('Im Browser bestätigen …')))
            pairing.poll_async(
                url, code,
                on_done=lambda token, base: self._safe_after(lambda: self._pair_done(token, base)),
                on_error=lambda msg: self._safe_after(lambda: self._pair_failed(msg)),
                on_timeout=lambda: self._safe_after(lambda: self._pair_failed(
                    'Zeit abgelaufen - bitte erneut versuchen.')),
                should_cancel=lambda: not self._pairing_active,
            )

        threading.Thread(target=work, daemon=True).start()

    def _safe_after(self, fn):
        """fn im Tk-Hauptthread ausführen - aber nur, wenn das Fenster noch lebt.

        Nötig, weil Login-Polling im Hintergrund-Thread läuft: der Nutzer
        kann die Einstellungen währenddessen schließen."""
        if self.win is not None:
            try:
                self.win.after(0, fn)
            except tk.TclError:
                pass

    def _pair_done(self, token, base_url):
        self._pairing_active = False
        self.token_var.set(token)
        self.url_var.set(base_url)
        self._set_status('Verbunden - wird gespeichert …', SUCCESS)

        def fetch_name():
            try:
                me = uploader.check_token(base_url, token)
                self.cfg['account_name'] = me.get('username', '')
            except uploader.UploadError:
                pass
            self._safe_after(self._save)

        threading.Thread(target=fetch_name, daemon=True).start()

    def _pair_failed(self, message):
        self._pairing_active = False
        self._build_account_row()
        self._set_status(message, DANGER)

    def _cancel_pairing(self):
        self._pairing_active = False
        self._build_account_row()
        self._set_status('Anmeldung abgebrochen.')

    def _disconnect(self):
        self.token_var.set('')
        self.cfg['account_name'] = ''
        self._build_account_row()
        self._save()

    # -- Aktionen -------------------------------------------------------------
    def _pick_dir(self):
        path = filedialog.askdirectory(parent=self.win, title='Speicherordner wählen')
        if path:
            self.dir_var.set(path)

    def _set_status(self, text, color=MUTED):
        self.status.configure(text=text, fg=color)

    def _test(self):
        url = self.url_var.get().strip().rstrip('/')
        token = self.token_var.get().strip()
        self._set_status('Teste Verbindung …')

        def work():
            try:
                me = uploader.check_token(url, token)
                used = me.get('usedBytes', 0) / 1024 / 1024
                quota = me.get('quotaBytes', 0) / 1024 / 1024 / 1024
                msg = (f'Verbunden als {me.get("username", "?")} · '
                       f'{used:.1f} MB von {quota:.0f} GB belegt')
                self.win.after(0, lambda: self._set_status(msg, SUCCESS))
            except uploader.UploadError as err:
                text = str(err)
                self.win.after(0, lambda: self._set_status(text, DANGER))

        threading.Thread(target=work, daemon=True).start()

    def _save(self):
        self.cfg['base_url'] = self.url_var.get().strip().rstrip('/')
        self.cfg['token'] = self.token_var.get().strip()
        self.cfg['copy_link'] = bool(self.copy_var.get())
        self.cfg['open_browser'] = bool(self.browser_var.get())
        self.cfg['save_dir'] = self.dir_var.get().strip()
        config.save(self.cfg)
        try:
            config.set_autostart(bool(self.autostart_var.get()))
        except OSError as err:
            self._set_status(f'Autostart nicht gesetzt: {err}', DANGER)
        self.on_save(self.cfg)
        self._set_status('Gespeichert.', SUCCESS)
        self.win.after(700, self._close)

    def _close(self):
        if self.win is not None:
            self.win.destroy()
            self.win = None
