"""Kleine Benachrichtigung unten rechts - im Stil von eselbande.com."""

import tkinter as tk
import webbrowser

from . import winapi

BG = '#12121c'
BORDER = '#2b2b40'
TEXT = '#e2e8f0'
MUTED = '#8b93a7'
ACCENT = '#818cf8'
SUCCESS = '#22c55e'
DANGER = '#ef4444'

ICONS = {'progress': '⬆', 'success': '✓', 'error': '!', 'info': '\U0001f4c1'}
COLORS = {'progress': ACCENT, 'success': SUCCESS, 'error': DANGER, 'info': ACCENT}


class Toast:
    """Ein wiederverwendetes Fenster - neue Meldungen ersetzen die alte."""

    def __init__(self, root):
        self.root = root
        self.win = None
        self._hide_job = None
        self._anim_job = None
        self._url = None

    def _build(self):
        win = tk.Toplevel(self.root)
        win.withdraw()
        win.overrideredirect(True)
        win.attributes('-topmost', True)
        win.configure(bg=BORDER)

        outer = tk.Frame(win, bg=BG, padx=16, pady=13)
        outer.pack(padx=1, pady=1, fill='both', expand=True)

        self.icon = tk.Label(outer, text='', bg=BG, fg=ACCENT, font=('Segoe UI', 16, 'bold'))
        self.icon.pack(side='left', padx=(0, 12))

        col = tk.Frame(outer, bg=BG)
        col.pack(side='left', fill='both', expand=True)
        self.title = tk.Label(col, text='', bg=BG, fg=TEXT, font=('Segoe UI', 10, 'bold'),
                              anchor='w', justify='left')
        self.title.pack(anchor='w')
        self.message = tk.Label(col, text='', bg=BG, fg=MUTED, font=('Segoe UI', 9),
                                anchor='w', justify='left', wraplength=330)
        self.message.pack(anchor='w', pady=(2, 0))

        for widget in (win, outer, col, self.icon, self.title, self.message):
            widget.bind('<Button-1>', self._on_click)
        self.win = win

    def _on_click(self, _event=None):
        if self._url:
            webbrowser.open(self._url)
        self.hide()

    def show(self, kind, title, message='', url=None, timeout=4500):
        if self.win is None:
            self._build()
        self._url = url
        self.icon.configure(text=ICONS.get(kind, ''), fg=COLORS.get(kind, ACCENT))
        self.title.configure(text=title)
        self.message.configure(text=message, fg=ACCENT if url else MUTED)

        for job, attr in ((self._hide_job, '_hide_job'), (self._anim_job, '_anim_job')):
            if job:
                self.root.after_cancel(job)
                setattr(self, attr, None)

        self.win.deiconify()
        self.win.update_idletasks()
        self._place()
        # Vor dem Start der mainloop ist das Fenster noch nicht gesetzt und
        # ignoriert die Position - deshalb gleich danach noch einmal.
        self.root.after_idle(self._place)
        self.win.attributes('-topmost', True)

        if kind == 'progress':
            self._animate(0)
        elif timeout:
            self._hide_job = self.root.after(timeout, self.hide)

    def _place(self):
        """Unten rechts in der Arbeitsfläche, über der Taskleiste."""
        if self.win is None or not self.win.winfo_exists():
            return
        w = max(self.win.winfo_width(), self.win.winfo_reqwidth())
        h = max(self.win.winfo_height(), self.win.winfo_reqheight())
        wx, wy, ww, wh = winapi.work_area()
        self.win.geometry(f'{w}x{h}+{wx + ww - w - 18}+{wy + wh - h - 18}')

    def _animate(self, step):
        dots = '.' * (step % 4)
        self.title.configure(text=self.title.cget('text').rstrip('.') + dots)
        self._anim_job = self.root.after(400, self._animate, step + 1)

    def hide(self):
        if self._anim_job:
            self.root.after_cancel(self._anim_job)
            self._anim_job = None
        if self._hide_job:
            self.root.after_cancel(self._hide_job)
            self._hide_job = None
        if self.win:
            self.win.withdraw()
