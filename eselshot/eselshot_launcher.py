"""Einstiegspunkt fuer PyInstaller.

PyInstaller ruft das gebuendelte Skript als Top-Level-Modul auf; die relativen
Imports in ``eselshot/__main__.py`` funktionieren dort nicht. Deshalb dieser
duenne Wrapper, der das Paket ganz normal importiert.
"""
import sys

from eselshot.app import main

if __name__ == '__main__':
    sys.exit(main())
