"""Dünne ctypes-Schicht über die Windows-API.

Enthält alles, was EselShot an nativen Funktionen braucht: DPI-Awareness,
Bildschirmaufnahme per GDI, Zwischenablage (Text + Bild), globale Hotkeys
und ein Tray-Icon mit Kontextmenü. Keine externen Pakete nötig.
"""

import ctypes
import time
from ctypes import wintypes

user32 = ctypes.WinDLL('user32', use_last_error=True)
gdi32 = ctypes.WinDLL('gdi32', use_last_error=True)
kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)

LRESULT = ctypes.c_ssize_t

# -- Konstanten --------------------------------------------------------------
SRCCOPY = 0x00CC0020
CAPTUREBLT = 0x40000000
DIB_RGB_COLORS = 0
BI_RGB = 0

SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN = 76, 77
SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN = 78, 79

CF_UNICODETEXT = 13
CF_DIB = 8
GMEM_MOVEABLE = 0x0002

MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN, MOD_NOREPEAT = 1, 2, 4, 8, 0x4000
VK_SNAPSHOT = 0x2C

WM_DESTROY, WM_COMMAND, WM_APP = 0x0002, 0x0111, 0x8000
WM_HOTKEY = 0x0312
WM_LBUTTONUP, WM_RBUTTONUP, WM_LBUTTONDBLCLK = 0x0202, 0x0205, 0x0203
WM_TRAY = WM_APP + 1
WM_QUIT_APP = WM_APP + 2

NIM_ADD, NIM_MODIFY, NIM_DELETE = 0, 1, 2
NIF_MESSAGE, NIF_ICON, NIF_TIP = 0x01, 0x02, 0x04
TPM_RIGHTBUTTON, TPM_RETURNCMD, TPM_NONOTIFY = 0x0002, 0x0100, 0x0080
MF_STRING, MF_SEPARATOR, MF_CHECKED = 0x0000, 0x0800, 0x0008
CS_VREDRAW, CS_HREDRAW = 0x0001, 0x0002
IMAGE_ICON, LR_DEFAULTSIZE = 1, 0x0040


def _sig(fn, restype, *argtypes):
    """Prototyp setzen - ohne das schneidet ctypes 64-Bit-Handles ab."""
    fn.restype = restype
    fn.argtypes = argtypes
    return fn


_sig(user32.GetDC, wintypes.HDC, wintypes.HWND)
_sig(user32.ReleaseDC, ctypes.c_int, wintypes.HWND, wintypes.HDC)
_sig(user32.GetSystemMetrics, ctypes.c_int, ctypes.c_int)
_sig(user32.GetForegroundWindow, wintypes.HWND)
_sig(user32.SetClipboardData, wintypes.HANDLE, wintypes.UINT, wintypes.HANDLE)
_sig(gdi32.CreateCompatibleDC, wintypes.HDC, wintypes.HDC)
_sig(gdi32.CreateCompatibleBitmap, wintypes.HBITMAP, wintypes.HDC, ctypes.c_int, ctypes.c_int)
_sig(gdi32.SelectObject, wintypes.HGDIOBJ, wintypes.HDC, wintypes.HGDIOBJ)
_sig(gdi32.DeleteObject, wintypes.BOOL, wintypes.HGDIOBJ)
_sig(gdi32.DeleteDC, wintypes.BOOL, wintypes.HDC)
_sig(gdi32.BitBlt, wintypes.BOOL, wintypes.HDC, ctypes.c_int, ctypes.c_int, ctypes.c_int,
     ctypes.c_int, wintypes.HDC, ctypes.c_int, ctypes.c_int, wintypes.DWORD)
_sig(gdi32.CreateBitmap, wintypes.HBITMAP, ctypes.c_int, ctypes.c_int,
     wintypes.UINT, wintypes.UINT, ctypes.c_void_p)
_sig(gdi32.GetDIBits, ctypes.c_int, wintypes.HDC, wintypes.HBITMAP, wintypes.UINT,
     wintypes.UINT, ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT)
_sig(user32.SystemParametersInfoW, wintypes.BOOL, wintypes.UINT, wintypes.UINT,
     ctypes.c_void_p, wintypes.UINT)
_sig(user32.GetWindowRect, wintypes.BOOL, wintypes.HWND, ctypes.c_void_p)
_sig(user32.OpenClipboard, wintypes.BOOL, wintypes.HWND)
_sig(user32.CloseClipboard, wintypes.BOOL)
_sig(user32.EmptyClipboard, wintypes.BOOL)
_sig(kernel32.GlobalAlloc, wintypes.HGLOBAL, wintypes.UINT, ctypes.c_size_t)
_sig(kernel32.GlobalLock, ctypes.c_void_p, wintypes.HGLOBAL)
_sig(kernel32.GlobalUnlock, wintypes.BOOL, wintypes.HGLOBAL)


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ('biSize', wintypes.DWORD), ('biWidth', wintypes.LONG), ('biHeight', wintypes.LONG),
        ('biPlanes', wintypes.WORD), ('biBitCount', wintypes.WORD),
        ('biCompression', wintypes.DWORD), ('biSizeImage', wintypes.DWORD),
        ('biXPelsPerMeter', wintypes.LONG), ('biYPelsPerMeter', wintypes.LONG),
        ('biClrUsed', wintypes.DWORD), ('biClrImportant', wintypes.DWORD),
    ]


class BITMAPINFO(ctypes.Structure):
    _fields_ = [('bmiHeader', BITMAPINFOHEADER), ('bmiColors', wintypes.DWORD * 3)]


