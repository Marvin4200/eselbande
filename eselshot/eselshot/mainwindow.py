"""Das eigentliche Hauptfenster - erscheint in Taskleiste und Alt+Tab.

Baut direkt auf dem Tk-Root auf (kein Toplevel): so bekommt EselShot ein
richtiges Programmfenster statt nur Tray-Icon + Overlay. Schließen (X)
versteckt es nur (siehe app.py), beendet wird ausschließlich über das
Tray-Menü - genau wie bei anderen Tray-Programmen (Discord, Spotify, ...).
"""

import os
import time
import tkinter as tk
import webbrowser

from . import __version__, config, history, icon, winapi

BG = '#0f0f18'
CARD = '#16162a'
BORDER = '#2b2b40'
TEXT = '#e2e8f0'
MUTED = '#8b93a7'
ACCENT = '#818cf8'
SUCCESS = '#22c55e'

KIND_LABEL = {'image': '📷', 'gif': '🎞', 'file': '📄'}


def _relative_time(ts):
    delta = max(0, time.time() - ts)
    if delta < 60:
        return 'gerade eben'
    if delta < 3600:
        return f'vor {int(delta // 60)} min'
    if delta < 86400:
        return f'vor {int(delta // 3600)} h'
    return f'vor {int(delta // 86400)} d'


