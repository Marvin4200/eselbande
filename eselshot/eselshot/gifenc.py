"""GIF-Encoder ohne externe Abhängigkeiten - auf Tempo ausgelegt.

Drei Entscheidungen machen den Unterschied zwischen "unbenutzbar" und "geht":

1. Feste 6x6x6-Palette (216 Farben) statt Medianschnitt pro Frame. Eine
   Bildschirmaufnahme braucht keine optimale Palette, und so entfällt die
   Farbsuche komplett - die Zuordnung ist reine Arithmetik.

2. Die Kanalzuordnung läuft über ``bytes.translate`` plus eine Addition
   grosser Ganzzahlen. Weil kein Byte-Ergebnis 255 übersteigt (180+30+5),
   gibt es keine Überträge zwischen den Byte-Stellen - die Addition wirkt
   damit elementweise, läuft aber komplett in C statt in einer Python-Schleife.

3. Identische Folgeframes werden nicht neu kodiert, sondern verlängern die
   Anzeigedauer des vorherigen. Bei Bildschirmaufnahmen mit ruhigen Phasen
   spart das den Grossteil der Arbeit.
"""

import struct

# 6 Stufen je Kanal -> Index = r*36 + g*6 + b (0..215)
_LEVELS = 6
_T_R = bytes((v // 43) * 36 for v in range(256))
_T_G = bytes((v // 43) * 6 for v in range(256))
_T_B = bytes((v // 43) for v in range(256))

# Palette: Stufe c (0..5) -> Farbwert c*51 (0, 51, ... 255)
_PALETTE = bytes(
    c
    for r in range(_LEVELS)
    for g in range(_LEVELS)
    for b in range(_LEVELS)
    for c in (r * 51, g * 51, b * 51)
) + bytes(3 * (256 - _LEVELS ** 3))  # auf 256 Einträge auffüllen

MAX_COLORS = _LEVELS ** 3


def quantize(rgba):
    """RGBA-Bytes -> Palettenindex je Pixel (ein Byte pro Pixel)."""
    r = rgba[0::4].translate(_T_R)
    g = rgba[1::4].translate(_T_G)
    b = rgba[2::4].translate(_T_B)
    n = len(r)
    if n == 0:
        return b''
    total = (int.from_bytes(r, 'big')
             + int.from_bytes(g, 'big')
             + int.from_bytes(b, 'big'))
    return total.to_bytes(n, 'big')


def _lzw(indices, min_code=8):
    """GIF-LZW. Bits werden direkt beim Erzeugen gepackt - eine einzige
    Zustandsmaschine, die nicht mit einem zweiten Durchlauf synchron
    bleiben muss."""
    clear = 1 << min_code
    eoi = clear + 1

    out = bytearray()
    bitbuf = 0
    bitlen = 0
    code_size = min_code + 1
    next_code = eoi + 1
    table = {}

    def emit(code):
        nonlocal bitbuf, bitlen
        bitbuf |= code << bitlen
        bitlen += code_size
        while bitlen >= 8:
            out.append(bitbuf & 0xFF)
            bitbuf >>= 8
            bitlen -= 8

    emit(clear)

    if indices:
        prefix = indices[0]
        for k in indices[1:]:
            key = (prefix << 8) | k
            found = table.get(key)
            if found is not None:
                prefix = found
                continue
            emit(prefix)
            if next_code < 4096:
                table[key] = next_code
                next_code += 1
                # erst senden, dann verbreitern - der Decoder tut dasselbe
                if next_code > (1 << code_size) and code_size < 12:
                    code_size += 1
            else:
                emit(clear)
                table.clear()
                code_size = min_code + 1
                next_code = eoi + 1
            prefix = k
        emit(prefix)

    emit(eoi)
    if bitlen:
        out.append(bitbuf & 0xFF)

    # in Sub-Blöcke à höchstens 255 Byte zerlegen
    result = bytearray([min_code])
    for i in range(0, len(out), 255):
        block = out[i:i + 255]
        result.append(len(block))
        result += block
    result.append(0)
    return bytes(result)


def _frame_block(indices, width, height, delay):
    out = bytearray()
    out += b'\x21\xF9\x04\x00'           # Graphic Control Extension
    out += struct.pack('<H', delay)
    out += b'\x00\x00'
    out += b'\x2C'                       # Image Descriptor
    out += struct.pack('<HHHH', 0, 0, width, height)
    out += b'\x00'                       # keine lokale Farbtabelle
    out += _lzw(indices)
    return bytes(out)


def encode(frames, width, height, fps=10, loop=True, on_progress=None):
    """frames: Liste von RGBA-bytes (je width*height*4). Gibt GIF-Bytes zurück."""
    return encode_indexed([quantize(f) for f in frames], width, height,
                          fps=fps, loop=loop, on_progress=on_progress)


def encode_indexed(frames, width, height, fps=10, loop=True, on_progress=None):
    """Wie encode, aber die Frames liegen schon als Palettenindizes vor.

    Die Aufnahme quantisiert direkt beim Abgreifen - das spart drei Viertel
    des Arbeitsspeichers gegenüber gesammelten RGBA-Frames.
    """
    if not frames:
        raise ValueError('Keine Frames')

    base_delay = max(2, round(100 / max(1, fps)))  # GIF-Einheit: 1/100 s

    out = bytearray()
    out += b'GIF89a'
    out += struct.pack('<HH', width, height)
    out += bytes([0xF7, 0x00, 0x00])     # globale Farbtabelle, 256 Einträge
    out += _PALETTE
    if loop:
        out += b'\x21\xFF\x0B' + b'NETSCAPE2.0' + b'\x03\x01\x00\x00\x00'

    pending = None          # (indices, delay) - noch nicht geschrieben
    total = len(frames)

    for i, idx in enumerate(frames):
        if pending is not None and idx == pending[0]:
            # unverändert: nur die Standzeit des letzten Frames verlängern
            pending = (pending[0], min(pending[1] + base_delay, 65535))
        else:
            if pending is not None:
                out += _frame_block(pending[0], width, height, pending[1])
            pending = (idx, base_delay)
        if on_progress:
            on_progress((i + 1) / total)

    if pending is not None:
        out += _frame_block(pending[0], width, height, pending[1])

    out += b'\x3B'
    return bytes(out)
