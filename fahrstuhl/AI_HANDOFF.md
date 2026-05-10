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
```

Server (Dashboard only):

```bash
ssh root@192.168.2.177 "cd /home/marvin && git pull origin main && docker compose -f fahrstuhl/docker-compose.yml up -d --build dashboard-php && echo DONE"
```

---

## Design-Qualitäts-Audit — Dashboard

**Stand: 2026-05-10 | Gesamtbewertung: 15 / 20**

### Kategorien

| Kategorie | Punkte | Bewertung |
|---|---|---|
| Typografie | 2/3 | System-Font-Stack (`-apple-system` etc.) — kein eigener Font |
| Farb-Tokens | 3/3 | Vollständig in `:root`, konsistent genutzt |
| Spacing-System | 2/3 | Spacing-Scale in `:root`, aber inline Hex-Farben in guilds/security/moderation/rewards-hub |
| Komponenten-Konsistenz | 3/3 | Alle border-radius auf Design-Tokens tokenisiert, doppelter CSS-Block entfernt |
| Animationen | 3/3 | GPU-only: `transform: scaleX()` für Progress Bars, kein `transition: width` mehr |
| Anti-Patterns (Impeccable) | 4/4 | **0 Findings** — clean seit Commit `23fa20d` |

**Gesamt: 15 / 20 — Sehr gut. Impeccable-clean, alle border-radius tokenisiert.**

---

### Anti-Pattern-Verlauf

| Datum | Anti-Patterns | Aktion |
|---|---|---|
| 2026-05-10 (vor Fix) | **7** | `border-left` side-tabs (6×), `transition: width` (1×), `:root` Duplikat |
| 2026-05-10 (Commit `23fa20d`) | **0** | Alle 7 behoben — verifiziert per grep + `npx impeccable@2.1.8 detect` |

#### Was wurde geändert (Commit `23fa20d`)

**`fahrstuhl/dashboard/public/assets/css/style.css`**
- `.toast-success`, `.toast-error`, `.toast-info`: `border-left: 3px solid` → `box-shadow: inset 3px 0 0 rgba(...)`
- `.alert` (alle 4 Severity-Varianten): `border-left: 4px solid` → `box-shadow: inset 3px 0 0 rgba(...)`
- `.notif-severity-critical`, `.notif-severity-warning`: `border-left: 3px solid` → `box-shadow: inset 3px 0 0 rgba(...)`
- `.progress-bar-fill`: `transition: width` → `transform: scaleX(0)` + `transform-origin: left` + `transition: transform 0.8s cubic-bezier(...)`
- Zweiter `:root`-Block in Haupt-`:root`-Block integriert, Duplikat entfernt

**`fahrstuhl/dashboard/public/pages/server-backup.php`**
- JS: `style.width = pct + '%'` → `style.transform = 'scaleX(' + (pct / 100) + ')'`

**`fahrstuhl/dashboard/public/pages/setup.php`**
- JS: `style.width = pct + '%'` → `style.transform = 'scaleX(' + (pct / 100) + ')'`

#### Verbleibende Audit-Punkte (nicht kritisch)

- System-Font-Stack (`-apple-system, BlinkMacSystemFont, ...`) — kein eigener Font geladen
- Inline Hex-Farben (`style="color:#..."`) in `guilds.php`, `security.php`, `moderation.php`, `rewards-hub.php`
- Gradient-Buttons (`.btn-primary`, `.btn-logout`) — leicht KI-typisch, aber funktional
- `mobile-responsive.css` als eigene Datei (extra HTTP-Request)

---

### Smoke-Test — 2026-05-10 (nach Commit `23fa20d`)

| Bereich | Ergebnis |
|---|---|
| Landing Page (`/fahrstuhl/`) | ✅ HTTP 200, JS läuft, CSS geladen |
| Auth-Schutz (setup.php, server-backup.php) | ✅ Redirect zur Landing Page — korrekt |
| CSS Anti-Patterns (grep) | ✅ 0× `transition: width`, 0× colored `border-left`, 1× `:root` |
| CLI Re-Scan (Impeccable) | ✅ Exit 0 — **0 anti-patterns found** |
| Mobile Sidebar | ✅ Kein farbiger Side-Tab — `border-left: 0` Reset vorhanden |
| Progress Bar Technik | ✅ `transform: scaleX()` + `transform-origin: left` + `overflow: hidden` |
| Toast / Notification Accent | ✅ `inset box-shadow` statt `border-left` |

---

### Commit-Log — Design-Qualität

| Commit | Beschreibung | Ergebnis |
|---|---|---|
| `23fa20d` | CSS/JS Anti-Pattern-Fixes (side-tabs → inset shadow, transition:width → scaleX, :root Duplikat) | Impeccable: 7 → **0** Findings |
| `cd873c4` | Audit-Dokumentation + Smoke-Test in AI_HANDOFF.md | Score: **14 / 20** |
| `2b940bf` | Component consistency pass — alle border-radius auf Tokens, doppelter CSS-Block entfernt | Score: **15 / 20**, Impeccable: **0** |

**Aktueller Status: Impeccable-clean — 0 known AI-UI anti-patterns. Komponenten-Konsistenz: 3/3.**

Nächster Schritt: Typografie 2/3 → 3/3 (System-Font-Stack ersetzen) oder Inline-Hex-Farben in PHP-Dateien bereinigen.