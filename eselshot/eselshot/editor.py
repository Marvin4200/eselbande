"""Das Auswahl- und Zeichen-Overlay.

Ablauf: Bildschirm einfrieren, alles abdunkeln, gewählten Bereich wieder hell
zeigen, darauf zeichnen lassen. Beim Fertigstellen wird der Bereich erneut vom
Bildschirm abfotografiert - so landen die Zeichnungen pixelgenau im Bild, ohne
dass eine Grafikbibliothek nötig wäre.
"""

import base64
import tkinter as tk

from . import pngenc, winapi

BG = '#12121c'
BAR_BG = '#16162a'
BORDER = '#2b2b40'
TEXT = '#e2e8f0'
MUTED = '#8b93a7'
ACCENT = '#818cf8'

PALETTE = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#818cf8', '#ffffff', '#111827']
WIDTHS = [2, 4, 7]
HANDLE = 7          # halbe Kantenlänge der Anfasser
MIN_SIZE = 8

TOOLS = [
    ('move', '✥', 'Auswahl verschieben'),
    ('pen', '✎', 'Stift'),
    ('line', '╱', 'Linie'),
    ('arrow', '➜', 'Pfeil'),
    ('rect', '▭', 'Rechteck'),
    ('ellipse', '◯', 'Ellipse'),
    ('marker', '▬', 'Marker'),
    ('text', 'T', 'Text'),
]


