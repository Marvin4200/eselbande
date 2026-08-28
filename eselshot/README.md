# EselShot

Screenshot-Tool für den Desktop, im Stil von Lightshot – nur mit eigenem Hoster:
Taste drücken, Bildschirm friert ein, Bereich aufziehen, optional etwas
einzeichnen, **Hochladen** – der Link liegt sofort in der Zwischenablage und
zeigt auf `files.eselbande.com`.

Zwei Wege, das Programm zu nutzen:

| Weg | Wer |
|---|---|
| **`EselShot.exe` von <https://files.eselbande.com/eselshot>** herunterladen | Alle. Kein Python nötig, 12 MB. |
| Aus dem Quellcode starten (`python -m eselshot --tray`) | Entwickelnde |

Die .exe ist ein PyInstaller-Build; unter der Haube läuft dasselbe Python-Paket
(reine Standardbibliothek – kein pip zur Laufzeit, kein Fremdpaket).
Bildschirmaufnahme über GDI, Oberfläche über Tkinter, PNG-Kodierung über zlib.

---

## Für den Endnutzer

1. **<https://files.eselbande.com/eselshot>** öffnen, **Für Windows herunterladen**.
2. `EselShot.exe` doppelklicken. Windows warnt beim ersten Start („SmartScreen") –
   *Weitere Informationen → Trotzdem ausführen*. Der kleine Einrichter fragt nach
   Desktop-Verknüpfung, Autostart und Sofortstart.
3. **Token holen:** auf <https://files.eselbande.com> mit Discord anmelden,
   in der Karte *„🖥️ EselShot – API-Token"* auf **+ Neues Token** klicken,
   Wert kopieren (nur einmal sichtbar).
4. Rechtsklick aufs Tray-Symbol → *Einstellungen …*, Token einfügen,
   *Verbindung testen*, *Speichern*.
5. **Druck** drücken, Bereich aufziehen, **Hochladen** – Link in der Zwischenablage.

## Für den Betreiber (dich)

**Einmalig für den Server:**

1. Änderungen ins Repo bringen (`filehoster/index.js`, `filehoster/public/index.html`,
   `filehoster/public/eselshot.html`, `eselshot/…`, `filehoster/downloads/EselShot.exe`).
2. `.exe` bauen und bereitstellen:
   ```
   cd eselbande\eselshot
   update-download.cmd
   ```
3. Filehoster neu bauen und starten:
   ```
   cd eselbande\fahrstuhl
   docker compose up -d --build filehoster
   ```

Die neue Tabelle `api_tokens` legt sich beim ersten Start automatisch an, und
die exe wird unter `/download/EselShot.exe` ausgeliefert.

**Wenn du die exe aktualisieren willst:** `update-download.cmd` und den
`filehoster`-Container neu starten. Fertig.

## Bedienung

| Taste | Wirkung |
|---|---|
| `Druck` | Bereich auswählen |
| `Strg+Umschalt+S` | Bereich auswählen (Ausweichkürzel) |
| `Strg+Umschalt+F` | ganzer Bildschirm |
| `Strg+Umschalt+W` | aktives Fenster |

Im Overlay:

| Taste | Wirkung |
|---|---|
| Ziehen | Bereich aufziehen; danach an den Anfassern ändern oder verschieben |
| `Enter` | hochladen |
| `Strg+C` | ins Bild in die Zwischenablage |
| `Strg+S` | als PNG speichern |
| `Strg+Z` | letzte Zeichnung zurück |
| `Rechtsklick` | Auswahl verwerfen |
| `Esc` | abbrechen |

Werkzeuge in der Leiste: Verschieben, Stift, Linie, Pfeil, Rechteck, Ellipse,
Marker, Text – dazu sieben Farben und drei Strichstärken.

## Aus dem Quellcode starten

```bash
python -m eselshot               # im Infobereich
python -m eselshot --region      # einmalig Bereich aufnehmen
python -m eselshot --full        # einmalig ganzer Bildschirm
python -m eselshot --window      # einmalig aktives Fenster
python -m eselshot --file X.png  # vorhandene Datei hochladen
python -m eselshot --settings    # nur Einstellungen öffnen
python -m eselshot --install     # in %USERPROFILE%\EselShot installieren
python -m eselshot --uninstall   # sauber entfernen
```

## Dateien

| Datei | Inhalt |
|---|---|
| `eselshot/winapi.py` | Bildschirmaufnahme, Zwischenablage, DPI, Monitorgeometrie |
| `eselshot/tray.py` | Tray-Symbol, Kontextmenü, globale Hotkeys |
| `eselshot/icon.py` | Programmsymbol als RGBA und .ico |
| `eselshot/editor.py` | Overlay: Einfrieren, Auswahl, Zeichenwerkzeuge, Export |
| `eselshot/pngenc.py` | PNG-Encoder auf Basis von zlib |
| `eselshot/uploader.py` | Upload zum Filehoster per Bearer-Token |
| `eselshot/settings.py` | Einstellungsfenster |
| `eselshot/notify.py` | Benachrichtigung unten rechts |
| `eselshot/config.py` | Konfiguration und Autostart |
| `eselshot/installer.py` | Installation und Deinstallation im Nutzerprofil |
| `eselshot/app.py` | Programmsteuerung |
| `eselshot_launcher.py` | Einstiegspunkt für PyInstaller |
| `build.py` | Baut `dist/EselShot.exe` |
| `update-download.cmd` | Bauen und in `filehoster/downloads/` legen |

## Wie das Bild entsteht

Beim Auslösen wird der gesamte virtuelle Bildschirm einmal per `BitBlt`
abfotografiert und als PNG ins Overlay geladen – ab da ist das Bild eingefroren.
Alles außerhalb der Auswahl wird um 47 % abgedunkelt, die Auswahl selbst zeigt
den unveränderten Ausschnitt.

Beim Abschluss blendet das Overlay seine Bedienelemente aus und fotografiert den
gewählten Bereich erneut vom Bildschirm ab. Dadurch landen Pfeile, Rahmen und
Texte pixelgenau so im Bild, wie sie zu sehen waren – ganz ohne Grafikbibliothek.

## Serverseite

Der Filehoster (`../filehoster`) hat dafür bekommen:

- Tabelle `api_tokens` (nur der SHA-256-Hash wird gespeichert, nie das Token selbst)
- `GET/POST/DELETE /api/tokens` – Verwaltung, nur mit Browser-Sitzung erreichbar,
  damit ein Token keine weiteren Tokens erzeugen kann
- `/api/upload`, `/api/files` und `/api/me` akzeptieren zusätzlich
  `Authorization: Bearer esel_…`
- `GET /eselshot` – Landingpage mit Download-Button
- `GET /download/EselShot.exe` – öffentlicher Download, keine Anmeldung
- `GET /api/eselshot/version` – Größe und mtime der Datei

Optional lässt sich mit `PUBLIC_BASE_URL` einstellen, welche Adresse in den
zurückgegebenen Links steht (Standard: `https://files.eselbande.com`).
