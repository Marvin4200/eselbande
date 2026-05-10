# Fahrstuhl Bot - AI Handoff

Stand: 2026-05-10

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

## Behobene Bugs

### Backup Warning (gefixt in cae98dd)

buildHealthSummary() prüft jetzt: discord_backups, discord_backup_schedules, discord_backup_jobs.
Warnung kommt nur, wenn kein aktuelles Backup, kein aktiver Schedule und kein laufender Job vorhanden.

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
- dashboard/public/pages/moderation.php

Vorhanden:
- /mod warn
- /mod timeout
- /mod kick ✅
- /mod ban ✅
- /mod unban ✅
- /mod history
- /mod cases mit Pagination + Filter ✅
- Dashboard Case Filter (userId, moderatorId, type, status, reason) ✅
- Reason bearbeiten ✅

Wichtig:
- moderation_cases Tabelle nutzen
- kein neues System bauen

### Logging

Dateien:
- utils/serverLogger.js
- services/botAPI.js
- index.js
- dashboard/public/pages/logging.php

Features:
- zentrale Logs
- viele Events
- Per-Event Channel Override ✅ (resolveLogChannelId: event → group → global)
- Audit Logs ✅

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
- Transcript ✅ (buildTranscript, HTML + TXT Export)
- Claim System ✅ (/ticket claim, /ticket unclaim)
- Transcript Channel konfigurierbar ✅

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
- Quick Presets ✅ (Relaxed / Balanced / Strict)
- Regex Mode ✅ (blockedTermsRegex Toggle)

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
- Level Rollen (roleRewards) ✅
- removeLowerLevelRoles Toggle ✅
- Reset per User und per Guild ✅ (resetUserXp, resetGuildXp)
- XP Multiplikatoren pro Rolle ✅ (roleMultipliers, max 5x, Stack-Logik)
- XP Multiplikatoren pro Channel ✅ (channelMultipliers, max 5x)
- No-XP Channels ✅
- Voice XP ✅ (voiceXpEnabled, voiceXpPerMinute)
- Block Duplicate Messages ✅
- Min Message Length ✅

### Free Games

Dateien:
- utils/freeGamesNotifier.js
- commands/index.js (/freegames)
- dashboard/public/pages/freegames.php
- services/botAPI.js
- ../../freegamesapi/index.js (separater Microservice, Port 3016)

Features:
- Microservice fetcht: Epic, GOG, Steam, GamerPower (ex-Humble)
- itch.io gibt 403 → expected, wird ignoriert
- Ca. 21 Games gecacht beim Start
- Discord-Benachrichtigung bei neuen Free Games
- Live Status Embed (aktualisiert sich jede Minute)
- Filter: "all stores" vs "serious stores" (Epic/GOG/Steam only)
- Dashboard: Channel pro Guild konfigurierbar, Test-Post-Button
- /freegames setup, /freegames status, /freegames test

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
- utils/voiceChannelCleanup.js

Features:
- Channels in DB persistiert ✅ (temp_voice_channels Tabelle)
- Cleanup bei Bot-Neustart via VoiceChannelCleanup ✅

## Deployment

Lokal (Windows, Repo unter C:\Users\Txxle\Desktop\DebianServer\marvin):

git add <files>
git commit -m "..."
git push origin main

Server (192.168.2.177, Repo unter /home/marvin):

ssh root@192.168.2.177 "cd /home/marvin && git pull origin main && docker compose -f fahrstuhl/docker-compose.yml up -d --build fahrstuhl-docker && echo DONE"

Nur dashboard-php neu bauen:

ssh root@192.168.2.177 "cd /home/marvin && git pull origin main && docker compose -f fahrstuhl/docker-compose.yml up -d --build dashboard-php && echo DONE"

Logs prüfen:

ssh root@192.168.2.177 "docker logs --tail 20 fahrstuhl-phase1 2>&1"
ssh root@192.168.2.177 "docker logs --tail 20 dashboard-php-phase1 2>&1"

Container-Übersicht:

- fahrstuhl-phase1     → Bot + Bot API (Port 3002 intern)
- dashboard-php-phase1 → PHP Dashboard (Port 3181 → 8081)
- freegamesapi-phase1  → Free Games Microservice (Port 3016 intern)

## Workflow

git status --short

node --check commands/index.js
node --check index.js
node --check services/botAPI.js
git diff --check

## Nächste Aufgaben

Priorität 1 — Temp Voice Persistenz prüfen:

- VoiceChannelCleanup nach Bot-Neustart testen: werden verwaiste Channels korrekt gelöscht?

Priorität 2 — Dashboard UX:

- weniger Reloads (mehr AJAX/partial updates)
- Setup Assistent für neue Server (Schritt für Schritt: Welcome → Mod → AutoMod)

Priorität 3 — Logging Dashboard:

- logging.php: Anzeige der letzten Log-Events im Dashboard (aktuell nur Konfiguration)

## Ziel

Fahrstuhl soll:

- wie MEE6 funktionieren
- vollständig über Dashboard steuerbar sein
- stabil und production-ready sein