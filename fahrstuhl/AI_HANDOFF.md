# Fahrstuhl Bot - AI Handoff

Stand: 2026-05-10

## Projektziel

Fahrstuhl ist ein Discord-Bot mit Dashboard und wird von einem Troll-Bot zu einer vollständigen Allround-Plattform weiterentwickelt.

Ziel: MEE6-ähnliche Funktionen mit eigener Eselbande-Identität.

Neue Features müssen:
- über das Dashboard steuerbar sein
- anfängerfreundlich sein
- stabil und production-ready sein
- bestehende Systeme erweitern, nicht neu bauen
- modular aufgebaut sein
- mit Bot API + Dashboard zusammenarbeiten
- sauber validieren und strukturierte Fehler zurückgeben

Kein Fokus mehr auf Troll-Features.

---

## Grundregeln für AI/Codex

- Keine kompletten Systeme neu erfinden, wenn Tabellen/Manager/Utils existieren.
- Erst vorhandene Dateien prüfen, dann gezielt erweitern.
- Kein blindes `git add .`
- Keine Secrets committen.
- Bei Codeänderungen immer Syntax prüfen:
  - `node --check commands/index.js`
  - `node --check index.js`
  - `node --check services/botAPI.js`
  - `git diff --check`
- Dashboard-Änderungen müssen mobil funktionieren.
- API-Endpunkte müssen JSON mit `success`, `error`, `details` zurückgeben.
- Fehler pro Guild/Feature isolieren, damit ein Fehler nicht den Bot stoppt.

---

## Nicht committen

Diese Dateien dürfen nicht committed werden:

- dashboard/public/includes/config.php
- data/premium.db
- globalStats.json
- cloudflared
- dashboard/public/callback.php
- userPrefs.json
- .env
- node_modules/
- vendor/

---

## Zielstruktur

- Welcome / Verification
- Moderation
- Logging
- AutoMod
- Tickets
- Leveling
- Reaction Roles
- Social Alerts
- Temp Voice
- Free Games
- Setup / Onboarding
- Dashboard UX
- Analytics / Server Insights
- Backup / Health System
- Premium / Feature Gates

---

## Nächste sinnvolle Features

### Priorität 1 — Dashboard UX

#### Setup Assistant für neue Server

Ziel:
Ein Schritt-für-Schritt-Assistent im Dashboard.

Schritte:
1. Server auswählen
2. Welcome aktivieren
3. Verification optional aktivieren
4. Moderation-Grundsetup
5. AutoMod Preset wählen
6. Logging Channel setzen
7. Ticket-System optional einrichten
8. Zusammenfassung + Test

Dateien:
- dashboard/public/pages/setup.php
- services/botAPI.js
- evtl. dashboard/public/assets/js/setup-wizard.js

Wichtig:
- Kein harter Reload nach jedem Schritt
- AJAX/Fetch nutzen
- Anfängerfreundliche Texte
- Test-Buttons pro Modul

---

### Priorität 2 — Logging Dashboard

#### Letzte Log-Events anzeigen

Aktuell kann logging.php nur konfigurieren.

Neu:
- letzte Events im Dashboard anzeigen
- Filter nach Event-Type
- Filter nach User/Moderator
- Suche nach Channel/User-ID
- Pagination
- Live-Refresh Button

Dateien:
- dashboard/public/pages/logging.php
- services/botAPI.js
- utils/serverLogger.js

Wichtig:
- vorhandenes Logging-System nutzen
- keine zweite Log-Struktur bauen

---

### Priorität 3 — Dashboard AJAX Modernisierung

Ziel:
Weniger Reloads im Dashboard.

Umsetzen bei:
- Welcome speichern
- AutoMod Presets
- Logging Channel speichern
- Ticket Settings speichern
- Leveling Settings speichern
- Free Games Testpost
- Social Alerts Test

Vorgaben:
- Buttons zeigen Loading-State
- Erfolg/Fehler als Toast anzeigen
- CSRF Token mitsenden
- API-Fehler sichtbar anzeigen

---