class Editor:
    """Ein Overlay pro Screenshot. finish(action, rgba, w, h) meldet das Ergebnis."""

    def __init__(self, root, on_finish, on_cancel=None):
        self.root = root
        self.on_finish = on_finish
        self.on_cancel = on_cancel or (lambda: None)
        self.win = None
        self.tool = 'move'
        self.color = PALETTE[0]
        self.width_index = 1
        self.rect = None          # (x1, y1, x2, y2) in Leinwand-Koordinaten
        self.undo_stack = []
        self._drag = None
        self._entry = None
        self._closed = False

    # -- Aufbau ---------------------------------------------------------------
    def open(self, preset=None):
        """preset: Rechteck in Bildschirmkoordinaten, oder None für freie Auswahl."""
        self.vx, self.vy, self.vw, self.vh = winapi.virtual_screen()
        frozen = winapi.grab(self.vx, self.vy, self.vw, self.vh)

        win = tk.Toplevel(self.root)
        win.withdraw()
        win.overrideredirect(True)
        win.geometry(f'{self.vw}x{self.vh}+{self.vx}+{self.vy}')
        win.attributes('-topmost', True)
        win.configure(bg='black')
        self.win = win

        png = pngenc.encode(self.vw, self.vh, frozen, level=1)
        self.base_img = tk.PhotoImage(master=win, data=base64.b64encode(png).decode('ascii'))
        # 1x1-Pixel mit Alpha, auf Bildschirmgröße gezogen - viel schneller,
        # als eine bildschirmgroße PNG-Fläche zu kodieren.
        dot = tk.PhotoImage(master=win,
                            data=base64.b64encode(pngenc.encode(1, 1, bytes((0, 0, 0, 120)))).decode('ascii'))
        self.dim_img = dot.zoom(self.vw, self.vh)
        self._dot = dot
        # Ohne feste Größe anlegen: nur dann kann 'copy -shrink' sie später
        # auf die jeweilige Auswahl umformen.
        self.sel_img = tk.PhotoImage(master=win)

        cv = tk.Canvas(win, width=self.vw, height=self.vh, highlightthickness=0,
                       bd=0, bg='black', cursor='crosshair')
        cv.pack(fill='both', expand=True)
        self.cv = cv

        cv.create_image(0, 0, anchor='nw', image=self.base_img)
        cv.create_image(0, 0, anchor='nw', image=self.dim_img)
        self.sel_item = cv.create_image(0, 0, anchor='nw', image=self.sel_img, state='hidden')
        self.border = cv.create_rectangle(0, 0, 0, 0, outline=ACCENT, width=2, state='hidden')
        self.size_label = cv.create_text(0, 0, text='', fill='#ffffff', anchor='sw',
                                         font=('Segoe UI', 10, 'bold'), state='hidden')
        self.size_bg = cv.create_rectangle(0, 0, 0, 0, fill=BG, outline=BORDER, state='hidden')
        cv.tag_lower(self.size_bg, self.size_label)
        self.handles = [cv.create_rectangle(0, 0, 0, 0, fill='#ffffff', outline=ACCENT,
                                            state='hidden') for _ in range(8)]

        self.hint = cv.create_text(self.vw // 2, self.vh // 2,
                                   text='Bereich mit der Maus aufziehen   ·   Esc bricht ab',
                                   fill='#cbd5e1', font=('Segoe UI', 15))

        self._build_toolbar()

        cv.bind('<Button-1>', self._on_press)
        cv.bind('<B1-Motion>', self._on_motion)
        cv.bind('<ButtonRelease-1>', self._on_release)
        cv.bind('<Motion>', self._on_hover)
        cv.bind('<Button-3>', lambda e: self._reset_selection())
        win.bind('<Escape>', lambda e: self.cancel())
        win.bind('<Return>', lambda e: self.finish('upload'))
        win.bind('<Control-c>', lambda e: self.finish('copy'))
        win.bind('<Control-s>', lambda e: self.finish('save'))
        win.bind('<Control-z>', lambda e: self.undo())

        win.deiconify()
        win.lift()
        win.focus_force()
        cv.focus_set()

        if preset:
            px, py, pw, ph = preset
            self.rect = (px - self.vx, py - self.vy, px - self.vx + pw, py - self.vy + ph)
            self._refresh(show_bar=True)

    # -- Werkzeugleiste -------------------------------------------------------
    def _build_toolbar(self):
        bar = tk.Frame(self.cv, bg=BAR_BG, highlightbackground=BORDER, highlightthickness=1)
        self.bar = bar
        self.tool_buttons = {}

        for name, glyph, tip in TOOLS:
            btn = self._bar_button(bar, glyph, tip, lambda n=name: self._set_tool(n))
            self.tool_buttons[name] = btn

        self._sep(bar)
        self.swatches = []
        for color in PALETTE:
            sw = tk.Frame(bar, bg=color, width=16, height=16, highlightthickness=2,
                          highlightbackground=BAR_BG)
            sw.pack(side='left', padx=2, pady=8)
            sw.pack_propagate(False)
            sw.bind('<Button-1>', lambda e, c=color: self._set_color(c))
            self.swatches.append((color, sw))

        self.width_btn = self._bar_button(bar, '●', 'Strichstärke', self._cycle_width)
        self._sep(bar)
        self._bar_button(bar, '↶', 'Rückgängig (Strg+Z)', self.undo)
        self._sep(bar)
        self._bar_button(bar, '💾', 'Speichern (Strg+S)', lambda: self.finish('save'))
        self._bar_button(bar, '📋', 'In Zwischenablage (Strg+C)', lambda: self.finish('copy'))
        self._bar_button(bar, '✕', 'Abbrechen (Esc)', self.cancel)

        upload = tk.Label(bar, text='  ⬆  Hochladen  ', bg=ACCENT, fg='#0b0b14',
                          font=('Segoe UI', 10, 'bold'), cursor='hand2')
        upload.pack(side='left', padx=(6, 8), pady=6)
        upload.bind('<Button-1>', lambda e: self.finish('upload'))
        upload.bind('<Enter>', lambda e: upload.configure(bg='#a5aefc'))
        upload.bind('<Leave>', lambda e: upload.configure(bg=ACCENT))

        self.bar_window = self.cv.create_window(0, 0, anchor='nw', window=bar, state='hidden')
        self._set_tool('move')
        self._set_color(self.color)

    def _bar_button(self, parent, glyph, tip, command):
        btn = tk.Label(parent, text=glyph, bg=BAR_BG, fg=TEXT, width=3,
                       font=('Segoe UI', 12), cursor='hand2')
        btn.pack(side='left', padx=1, pady=6)
        btn.bind('<Button-1>', lambda e: command())
        btn.bind('<Enter>', lambda e: btn.configure(bg='#232340'))
        btn.bind('<Leave>', lambda e: btn.configure(bg=BAR_BG if btn is not self.tool_buttons.get(self.tool) else '#2f2f52'))
        self._tooltip(btn, tip)
        return btn

    def _sep(self, parent):
        tk.Frame(parent, bg=BORDER, width=1, height=22).pack(side='left', padx=6, pady=8)

    def _tooltip(self, widget, text):
        widget.bind('<Enter>', lambda e: self._show_tip(text), add='+')
        widget.bind('<Leave>', lambda e: self._show_tip(''), add='+')

    def _show_tip(self, text):
        if not hasattr(self, 'tip_label'):
            self.tip_label = tk.Label(self.cv, text='', bg=BG, fg=MUTED,
                                      font=('Segoe UI', 9), padx=8, pady=3,
                                      highlightbackground=BORDER, highlightthickness=1)
            self.tip_window = self.cv.create_window(0, 0, anchor='nw',
                                                    window=self.tip_label, state='hidden')
        if not text or not self.rect:
            self.cv.itemconfigure(self.tip_window, state='hidden')
            return
        self.tip_label.configure(text=text)
        bx, by = self.cv.coords(self.bar_window)
        self.cv.coords(self.tip_window, bx, by + self.bar.winfo_height() + 6)
        self.cv.itemconfigure(self.tip_window, state='normal')

    def _set_tool(self, name):
        self.tool = name
        for key, btn in self.tool_buttons.items():
            btn.configure(bg='#2f2f52' if key == name else BAR_BG,
                          fg=ACCENT if key == name else TEXT)
        self.cv.configure(cursor='fleur' if name == 'move' else
                          ('xterm' if name == 'text' else 'crosshair'))

    def _set_color(self, color):
        self.color = color
        for value, sw in self.swatches:
            sw.configure(highlightbackground='#ffffff' if value == color else BAR_BG)

    def _cycle_width(self):
        self.width_index = (self.width_index + 1) % len(WIDTHS)
        self.width_btn.configure(font=('Segoe UI', 8 + self.width_index * 3))

    @property
    def line_width(self):
        return WIDTHS[self.width_index]

    # -- Auswahl --------------------------------------------------------------
    def _norm(self, rect):
        x1, y1, x2, y2 = rect
        return (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))

    def _clamp(self, rect):
        x1, y1, x2, y2 = self._norm(rect)
        return (max(0, min(x1, self.vw)), max(0, min(y1, self.vh)),
                max(0, min(x2, self.vw)), max(0, min(y2, self.vh)))

    def _reset_selection(self):
        self.rect = None
        for item in self.handles:
            self.cv.itemconfigure(item, state='hidden')
        for item in (self.border, self.sel_item, self.size_label, self.size_bg, self.bar_window):
            self.cv.itemconfigure(item, state='hidden')
        self.cv.itemconfigure(self.hint, state='normal')
        for item in self.undo_stack:
            self.cv.delete(item)
        self.undo_stack.clear()

    def _refresh(self, show_bar=False):
        if not self.rect:
            return
        x1, y1, x2, y2 = self.rect = self._clamp(self.rect)
        w, h = x2 - x1, y2 - y1
        if w < 1 or h < 1:
            return

        self.cv.itemconfigure(self.hint, state='hidden')
        # Ausschnitt aus dem eingefrorenen Bild in die helle Fläche kopieren
        self.sel_img.tk.call(str(self.sel_img), 'copy', str(self.base_img),
                             '-from', x1, y1, x2, y2, '-to', 0, 0, '-shrink')
        self.cv.coords(self.sel_item, x1, y1)
        self.cv.itemconfigure(self.sel_item, state='normal')
        self.cv.coords(self.border, x1, y1, x2, y2)
        self.cv.itemconfigure(self.border, state='normal')
        self.cv.tag_raise(self.sel_item)
        self.cv.tag_raise(self.border)
        for item in self.undo_stack:
            self.cv.tag_raise(item)

        label_y = y1 - 8 if y1 > 26 else y2 + 24
        self.cv.coords(self.size_label, x1 + 6, label_y)
        self.cv.itemconfigure(self.size_label, text=f'{w} × {h}', state='normal')
        bbox = self.cv.bbox(self.size_label)
        self.cv.coords(self.size_bg, bbox[0] - 6, bbox[1] - 3, bbox[2] + 6, bbox[3] + 3)
        self.cv.itemconfigure(self.size_bg, state='normal')
        self.cv.tag_raise(self.size_bg)
        self.cv.tag_raise(self.size_label)

        self._place_handles()
        if show_bar:
            self._place_toolbar()

    def _handle_points(self):
        x1, y1, x2, y2 = self.rect
        mx, my = (x1 + x2) // 2, (y1 + y2) // 2
        return [(x1, y1), (mx, y1), (x2, y1), (x2, my),
                (x2, y2), (mx, y2), (x1, y2), (x1, my)]

    def _place_handles(self):
        for item, (hx, hy) in zip(self.handles, self._handle_points()):
            self.cv.coords(item, hx - HANDLE, hy - HANDLE, hx + HANDLE, hy + HANDLE)
            self.cv.itemconfigure(item, state='normal')
            self.cv.tag_raise(item)

    def _place_toolbar(self):
        self.bar.update_idletasks()
        bw, bh = self.bar.winfo_reqwidth(), self.bar.winfo_reqheight()
        x1, y1, x2, y2 = self.rect
        bx = min(max(0, x2 - bw), self.vw - bw)
        by = y2 + 12
        if by + bh > self.vh:              # kein Platz darunter
            by = y1 - bh - 12
        if by < 0:                         # auch darüber nicht -> hinein
            by = max(0, y2 - bh - 12)
        self.cv.coords(self.bar_window, bx, by)
        self.cv.itemconfigure(self.bar_window, state='normal')
        self.cv.tag_raise(self.bar_window)

    def _hit_handle(self, x, y):
        if not self.rect:
            return None
        for index, (hx, hy) in enumerate(self._handle_points()):
            if abs(x - hx) <= HANDLE + 2 and abs(y - hy) <= HANDLE + 2:
                return index
        return None

    def _inside(self, x, y):
        if not self.rect:
            return False
        x1, y1, x2, y2 = self.rect
        return x1 <= x <= x2 and y1 <= y <= y2

    # -- Maus -----------------------------------------------------------------
    def _on_hover(self, event):
        if self.rect and self._hit_handle(event.x, event.y) is not None:
            index = self._hit_handle(event.x, event.y)
            self.cv.configure(cursor=['size_nw_se', 'sb_v_double_arrow', 'size_ne_sw',
                                      'sb_h_double_arrow', 'size_nw_se', 'sb_v_double_arrow',
                                      'size_ne_sw', 'sb_h_double_arrow'][index])
        elif self.tool == 'move':
            self.cv.configure(cursor='fleur' if self._inside(event.x, event.y) else 'crosshair')

    def _on_press(self, event):
        self._commit_text()
        x, y = event.x, event.y

        handle = self._hit_handle(x, y)
        if handle is not None:
            self._drag = ('resize', handle, self.rect)
            return

        if self.rect and self._inside(x, y) and self.tool != 'move':
            self._start_drawing(x, y)
            return

        if self.rect and self._inside(x, y) and self.tool == 'move':
            self._drag = ('move', (x, y), self.rect)
            return

        self._reset_selection()
        self.rect = (x, y, x, y)
        self._drag = ('select', None, None)

    def _on_motion(self, event):
        if not self._drag:
            return
        kind, info, origin = self._drag
        x, y = event.x, event.y

        if kind == 'select':
            self.rect = (self.rect[0], self.rect[1], x, y)
            self._refresh()
        elif kind == 'move':
            dx, dy = x - info[0], y - info[1]
            ox1, oy1, ox2, oy2 = origin
            w, h = ox2 - ox1, oy2 - oy1
            nx1 = max(0, min(ox1 + dx, self.vw - w))
            ny1 = max(0, min(oy1 + dy, self.vh - h))
            self.rect = (nx1, ny1, nx1 + w, ny1 + h)
            self._refresh()
        elif kind == 'resize':
            x1, y1, x2, y2 = origin
            index = info
            if index in (0, 6, 7):
                x1 = x
            if index in (2, 3, 4):
                x2 = x
            if index in (0, 1, 2):
                y1 = y
            if index in (4, 5, 6):
                y2 = y
            self.rect = (x1, y1, x2, y2)
            self._refresh()
        elif kind == 'draw':
            self._draw_motion(x, y)

    def _on_release(self, event):
        if not self._drag:
            return
        kind = self._drag[0]
        self._drag = None

        if kind == 'draw':
            self._draw_release()
            return

        if not self.rect:
            return
        x1, y1, x2, y2 = self._clamp(self.rect)
        if x2 - x1 < MIN_SIZE or y2 - y1 < MIN_SIZE:
            self._reset_selection()
            self.cv.itemconfigure(self.hint, state='normal')
            return
        self.rect = (x1, y1, x2, y2)
        self._refresh(show_bar=True)

    # -- Zeichnen -------------------------------------------------------------
    def _start_drawing(self, x, y):
        width = self.line_width
        if self.tool == 'text':
            self._open_text_entry(x, y)
            return
        if self.tool == 'pen':
            item = self.cv.create_line(x, y, x, y, fill=self.color, width=width,
                                       capstyle='round', joinstyle='round', smooth=True)
        elif self.tool == 'line':
            item = self.cv.create_line(x, y, x, y, fill=self.color, width=width, capstyle='round')
        elif self.tool == 'arrow':
            item = self.cv.create_line(x, y, x, y, fill=self.color, width=width,
                                       arrow='last', arrowshape=(width * 4, width * 5, width * 2))
        elif self.tool == 'rect':
            item = self.cv.create_rectangle(x, y, x, y, outline=self.color, width=width)
        elif self.tool == 'ellipse':
            item = self.cv.create_oval(x, y, x, y, outline=self.color, width=width)
        elif self.tool == 'marker':
            item = self.cv.create_line(x, y, x, y, fill=self.color, width=width * 4,
                                       capstyle='round', stipple='gray50')
        else:
            return
        self._drag = ('draw', (x, y), item)

    def _draw_motion(self, x, y):
        _, start, item = self._drag
        if self.tool in ('pen', 'marker'):
            coords = self.cv.coords(item)
            coords.extend([x, y])
            self.cv.coords(item, *coords)
        else:
            self.cv.coords(item, start[0], start[1], x, y)

    def _draw_release(self):
        item = self._drag[2] if self._drag else None
        if item:
            self.undo_stack.append(item)

    def _open_text_entry(self, x, y):
        size = 10 + self.line_width * 2
        entry = tk.Entry(self.cv, bg=BG, fg=self.color, insertbackground=self.color,
                         font=('Segoe UI', size, 'bold'), relief='flat',
                         highlightthickness=1, highlightbackground=ACCENT, width=18)
        window = self.cv.create_window(x, y, anchor='nw', window=entry)
        entry.focus_set()
        entry.bind('<Return>', lambda e: self._commit_text())
        entry.bind('<Escape>', lambda e: self._commit_text(cancel=True))
        self._entry = (entry, window, x, y, size, self.color)

    def _commit_text(self, cancel=False):
        if not self._entry:
            return
        entry, window, x, y, size, color = self._entry
        value = entry.get().strip()
        self._entry = None
        self.cv.delete(window)
        entry.destroy()
        if value and not cancel:
            item = self.cv.create_text(x + 4, y + 2, text=value, fill=color, anchor='nw',
                                       font=('Segoe UI', size, 'bold'))
            self.undo_stack.append(item)

    def undo(self):
        if self._entry:
            self._commit_text(cancel=True)
            return
        if self.undo_stack:
            self.cv.delete(self.undo_stack.pop())

    # -- Abschluss ------------------------------------------------------------
    def cancel(self):
        if self._closed:
            return
        self._closed = True
        self._destroy()
        self.on_cancel()

    def finish(self, action):
        if self._closed or not self.rect:
            return
        self._commit_text()
        x1, y1, x2, y2 = self.rect
        w, h = x2 - x1, y2 - y1
        if w < MIN_SIZE or h < MIN_SIZE:
            return
        self._closed = True

        # Bedienelemente ausblenden, damit sie nicht mit im Bild landen
        for item in [self.border, self.size_label, self.size_bg, self.bar_window] + self.handles:
            self.cv.itemconfigure(item, state='hidden')
        if hasattr(self, 'tip_window'):
            self.cv.itemconfigure(self.tip_window, state='hidden')
        self.win.update()
        self.win.after(70, lambda: self._capture_and_close(action, x1, y1, w, h))

    def _capture_and_close(self, action, x1, y1, w, h):
        try:
            rgba = winapi.grab(self.vx + x1, self.vy + y1, w, h)
        finally:
            self._destroy()
        self.on_finish(action, rgba, w, h)

    def _destroy(self):
        if self.win is not None:
            try:
                self.win.destroy()
            except tk.TclError:
                pass
            self.win = None
        self.base_img = self.dim_img = self.sel_img = self._dot = None
