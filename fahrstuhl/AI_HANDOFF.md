# Fahrstuhl Bot - AI Handoff

Stand: 2026-05-04

## Projektziel

Fahrstuhl ist ein Discord-Bot mit Dashboard und wird aktuell von einem Troll-Bot zu einer vollständigen Allround-Plattform weiterentwickelt.

Ziel ist eine MEE6-ähnliche Funktionalität, aber mit eigener Eselbande-Identität.

Neue Features müssen:
- über das Dashboard steuerbar sein
- anfängerfreundlich sein
- stabil und production-ready sein
- bestehende Systeme erweitern, nicht neu erfinden
- modular aufgebaut sein

Kein Fokus mehr auf Troll-Features.

## MEE6-Zielstruktur

Diese Bereiche sind die Zielstruktur des Bots:

- Welcome / Verification
- Moderation
- Logging
- AutoMod
- Tickets
- Leveling
- Reaction Roles
- Social Alerts
- Temp Voice
- Setup / Onboarding
- Dashboard UX

## EselTokens

EselTokens ist ein separates Projekt.

Fahrstuhl darf damit interagieren, aber keine Änderungen daran machen, außer explizit gewünscht.

## Nicht committen

Diese Dateien dürfen nicht committed werden:

- dashboard/public/includes/config.php
- data/premium.db
- globalStats.json
- cloudflared
- dashboard/public/callback.php
- userPrefs.json

Kein blindes git add .

## Security / Stabilität

- BOT_API_TOKEN ist Pflicht
- CSRF Schutz im Dashboard aktiv
- API gibt strukturierte Fehler zurück
- Social Alerts isolieren Fehler pro Feed
- Twitch darf beim ersten Check nicht direkt posten

## Kritischer Bug: Backup Warning

Fehler:

WARN Backup is stale  
No recent successful backup was recorded  
Reason: scheduled  

Fix Commit: cae98dd  
Datei: services/botAPI.js  

Problem:

Die Health-Logik hat nur den alten backupManager genutzt.

Fix:

buildHealthSummary() muss folgende Tabellen berücksichtigen:

- discord_backups
- discord_backup_schedules
- discord_backup_jobs

Warnung darf nur kommen, wenn:

- kein aktuelles Backup existiert
- kein aktiver Schedule vorhanden ist
- kein Job läuft

Wenn Problem weiter besteht:

- prüfen ob pm2 neu gestartet wurde
- prüfen ob DB Daten existieren
- prüfen ob alter Code noch läuft
- prüfen ob mehrere Health Checks existieren

## Module

### Welcome

Dateien:
- dashboard/public/pages/welcome.php
- services/botAPI.js
- index.js

Features:
- Embed Editor
- Live Preview
- Autorole
- Verification Button
- Count Button

Custom ID:
welcome:verify:<guildId>

### Moderation

Dateien:
- commands/index.js
- services/botAPI.js

Vorhanden:
- /mod warn
- /mod timeout
- /mod history

Fehlt:
- /mod kick
- /mod ban
- /mod unban
- /mod cases mit Pagination
- Dashboard Case Filter
- Case Details
- Reason bearbeiten

Wichtig:
- moderation_cases Tabelle nutzen
- kein neues System bauen

### Logging

Dateien:
- utils/serverLogger.js
- services/botAPI.js
- index.js

Features:
- zentrale Logs
- viele Events

Fehlt:
- pro Event Channel
- Audit Logs
- Dashboard Anzeige

### Tickets

Dateien:
- dashboard/public/pages/tickets.php
- utils/ticketManager.js
- commands/index.js
- services/botAPI.js

Features:
- Ticket Panel
- private Channels
- Dashboard Steuerung

Fehlt:
- Transcript
- Claim System
- mehrere Panels

### AutoMod

Dateien:
- dashboard/public/pages/automod.php
- services/botAPI.js
- index.js

Features:
- Spam Detection
- Link Filter
- Caps Filter
- Punishments

Fehlt:
- Presets
- Regex
- Rule-System

### Leveling

Dateien:
- utils/levelingManager.js
- commands/index.js
- index.js
- dashboard/public/pages/leveling.php

Features:
- XP pro Message
- Rank
- Leaderboard

Fehlt:
- Level Rollen
- XP Multiplikatoren
- Reset

### Reaction Roles

Dateien:
- dashboard/public/pages/reaction-roles.php
- services/botAPI.js
- index.js

Custom ID:
rr:<roleId>

### Social Alerts

Dateien:
- dashboard/public/pages/social.php
- utils/socialNotifier.js
- services/botAPI.js
- index.js

Features:
- YouTube
- Twitch
- RSS

### Temp Voice

Dateien:
- dashboard/public/pages/temp-voice.php
- services/botAPI.js
- index.js

Problem:
- aktuell nur im RAM gespeichert

## Deployment

cd /home/marvin/fahrstuhl
git pull

node --check commands/index.js
node --check index.js
node --check services/botAPI.js

pm2 restart fahrstuhl dashboard-php --update-env
pm2 save
pm2 logs fahrstuhl --lines 80

## Workflow

git status --short

node --check commands/index.js
node --check index.js
node --check services/botAPI.js
git diff --check

## Nächste Aufgaben (sehr wichtig)

Priorität 1:

Moderation erweitern:

- /mod kick
- /mod ban
- /mod unban
- /mod cases mit Pagination
- Dashboard Case Filter
- Logging Integration

Priorität 2:

Leveling erweitern:

- Level Rollen
- XP Multiplikator
- Reset

Priorität 3:

Tickets erweitern:

- Transcript
- Claim System
- bessere Panels

Priorität 4:

Logging erweitern:

- bessere Logs
- Audit Logs

Priorität 5:

Dashboard UX verbessern:

- weniger Reloads
- Setup Assistent

## Ziel

Fahrstuhl soll:

- wie MEE6 funktionieren
- vollständig über Dashboard steuerbar sein
- stabil und production-ready sein