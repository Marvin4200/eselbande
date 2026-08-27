"""Tray-Icon, Kontextmenü und globale Hotkeys.

Läuft in einem eigenen Thread mit eigener Nachrichtenschleife. Ereignisse
(Hotkey gedrückt, Menüpunkt gewählt) werden per Callback gemeldet - die
Oberfläche selbst wird davon nicht angefasst, die lebt im Hauptthread.
"""

import ctypes
import struct
import threading
from ctypes import wintypes

from .winapi import (LRESULT, MF_CHECKED, MF_SEPARATOR, MF_STRING, NIF_ICON, NIF_MESSAGE,
                     NIF_TIP, NIM_ADD, NIM_DELETE, TPM_NONOTIFY, TPM_RETURNCMD,
                     TPM_RIGHTBUTTON, WM_COMMAND, WM_DESTROY, WM_HOTKEY, WM_LBUTTONDBLCLK,
                     WM_LBUTTONUP, WM_RBUTTONUP, WM_TRAY, WM_QUIT_APP, gdi32, kernel32,
                     user32, _sig)

_sig(user32.CreatePopupMenu, wintypes.HMENU)
_sig(user32.AppendMenuW, wintypes.BOOL, wintypes.HMENU, wintypes.UINT,
     ctypes.c_size_t, wintypes.LPCWSTR)
_sig(user32.TrackPopupMenu, ctypes.c_int, wintypes.HMENU, wintypes.UINT, ctypes.c_int,
     ctypes.c_int, ctypes.c_int, wintypes.HWND, ctypes.c_void_p)
_sig(user32.DestroyMenu, wintypes.BOOL, wintypes.HMENU)
_sig(user32.SetForegroundWindow, wintypes.BOOL, wintypes.HWND)
_sig(user32.CreateIconIndirect, wintypes.HICON, ctypes.c_void_p)
_sig(user32.DestroyIcon, wintypes.BOOL, wintypes.HICON)
_sig(user32.DefWindowProcW, LRESULT, wintypes.HWND, wintypes.UINT,
     wintypes.WPARAM, wintypes.LPARAM)
_sig(user32.CreateWindowExW, wintypes.HWND, wintypes.DWORD, wintypes.LPCWSTR,
     wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_int, ctypes.c_int, ctypes.c_int,
     ctypes.c_int, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, ctypes.c_void_p)
_sig(user32.DestroyWindow, wintypes.BOOL, wintypes.HWND)
_sig(user32.RegisterHotKey, wintypes.BOOL, wintypes.HWND, ctypes.c_int,
     wintypes.UINT, wintypes.UINT)
_sig(user32.UnregisterHotKey, wintypes.BOOL, wintypes.HWND, ctypes.c_int)
_sig(user32.PostMessageW, wintypes.BOOL, wintypes.HWND, wintypes.UINT,
     wintypes.WPARAM, wintypes.LPARAM)
_sig(gdi32.CreateDIBSection, wintypes.HBITMAP, wintypes.HDC, ctypes.c_void_p,
     wintypes.UINT, ctypes.POINTER(ctypes.c_void_p), wintypes.HANDLE, wintypes.DWORD)

_sig(kernel32.GetModuleHandleW, wintypes.HMODULE, wintypes.LPCWSTR)
_sig(user32.RegisterClassExW, wintypes.ATOM, ctypes.c_void_p)
_sig(user32.GetMessageW, wintypes.BOOL, ctypes.c_void_p, wintypes.HWND,
     wintypes.UINT, wintypes.UINT)
_sig(user32.TranslateMessage, wintypes.BOOL, ctypes.c_void_p)
_sig(user32.DispatchMessageW, LRESULT, ctypes.c_void_p)
_sig(user32.GetCursorPos, wintypes.BOOL, ctypes.c_void_p)
_sig(user32.PostQuitMessage, None, ctypes.c_int)

shell32 = ctypes.WinDLL('shell32', use_last_error=True)
_sig(shell32.Shell_NotifyIconW, wintypes.BOOL, wintypes.DWORD, ctypes.c_void_p)

from . import icon

WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT,
                             wintypes.WPARAM, wintypes.LPARAM)


class WNDCLASSEXW(ctypes.Structure):
    _fields_ = [
        ('cbSize', wintypes.UINT), ('style', wintypes.UINT), ('lpfnWndProc', WNDPROC),
        ('cbClsExtra', ctypes.c_int), ('cbWndExtra', ctypes.c_int),
        ('hInstance', wintypes.HINSTANCE), ('hIcon', wintypes.HICON),
        ('hCursor', wintypes.HANDLE), ('hbrBackground', wintypes.HBRUSH),
        ('lpszMenuName', wintypes.LPCWSTR), ('lpszClassName', wintypes.LPCWSTR),
        ('hIconSm', wintypes.HICON),
    ]


class NOTIFYICONDATAW(ctypes.Structure):
    _fields_ = [
        ('cbSize', wintypes.DWORD), ('hWnd', wintypes.HWND), ('uID', wintypes.UINT),
        ('uFlags', wintypes.UINT), ('uCallbackMessage', wintypes.UINT),
        ('hIcon', wintypes.HICON), ('szTip', wintypes.WCHAR * 128),
        ('dwState', wintypes.DWORD), ('dwStateMask', wintypes.DWORD),
        ('szInfo', wintypes.WCHAR * 256), ('uVersion', wintypes.UINT),
        ('szInfoTitle', wintypes.WCHAR * 64), ('dwInfoFlags', wintypes.DWORD),
        ('guidItem', ctypes.c_byte * 16), ('hBalloonIcon', wintypes.HICON),
    ]


