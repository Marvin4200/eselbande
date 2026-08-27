"""Das Programmsymbol - im Code gezeichnet, damit keine Binärdatei nötig ist.

Eine lila Kachel im eselbande-Verlauf mit weißer Kamera. `render_rgba` liefert
die Pixel für das Tray-Symbol, `write_ico` schreibt daraus eine .ico-Datei für
Verknüpfungen und den Eintrag unter „Apps & Features".
"""

import struct

from . import pngenc

GRADIENT_FROM = (0x66, 0x7e, 0xea)
GRADIENT_TO = (0x81, 0x8c, 0xf8)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def _inside_round_rect(x, y, x0, y0, x1, y1, radius):
    cx = min(max(x, x0 + radius), x1 - radius)
    cy = min(max(y, y0 + radius), y1 - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius


def render_rgba(size, supersample=2):
    """RGBA-Pixel des Symbols. Wird doppelt gerendert und verkleinert,
    damit die Rundungen ohne Zeichenbibliothek weich werden."""
    n = size * supersample
    px = bytearray(n * n * 4)
    radius = n * 0.28

    body = (n * 0.18, n * 0.34, n * 0.82, n * 0.76)
    bump = (n * 0.36, n * 0.24, n * 0.62, n * 0.36)
    lens_x, lens_y, lens_r = n * 0.5, n * 0.55, n * 0.155
    r0, g0, b0 = GRADIENT_FROM
    r1, g1, b1 = GRADIENT_TO

    for y in range(n):
        fy = y + 0.5
        row = y * n * 4
        for x in range(n):
            fx = x + 0.5
            if not _inside_round_rect(fx, fy, 0, 0, n, n, radius):
                continue
            t = (x + y) / (2.0 * n)
            r = int(r0 + (r1 - r0) * t)
            g = int(g0 + (g1 - g0) * t)
            b = int(b0 + (b1 - b0) * t)

            in_lens = (fx - lens_x) ** 2 + (fy - lens_y) ** 2 <= lens_r ** 2
            if not in_lens:
                in_body = _inside_round_rect(fx, fy, body[0], body[1], body[2], body[3], n * 0.08)
                in_bump = bump[0] <= fx <= bump[2] and bump[1] <= fy <= bump[3]
                if in_body or in_bump:
                    r = g = b = 0xff
            px[row + x * 4:row + x * 4 + 4] = bytes((r, g, b, 0xff))

    if supersample == 1:
        return bytes(px)

    out = bytearray(size * size * 4)
    divisor = supersample * supersample
    for y in range(size):
        for x in range(size):
            acc = [0, 0, 0, 0]
            for dy in range(supersample):
                base = ((y * supersample + dy) * n + x * supersample) * 4
                for dx in range(supersample):
                    i = base + dx * 4
                    acc[0] += px[i]
                    acc[1] += px[i + 1]
                    acc[2] += px[i + 2]
                    acc[3] += px[i + 3]
            j = (y * size + x) * 4
            out[j:j + 4] = bytes(v // divisor for v in acc)
    return bytes(out)


def write_ico(path, sizes=ICO_SIZES):
    """Mehrgrößen-.ico mit PNG-Inhalt (von Windows ab Vista unterstützt)."""
    images = [(size, pngenc.encode(size, size, render_rgba(size))) for size in sizes]

    header = struct.pack('<HHH', 0, 1, len(images))
    offset = len(header) + 16 * len(images)
    entries, blobs = b'', b''
    for size, data in images:
        entries += struct.pack('<BBBBHHII',
                               size if size < 256 else 0,
                               size if size < 256 else 0,
                               0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)

    with open(path, 'wb') as fh:
        fh.write(header + entries + blobs)
    return path


if __name__ == '__main__':
    import sys
    print(write_ico(sys.argv[1] if len(sys.argv) > 1 else 'eselshot.ico'))
