"""Screenshot als schwebendes Fenster an den Bildschirm heften.

Wie "Pin to screen" bei Snagit/PowerToys: das Bild bleibt sichtbar über allen
anderen Fenstern, lässt sich frei verschieben, per Mausrad ein-/ausblenden
(Deckkraft) und mit Esc oder Rechtsklick wieder schließen. Praktisch zum
Vergleichen zweier Fenster oder um eine Referenz während der Arbeit sichtbar
zu halten.
"""

import base64
import tkinter as tk

from . import pngenc

BORDER = '#818cf8'


class PinWindow:
    """Ein einzelnes angeheftetes Bild. Bleibt am Leben, solange es offen ist."""

    def __init__(self, root, rgba, width, height, on_close=None):
        self.on_close = on_close or (lambda pin: None)
        self.alpha = 1.0

        win = tk.Toplevel(root)
        win.overrideredirect(True)
        win.attributes('-topmost', True)
        win.geometry(f'{width}x{height}+120+120')
        self.win = win

        png = pngenc.encode(width, height, rgba)
        self.img = tk.PhotoImage(master=win, data=base64.b64encode(png).decode('ascii'))

        cv = tk.Canvas(win, width=width, height=height, highlightthickness=2,
                       highlightbackground=BORDER, bd=0, cursor='fleur')
        cv.pack(fill='both', expand=True)
        cv.create_image(0, 0, anchor='nw', image=self.img)
        self.cv = cv

        cv.bind('<Button-1>', self._start_drag)
        cv.bind('<B1-Motion>', self._drag)
        cv.bind('<Button-3>', lambda e: self.close())
        cv.bind('<MouseWheel>', self._on_wheel)
        win.bind('<Escape>', lambda e: self.close())

        win.lift()
        win.focus_force()
        self._drag_origin = None

    def _start_drag(self, event):
        self.win.focus_force()
        self._drag_origin = (event.x_root, event.y_root, self.win.winfo_x(), self.win.winfo_y())

    def _drag(self, event):
        if not self._drag_origin:
            return
        sx, sy, wx, wy = self._drag_origin
        dx, dy = event.x_root - sx, event.y_root - sy
        self.win.geometry(f'+{wx + dx}+{wy + dy}')

    def _on_wheel(self, event):
        step = 0.1 if event.delta > 0 else -0.1
        self.alpha = max(0.15, min(1.0, self.alpha + step))
        self.win.attributes('-alpha', self.alpha)

    def close(self):
        try:
            self.win.destroy()
        except tk.TclError:
            pass
        self.on_close(self)