class ICONINFO(ctypes.Structure):
    _fields_ = [
        ('fIcon', wintypes.BOOL), ('xHotspot', wintypes.DWORD), ('yHotspot', wintypes.DWORD),
        ('hbmMask', wintypes.HBITMAP), ('hbmColor', wintypes.HBITMAP),
    ]


def create_icon(size=32):
    """HICON aus selbst gezeichneten Pixeln - kein .ico nötig."""
    rgba = icon.render_rgba(size)
    header = struct.pack('<IiiHHIIiiII', 40, size, -size, 1, 32, 0, size * size * 4, 0, 0, 0, 0)
    bits = ctypes.c_void_p()
    hdc = user32.GetDC(None)
    hbm = gdi32.CreateDIBSection(hdc, header, 0, ctypes.byref(bits), None, 0)
    user32.ReleaseDC(None, hdc)
    if not hbm:
        return None

    bgra = bytearray(rgba)
    bgra[0::4], bgra[2::4] = bgra[2::4], bgra[0::4]
    ctypes.memmove(bits, bytes(bgra), len(bgra))

    hmask = gdi32.CreateBitmap(size, size, 1, 1, None)
    info = ICONINFO(True, 0, 0, hmask, hbm)
    hicon = user32.CreateIconIndirect(ctypes.byref(info))
    gdi32.DeleteObject(hbm)
    gdi32.DeleteObject(hmask)
    return hicon


class Tray:
    """Tray-Icon + Hotkeys. start() blockiert nicht, stop() beendet sauber."""

    def __init__(self, tooltip, on_event, menu_items, hotkeys):
        """menu_items: Callable -> Liste aus (id, label, checked) oder None (Trenner).
        hotkeys: Liste aus (id, mods, vk)."""
        self.tooltip = tooltip
        self.on_event = on_event
        self.menu_items = menu_items
        self.hotkeys = hotkeys
        self.hwnd = None
        self.hicon = None
        self.failed_hotkeys = []
        self._ready = threading.Event()
        self._thread = None
        self._wndproc = WNDPROC(self._on_message)

    # -- Nachrichtenschleife (eigener Thread) --------------------------------
    def start(self):
        self._thread = threading.Thread(target=self._run, name='eselshot-tray', daemon=True)
        self._thread.start()
        self._ready.wait(5)
        return self

    def stop(self):
        if self.hwnd:
            user32.PostMessageW(self.hwnd, WM_QUIT_APP, 0, 0)

    def _run(self):
        hinst = kernel32.GetModuleHandleW(None)
        cls = WNDCLASSEXW()
        cls.cbSize = ctypes.sizeof(WNDCLASSEXW)
        cls.lpfnWndProc = self._wndproc
        cls.hInstance = hinst
        cls.lpszClassName = 'EselShotTrayWindow'
        user32.RegisterClassExW(ctypes.byref(cls))

        self.hwnd = user32.CreateWindowExW(0, 'EselShotTrayWindow', 'EselShot', 0,
                                           0, 0, 0, 0, None, None, hinst, None)
        self.hicon = create_icon()

        nid = NOTIFYICONDATAW()
        nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
        nid.hWnd = self.hwnd
        nid.uID = 1
        nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
        nid.uCallbackMessage = WM_TRAY
        nid.hIcon = self.hicon
        nid.szTip = self.tooltip[:127]
        self._nid = nid
        shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(nid))

        for hk_id, mods, vk in self.hotkeys:
            if not user32.RegisterHotKey(self.hwnd, hk_id, mods, vk):
                self.failed_hotkeys.append(hk_id)

        self._ready.set()

        msg = wintypes.MSG()
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))

    def _cleanup(self):
        for hk_id, _, _ in self.hotkeys:
            user32.UnregisterHotKey(self.hwnd, hk_id)
        try:
            shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(self._nid))
        except Exception:
            pass
        if self.hicon:
            user32.DestroyIcon(self.hicon)

    # -- Fensterprozedur ------------------------------------------------------
    def _on_message(self, hwnd, msg, wparam, lparam):
        if msg == WM_HOTKEY:
            self.on_event(('hotkey', int(wparam)))
            return 0
        if msg == WM_TRAY:
            low = lparam & 0xFFFF
            if low in (WM_LBUTTONUP, WM_LBUTTONDBLCLK):
                self.on_event(('menu', 'capture'))
            elif low == WM_RBUTTONUP:
                self._show_menu(hwnd)
            return 0
        if msg == WM_COMMAND:
            self.on_event(('menu', int(wparam & 0xFFFF)))
            return 0
        if msg == WM_QUIT_APP:
            user32.DestroyWindow(hwnd)
            return 0
        if msg == WM_DESTROY:
            self._cleanup()
            user32.PostQuitMessage(0)
            return 0
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    def _show_menu(self, hwnd):
        menu = user32.CreatePopupMenu()
        for item in self.menu_items():
            if item is None:
                user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
            else:
                item_id, label, checked = item
                flags = MF_STRING | (MF_CHECKED if checked else 0)
                user32.AppendMenuW(menu, flags, item_id, label)

        pt = wintypes.POINT()
        user32.GetCursorPos(ctypes.byref(pt))
        user32.SetForegroundWindow(hwnd)  # sonst bleibt das Menü offen hängen
        cmd = user32.TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_NONOTIFY,
                                    pt.x, pt.y, 0, hwnd, None)
        user32.DestroyMenu(menu)
        user32.PostMessageW(hwnd, 0, 0, 0)
        if cmd:
            self.on_event(('menu', int(cmd)))
