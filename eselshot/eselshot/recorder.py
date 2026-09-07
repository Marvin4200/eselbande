"""GIF-Aufnahme eines Bildschirmbereichs.

Die Steuerleiste wird bewusst *ausserhalb* des Aufnahmebereichs platziert -
eine Leiste im Bild würde sich selbst mitfilmen.
"""

import threading
import time
import tkinter as tk

from . import gifenc, winapi

BG = '#12121c'
BORDER = '#2b2b40'
TEXT = '#e2e8f0'
MUTED = '#8b93a7'
REC = '#ef4444'

BAR_H = 40          # geschätzte Höhe für die Platzierung vor dem Zeichnen
MAX_PIXELS = 1_600_000   # darüber wird die Aufnahme abgelehnt (Speicher/Tempo)


class GifRecorder:
    """Nimmt region=(x, y, w, h) auf und meldet Palettenframes zurück."""

    def __init__(self, root, region, fps=10, max_secs=20,
                 on_done=None, on_error=None):
        self.root = root
        self.x, self.y, self.w, self.h = region
        self.fps = fps
        self.max_secs = max_secs
        self.on_done = on_done or (lambda *a: None)
        self.on_error = on_error or (lambda e: None)

        self.frames = []
        self._stop = threading.Event()
        self._win = None
        self._started = 0.0
        self._tick_job = None

    # -- Start / Stop ---------------------------------------------------------
    def start(self):
        if self.w * self.h > MAX_PIXELS:
            self.on_error(f'Bereich zu groß ({self.w}×{self.h}). '
                          f'Höchstens {MAX_PIXELS // 1000} k Pixel.')
            return
        self._build_bar()
        self._started = time.monotonic()
        self._tick()
        threading.Thread(target=self._record, daemon=True).start()

    def stop(self):
        self._stop.set()

    # -- Steuerleiste ---------------------------------------------------------
    def _build_bar(self):
        win = tk.Toplevel(self.root)
        win.overrideredirect(True)
        win.attributes('-topmost', True)
        win.configure(bg=BORDER)
        self._win = win

        outer = tk.Frame(win, bg=BG, padx=12, pady=8)
        outer.pack(padx=1, pady=1)

        self._dot = tk.Label(outer, text='●', bg=BG, fg=REC, font=('Segoe UI', 13))
        self._dot.pack(side='left', padx=(0, 8))
        self._time = tk.Label(outer, text='0.0 s', bg=BG, fg=TEXT,
                              font=('Consolas', 10, 'bold'), width=7, anchor='w')
        self._time.pack(side='left')
        tk.Label(outer, text=f'max {self.max_secs}s', bg=BG, fg=MUTED,
                 font=('Segoe UI', 9)).pack(side='left', padx=(0, 10))

        btn = tk.Label(outer, text=' Stopp ', bg=REC, fg='#ffffff',
                       font=('Segoe UI', 9, 'bold'), cursor='hand2')
        btn.pack(side='left')
        btn.bind('<Button-1>', lambda e: self.stop())

        win.update_idletasks()
        self._place_bar(win.winfo_reqwidth(), win.winfo_reqheight())

    def _place_bar(self, bw, bh):
        """Über den Bereich legen, sonst darunter - nie hinein."""
        wx, wy, ww, wh = winapi.work_area()
        bx = self.x + (self.w - bw) // 2
        above = self.y - bh - 8
        below = self.y + self.h + 8
        if above >= wy:
            by = above
        elif below + bh <= wy + wh:
            by = below
        else:
            by = wy + wh - bh - 8      # kein Platz: unten, notfalls im Bild
        bx = max(wx, min(bx, wx + ww - bw))
        self._win.geometry(f'+{int(bx)}+{int(by)}')

    def _tick(self):
        """Laufzeit anzeigen und den Punkt blinken lassen."""
        if self._stop.is_set() or self._win is None:
            return
        elapsed = time.monotonic() - self._started
        try:
            self._time.configure(text=f'{elapsed:.1f} s')
            self._dot.configure(fg=REC if int(elapsed * 2) % 2 == 0 else BG)
        except tk.TclError:
            return
        self._tick_job = self.root.after(100, self._tick)

    def _close_bar(self):
        if self._tick_job:
            self.root.after_cancel(self._tick_job)
            self._tick_job = None
        if self._win is not None:
            try:
                self._win.destroy()
            except tk.TclError:
                pass
            self._win = None

    # -- Aufnahmeschleife -----------------------------------------------------
    def _record(self):
        interval = 1.0 / self.fps
        limit = self.fps * self.max_secs
        next_at = time.monotonic()
        try:
            while not self._stop.is_set() and len(self.frames) < limit:
                raw = winapi.grab(self.x, self.y, self.w, self.h)
                # sofort quantisieren: ein Byte je Pixel statt vier
                self.frames.append(gifenc.quantize(raw))
                next_at += interval
                delay = next_at - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                else:
                    next_at = time.monotonic()   # zu langsam: nicht aufholen
        except Exception as err:
            self.root.after(0, self._finished, str(err))
            return
        self.root.after(0, self._finished, None)

    def _finished(self, error):
        self._close_bar()
        if error:
            self.on_error(error)
        elif not self.frames:
            self.on_error('Keine Bilder aufgenommen')
        else:
            self.on_done(self.frames, self.w, self.h, self.fps)