# -- DPI ---------------------------------------------------------------------
def enable_dpi_awareness():
    """Physische statt skalierter Pixel - sonst stimmen die Koordinaten nicht."""
    try:
        user32.SetProcessDpiAwarenessContext.restype = wintypes.BOOL
        user32.SetProcessDpiAwarenessContext.argtypes = (ctypes.c_void_p,)
        if user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4)):  # PER_MONITOR_V2
            return
    except (AttributeError, OSError):
        pass
    try:
        ctypes.WinDLL('shcore').SetProcessDpiAwareness(2)
        return
    except (AttributeError, OSError):
        pass
    try:
        user32.SetProcessDPIAware()
    except (AttributeError, OSError):
        pass


def virtual_screen():
    """(x, y, breite, höhe) über alle Monitore hinweg."""
    return (user32.GetSystemMetrics(SM_XVIRTUALSCREEN),
            user32.GetSystemMetrics(SM_YVIRTUALSCREEN),
            user32.GetSystemMetrics(SM_CXVIRTUALSCREEN),
            user32.GetSystemMetrics(SM_CYVIRTUALSCREEN))


def work_area():
    """Arbeitsfläche des Hauptmonitors (ohne Taskleiste)."""
    rect = wintypes.RECT()
    if user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0):  # SPI_GETWORKAREA
        return (rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)
    return (0, 0, user32.GetSystemMetrics(0), user32.GetSystemMetrics(1))


def foreground_window_rect():
    """Rahmen des aktiven Fensters, ohne den unsichtbaren Schattenrand."""
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return None
    rect = wintypes.RECT()
    ok = False
    try:
        dwm = ctypes.WinDLL('dwmapi')
        # DWMWA_EXTENDED_FRAME_BOUNDS = 9
        ok = dwm.DwmGetWindowAttribute(wintypes.HWND(hwnd), 9, ctypes.byref(rect),
                                       ctypes.sizeof(rect)) == 0
    except OSError:
        ok = False
    if not ok and not user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
        return None
    w, h = rect.right - rect.left, rect.bottom - rect.top
    if w <= 0 or h <= 0:
        return None
    return (rect.left, rect.top, w, h)


# -- Bildschirmaufnahme ------------------------------------------------------
def grab(x, y, w, h):
    """Bildschirmausschnitt als RGBA-Bytes (zeilenweise von oben)."""
    if w <= 0 or h <= 0:
        raise ValueError('Ungültige Größe')

    hdc_screen = user32.GetDC(None)
    hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
    hbmp = gdi32.CreateCompatibleBitmap(hdc_screen, w, h)
    old = gdi32.SelectObject(hdc_mem, hbmp)
    try:
        if not gdi32.BitBlt(hdc_mem, 0, 0, w, h, hdc_screen, x, y, SRCCOPY | CAPTUREBLT):
            raise ctypes.WinError(ctypes.get_last_error())

        bmi = BITMAPINFO()
        bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.bmiHeader.biWidth = w
        bmi.bmiHeader.biHeight = -h  # negativ = von oben nach unten
        bmi.bmiHeader.biPlanes = 1
        bmi.bmiHeader.biBitCount = 32
        bmi.bmiHeader.biCompression = BI_RGB

        buf = ctypes.create_string_buffer(w * h * 4)
        gdi32.SelectObject(hdc_mem, old)  # GetDIBits will die Bitmap frei haben
        if not gdi32.GetDIBits(hdc_mem, hbmp, 0, h, buf, ctypes.byref(bmi), DIB_RGB_COLORS):
            raise ctypes.WinError(ctypes.get_last_error())
    finally:
        gdi32.DeleteObject(hbmp)
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(None, hdc_screen)

    data = bytearray(buf.raw)
    data[0::4], data[2::4] = data[2::4], data[0::4]  # BGRA -> RGBA
    data[3::4] = b'\xff' * (w * h)                   # GDI liefert Alpha = 0
    return bytes(data)


# -- Zwischenablage ----------------------------------------------------------
def _with_clipboard(fn):
    for _ in range(10):  # andere Programme halten die Ablage manchmal kurz fest
        if user32.OpenClipboard(None):
            try:
                return fn()
            finally:
                user32.CloseClipboard()
        time.sleep(0.05)
    return False


def set_clipboard_text(text):
    def do():
        user32.EmptyClipboard()
        buf = ctypes.create_unicode_buffer(text)
        size = ctypes.sizeof(buf)
        handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, size)
        ptr = kernel32.GlobalLock(handle)
        ctypes.memmove(ptr, ctypes.byref(buf), size)
        kernel32.GlobalUnlock(handle)
        return bool(user32.SetClipboardData(CF_UNICODETEXT, handle))
    return _with_clipboard(do)


def set_clipboard_image(rgba, w, h):
    """Bild als 24-Bit-DIB ablegen - das verstehen praktisch alle Programme."""
    stride = (w * 3 + 3) & ~3
    pixels = bytearray(stride * h)
    for y in range(h):
        src = (h - 1 - y) * w * 4  # DIB läuft von unten nach oben
        row = rgba[src:src + w * 4]
        dst = bytearray(w * 3)
        dst[0::3] = row[2::4]  # B
        dst[1::3] = row[1::4]  # G
        dst[2::3] = row[0::4]  # R
        pixels[y * stride:y * stride + w * 3] = dst

    header = BITMAPINFOHEADER()
    header.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    header.biWidth = w
    header.biHeight = h
    header.biPlanes = 1
    header.biBitCount = 24
    header.biCompression = BI_RGB
    header.biSizeImage = len(pixels)
    blob = bytes(header) + bytes(pixels)

    def do():
        user32.EmptyClipboard()
        handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(blob))
        ptr = kernel32.GlobalLock(handle)
        ctypes.memmove(ptr, blob, len(blob))
        kernel32.GlobalUnlock(handle)
        return bool(user32.SetClipboardData(CF_DIB, handle))
    return _with_clipboard(do)