class MainWindow:
    """Lebt auf app.root - open()/hide() zeigen/verstecken nur, es gibt kein destroy()."""

    def __init__(self, root, cfg, app):
        self.root = root
        self.cfg = cfg
        self.app = app
        self._built = False

    def _ensure_built(self):
        """Widgets erst beim ersten tatsächlichen Anzeigen aufbauen.

        Einmal-Aktionen (--region, --file, --settings, ...) instanziieren
        EselShot genau wie der Dauerbetrieb, zeigen das Hauptfenster aber nie -
        ohne dieses Aufschieben würde jeder Kommandozeilenaufruf unnötig ein
        Icon rendern und bis zu 200 Verlaufszeilen aus history.json aufbauen,
        nur um sie sofort wieder wegzuwerfen."""
        if not self._built:
            self._build()
            self._built = True

    @staticmethod
    def _cached_ico_path():
        """Echtes Mehrgrößen-.ico mit Alphakanal erzeugen (einmalig, dann gecacht).

        ``iconphoto`` mit roh aus RGBA gebautem PPM (frühere Version) kennt
        keine Transparenz - die abgerundeten Ecken des Symbols erschienen
        dadurch als hartes Schwarz statt weich in der Titelleiste/Taskleiste.
        ``iconbitmap`` mit einer echten .ico-Datei rendert den Alphakanal
        dagegen korrekt."""
        path = os.path.join(config.config_dir(), 'eselshot.ico')
        if not os.path.isfile(path):
            icon.write_ico(path)
        return path

    # -- Aufbau -----------------------------------------------------------------
    def _build(self):
        root = self.root
        root.title('EselShot')
        root.configure(bg=BG)
        root.geometry('440x580+120+80')
        root.minsize(360, 420)

        try:
            root.iconbitmap(default=self._cached_ico_path())
        except Exception:
            pass
        root.update_idletasks()
        winapi.enable_dark_titlebar(root.winfo_id())

        header = tk.Frame(root, bg=BG)
        header.pack(fill='x', padx=18, pady=(16, 8))
        tk.Label(header, text='EselShot', bg=BG, fg=TEXT,
                 font=('Segoe UI', 15, 'bold')).pack(side='left')
        tk.Label(header, text=f'v{__version__}', bg=BG, fg=MUTED,
                 font=('Segoe UI', 9)).pack(side='left', padx=(8, 0), pady=(4, 0))
        gear = tk.Label(header, text='⚙ Einstellungen', bg=BG, fg=MUTED,
                        font=('Segoe UI', 9), cursor='hand2')
        gear.pack(side='right')
        gear.bind('<Button-1>', lambda e: self.app.settings.open())

        actions = tk.Frame(root, bg=BG)
        actions.pack(fill='x', padx=18, pady=(0, 12))
        self._action_btn(actions, 'Bereich', lambda: self.app.capture('region')).pack(
            side='left', expand=True, fill='x', padx=(0, 6))
        self._action_btn(actions, 'Vollbild', lambda: self.app.capture('full')).pack(
            side='left', expand=True, fill='x', padx=6)
        self._action_btn(actions, 'Fenster', lambda: self.app.capture('window')).pack(
            side='left', expand=True, fill='x', padx=6)
        self._action_btn(actions, 'GIF', self.app.capture_gif).pack(
            side='left', expand=True, fill='x', padx=(6, 0))

        list_head = tk.Frame(root, bg=BG)
        list_head.pack(fill='x', padx=18)
        tk.Label(list_head, text='Verlauf', bg=BG, fg=MUTED,
                 font=('Segoe UI', 9, 'bold')).pack(side='left')
        open_folder = tk.Label(list_head, text='Alle Dateien im Browser', bg=BG, fg=ACCENT,
                               font=('Segoe UI', 9, 'underline'), cursor='hand2')
        open_folder.pack(side='right')
        open_folder.bind('<Button-1>', lambda e: webbrowser.open(self.cfg.get('base_url', '')))
        self.clear_lbl = tk.Label(list_head, text='Verlauf leeren', bg=BG, fg=MUTED,
                                  font=('Segoe UI', 9, 'underline'), cursor='hand2')
        self.clear_lbl.pack(side='right', padx=(0, 14))
        self.clear_lbl.bind('<Button-1>', lambda e: self._clear_history())

        list_wrap = tk.Frame(root, bg=CARD, highlightbackground=BORDER, highlightthickness=1)
        list_wrap.pack(fill='both', expand=True, padx=18, pady=(6, 12))

        self.canvas = tk.Canvas(list_wrap, bg=CARD, highlightthickness=0)
        vbar = tk.Scrollbar(list_wrap, orient='vertical', command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=vbar.set)
        vbar.pack(side='right', fill='y')
        self.canvas.pack(side='left', fill='both', expand=True)

        self.rows_frame = tk.Frame(self.canvas, bg=CARD)
        self._rows_window = self.canvas.create_window((0, 0), window=self.rows_frame,
                                                       anchor='nw')
        self.rows_frame.bind('<Configure>', lambda e: self.canvas.configure(
            scrollregion=self.canvas.bbox('all')))
        self.canvas.bind('<Configure>', lambda e: self.canvas.itemconfigure(
            self._rows_window, width=e.width))
        self.canvas.bind_all('<MouseWheel>', self._on_wheel)

        footer = tk.Frame(root, bg=BG)
        footer.pack(fill='x', padx=18, pady=(0, 14))
        tk.Label(footer, text='Schließen (X) legt EselShot nur in den Infobereich.',
                 bg=BG, fg=MUTED, font=('Segoe UI', 8), wraplength=300,
                 justify='left', anchor='w').pack(side='left', fill='x', expand=True)
        quit_lbl = tk.Label(footer, text='Beenden', bg=BG, fg=MUTED,
                            font=('Segoe UI', 8, 'underline'), cursor='hand2')
        quit_lbl.pack(side='right')
        quit_lbl.bind('<Button-1>', lambda e: self.app.quit())

        root.protocol('WM_DELETE_WINDOW', self.hide)

    def _on_wheel(self, event):
        if str(self.canvas.winfo_containing(event.x_root, event.y_root)).startswith(
                str(self.canvas)):
            self.canvas.yview_scroll(-1 if event.delta > 0 else 1, 'units')

    def _action_btn(self, parent, text, command):
        btn = tk.Label(parent, text=text, bg=CARD, fg=TEXT, font=('Segoe UI', 10, 'bold'),
                       cursor='hand2', pady=9, highlightbackground=BORDER, highlightthickness=1)
        btn.bind('<Button-1>', lambda e: command())
        btn.bind('<Enter>', lambda e: btn.configure(bg='#20203a'))
        btn.bind('<Leave>', lambda e: btn.configure(bg=CARD))
        return btn

    # -- Verlauf ------------------------------------------------------------------
    def refresh(self):
        if not self._built:
            return  # Fenster nie gezeigt - beim nächsten show() ohnehin frisch aufgebaut
        for child in self.rows_frame.winfo_children():
            child.destroy()

        entries = history.load()
        if not entries:
            tk.Label(self.rows_frame, text='Noch nichts hochgeladen.\nDruck drücken, um '
                                           'loszulegen.', bg=CARD, fg=MUTED,
                     font=('Segoe UI', 9), justify='center').pack(pady=30)
            return

        for i, entry in enumerate(entries):
            self._build_row(entry, top_border=i > 0)

    def _build_row(self, entry, top_border):
        row = tk.Frame(self.rows_frame, bg=CARD, highlightbackground=BORDER,
                       highlightthickness=1 if top_border else 0)
        row.pack(fill='x')
        inner = tk.Frame(row, bg=CARD)
        inner.pack(fill='x', padx=12, pady=8)

        kind_txt = KIND_LABEL.get(entry.get('kind', 'image'), '📷')
        tk.Label(inner, text=kind_txt, bg=CARD, fg=TEXT, font=('Segoe UI', 12)).pack(side='left')

        mid = tk.Frame(inner, bg=CARD)
        mid.pack(side='left', fill='x', expand=True, padx=(8, 8))
        tk.Label(mid, text=entry.get('name', '?'), bg=CARD, fg=TEXT, font=('Segoe UI', 9),
                 anchor='w').pack(fill='x')
        tk.Label(mid, text=_relative_time(entry.get('ts', 0)), bg=CARD, fg=MUTED,
                 font=('Segoe UI', 8), anchor='w').pack(fill='x')

        url = entry.get('url', '')
        entry_id = entry.get('id') or entry.get('ts')
        del_lbl = tk.Label(inner, text='✕', bg=CARD, fg=MUTED, font=('Segoe UI', 9),
                           cursor='hand2')
        del_lbl.pack(side='right', padx=(8, 0))
        del_lbl.bind('<Button-1>', lambda e, i=entry_id: self._delete(i))
        del_lbl.bind('<Enter>', lambda e: del_lbl.configure(fg='#ef4444'))
        del_lbl.bind('<Leave>', lambda e: del_lbl.configure(fg=MUTED))
        copy_lbl = tk.Label(inner, text='Kopieren', bg=CARD, fg=ACCENT,
                            font=('Segoe UI', 9), cursor='hand2')
        copy_lbl.pack(side='right', padx=(8, 0))
        copy_lbl.bind('<Button-1>', lambda e, u=url, l=copy_lbl: self._copy(u, l))
        open_lbl = tk.Label(inner, text='Öffnen', bg=CARD, fg=ACCENT,
                            font=('Segoe UI', 9), cursor='hand2')
        open_lbl.pack(side='right')
        open_lbl.bind('<Button-1>', lambda e, u=url: webbrowser.open(u))

    def _delete(self, entry_id):
        history.remove(entry_id)
        self.refresh()

    def _clear_history(self):
        if self.clear_lbl.cget('text') != 'Wirklich?':
            self.clear_lbl.configure(text='Wirklich?', fg='#ef4444')
            self.root.after(2500, lambda: self.clear_lbl.configure(
                text='Verlauf leeren', fg=MUTED))
            return
        history.clear()
        self.clear_lbl.configure(text='Verlauf leeren', fg=MUTED)
        self.refresh()

    def _copy(self, url, label):
        if winapi.set_clipboard_text(url):
            original = label.cget('text')
            label.configure(text='Kopiert', fg=SUCCESS)
            self.root.after(1200, lambda: label.configure(text=original, fg=ACCENT))

    # -- Sichtbarkeit ---------------------------------------------------------
    def show(self):
        self._ensure_built()
        self.refresh()
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()

    def hide(self):
        self.root.withdraw()
