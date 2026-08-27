"""Minimaler PNG-Encoder (nur zlib + struct aus der Standardbibliothek).

Tk 8.6 kann PNG direkt anzeigen, deshalb dient derselbe Encoder sowohl für
die Vorschau im Overlay als auch für die Datei, die hochgeladen wird.
"""

import struct
import zlib


def _chunk(tag, data):
    body = tag + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)


def encode(width, height, rgba, level=6):
    """RGBA-Bytes -> PNG. level=1 für schnelle Vorschau, 6 für den Upload."""
    stride = width * 4
    raw = bytearray(height * (stride + 1))
    for y in range(height):
        pos = y * (stride + 1)
        raw[pos] = 0  # Filter "None" - Screenshots komprimieren auch so gut
        raw[pos + 1:pos + 1 + stride] = rgba[y * stride:(y + 1) * stride]

    return (b'\x89PNG\r\n\x1a\n'
            + _chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + _chunk(b'IDAT', zlib.compress(bytes(raw), level))
            + _chunk(b'IEND', b''))


def crop(rgba, width, x, y, w, h):
    """Ausschnitt aus einem RGBA-Puffer."""
    out = bytearray(w * h * 4)
    for row in range(h):
        src = ((y + row) * width + x) * 4
        out[row * w * 4:(row + 1) * w * 4] = rgba[src:src + w * 4]
    return bytes(out)


def solid_png(width, height, rgba_color, level=6):
    """Einfarbige Fläche - für die Abdunklung außerhalb der Auswahl."""
    return encode(width, height, bytes(rgba_color) * (width * height), level)