### Priorität 4 — Server Health Center

Neue Dashboard-Seite:

`dashboard/public/pages/health.php`

Anzeigen:
- Bot online/offline
- Bot API erreichbar
- Discord Ping
- Datenbankstatus
- letzte Backups
- aktive Schedules
- Social Alerts Status
- Free Games API Status
- Temp Voice DB Cleanup Status

Optional:
- Warnungen mit Fix-Hinweisen
- „System prüfen“-Button

---

### Priorität 5 — Moderation Erweiterungen

Bestehendes System nutzen:
- moderation_cases Tabelle

Neue Features:
- Case Notes
- Case Status: open / reviewed / appealed / closed
- User-Profilseite mit kompletter Mod-History
- Dashboard Quick Actions:
  - Timeout
  - Warn
  - Kick
  - Ban
  - Unban
- AutoMod Cases automatisch mit Moderation History verknüpfen

Keine neue Tabelle bauen, außer nötig.

---

### Priorität 6 — Ticket Erweiterungen

Bestehendes System nutzen:
- utils/ticketManager.js
- tickets.php
- services/botAPI.js

Neue Features:
- Ticket Priorität: low / normal / high
- Ticket Tags
- Interne Notizen
- Ticket Reminder bei Inaktivität
- SLA/Antwortzeit Anzeige
- Ticket Statistiken:
  - offene Tickets
  - durchschnittliche Antwortzeit
  - Tickets pro Teammitglied
- Transcript Preview im Dashboard

---

### Priorität 7 — Leveling Erweiterungen

Bestehendes System nutzen:
- utils/levelingManager.js

Neue Features:
- XP Booster Events
- Wochen-Leaderboard
- Monats-Leaderboard
- Level-Up Embed Editor
- Level-Up Channel Override
- Admin: XP hinzufügen/entfernen
- Anti-Farm-Details im Dashboard anzeigen

---

### Priorität 8 — AutoMod Erweiterungen

Neue Features:
- Whitelist Rollen
- Whitelist Channels
- Invite Filter
- Mention Spam Filter
- Emoji Spam Filter
- Bad Words Kategorien
- AutoMod Logs im Dashboard
- AutoMod Testfeld:
  - Admin gibt Text ein
  - Dashboard zeigt, welche Regel greifen würde

Wichtig:
- Fehler dürfen Message-Handling nicht crashen
- Regex sicher behandeln

---

### Priorität 9 — Premium / Feature Gates

Ziel:
Premium-System sauber im Dashboard anzeigen.

Features:
- Feature-Limits pro Guild anzeigen
- Premium Badge
- Locked Features visuell markieren
- Upgrade-Hinweise
- API Helper:
  - `hasPremium(guildId)`
  - `canUseFeature(guildId, featureName)`

Wichtig:
- EselTokens ist separates Projekt
- Fahrstuhl darf nur interagieren
- Keine Änderungen an EselTokens ohne explizite Anweisung

---

### Priorität 10 — Analytics / Server Insights

Neue Dashboard-Seite:

`dashboard/public/pages/analytics.php`

Anzeigen:
- Mitgliederentwicklung
- Nachrichten pro Tag
- aktive User
- Top Channels
- Moderation-Fälle pro Woche
- Tickets pro Woche
- Leveling Aktivität
- Free Games Klicks/Testposts optional

Wichtig:
- Datenschutz beachten
- keine unnötigen Message-Inhalte speichern
- aggregierte Daten bevorzugen

---

## Sicherheitsvorgaben

- BOT_API_TOKEN ist Pflicht
- Dashboard API nie ohne Auth verwenden
- CSRF aktiv lassen
- Inputs validieren
- Guild-Zugriff prüfen
- User muss Admin/ManageGuild-Rechte haben
- Keine Tokens in Logs
- Keine Stacktraces im Frontend anzeigen
- Regex mit try/catch validieren
- Externe Feeds isoliert behandeln

---

## Deployment

Lokal:

```bash
git status --short
node --check commands/index.js
node --check index.js
node --check services/botAPI.js
git diff --check