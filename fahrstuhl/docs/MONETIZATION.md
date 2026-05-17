# Monetization System (Fahrstuhl + EselTokens)

## 1. Ueberblick

Dieses Dokument beschreibt das aktuelle Monetization-System rund um Fahrstuhl und die gekoppelte EselTokens-Instanz.

Monetization-Bereiche:

- Premium (User-basiert: basic/pro)
- Guild Premium (Server-Level ueber Owner-Premium)
- Promos (Premium- oder Shield-Codes)
- Votes (top.gg Vote-Erfassung + Rewards)
- Shields (Fahrstuhl-internes Reward-/Protection-Modell)
- Voice Rewards (Voice-Zeit -> Token-Rewards)
- EselTokens-Integration (Token-Ledger + Reward-Claims)

## 2. Architektur

### 2.1 Dashboard PHP

- Stellt Admin- und User-Seiten bereit.
- Nutzt serverseitig API-Wrapper getAPI/api zur Kommunikation mit der Fahrstuhl-Bot-API.
- Enthaltene Guild-Premium-Bridge: [fahrstuhl/dashboard/public/pages/guild-premium-api.php](fahrstuhl/dashboard/public/pages/guild-premium-api.php)

### 2.2 Fahrstuhl botAPI.js

- Zentrale Backend-API fuer Premium, Monetization und Votes.
- Premium-Routen unter /premium/* und Serverstatus unter /guilds/:guildId/premium.
- Monetization-Routen unter /monetization/*.
- Datei: [fahrstuhl/services/botAPI.js](fahrstuhl/services/botAPI.js)

### 2.3 premiumManager / premiumDatabase

- premiumManager kapselt Premium-Funktionen fuer Aktivierung, Deaktivierung, Checks.
- premiumDatabase persistiert User-Premium in SQLite (premium_users).
- Dateien:
	- [fahrstuhl/utils/premiumManager.js](fahrstuhl/utils/premiumManager.js)
	- [fahrstuhl/utils/premiumDatabase.js](fahrstuhl/utils/premiumDatabase.js)

### 2.4 monetizationStore (JSON)

- File-basierter Store fuer Revenue, Promo-Codes, Votes, Reminder.
- Datei: [fahrstuhl/utils/monetizationStore.js](fahrstuhl/utils/monetizationStore.js)

### 2.5 VoiceRewardBridge

- Liest Voice-Sessions aus MySQL (voice_channel_sessions), berechnet Token-Rewards, sendet POST an EselTokens-Integration.
- Datei: [fahrstuhl/utils/voiceRewardBridge.js](fahrstuhl/utils/voiceRewardBridge.js)

### 2.6 EselTokens API

- Token-Reward-Endpunkte (daily, vote, starter, redeem etc.).
- Integrations-Endpunkt fuer Fahrstuhl Voice-Rewards.
- Dateien (Auszug):
	- [eseltokens/src/pages/api/tokens/daily.js](eseltokens/src/pages/api/tokens/daily.js)
	- [eseltokens/src/pages/api/tokens/vote.js](eseltokens/src/pages/api/tokens/vote.js)
	- [eseltokens/src/pages/api/tokens/redeem.js](eseltokens/src/pages/api/tokens/redeem.js)
	- [eseltokens/src/pages/api/rewards/status.js](eseltokens/src/pages/api/rewards/status.js)
	- [eseltokens/src/pages/api/integrations/fahrstuhl/voice-reward.js](eseltokens/src/pages/api/integrations/fahrstuhl/voice-reward.js)

### 2.7 Datenfluss zwischen den Systemen

1. Dashboard (PHP) ruft Fahrstuhl botAPI via serverseitigem API-Token auf.
2. botAPI schreibt/liest Premium-Status in SQLite ueber premiumManager.
3. botAPI schreibt/liest Monetization-Events im JSON-Store (monetizationStore).
4. VoiceRewardBridge verarbeitet Voice-Sessions (MySQL) und sendet Rewards an EselTokens.
5. EselTokens verbucht Token-Transaktionen im SQLite-Ledger.

## 3. Datenhaltung

| Bereich | Speicherort | Datei/Tabelle | Zweck | Risiko | Source of Truth |
|---|---|---|---|---|---|
| Premium User | SQLite (Fahrstuhl) | premium.db / premium_users | Premium aktiv, Tier, Ablaufdatum | Mittel (separate DB neben anderen Stores) | premium_users |
| Guild Premium Status | Abgeleitet | Guild owner + premium_users | Server-Plan aus Owner-Premium abgeleitet | Mittel (Owner-Wechsel/Abhaengigkeit) | premium_users + Discord ownerId |
| Revenue | JSON (Fahrstuhl) | data/monetization.json -> revenue[] | Umsatz-Eintraege/Reporting | Hoch (kein DB-Locking, Race Conditions) | monetization.json |
| Promo-Codes | JSON (Fahrstuhl) | data/monetization.json -> promoCodes[] | Promo-Erstellung/Verwaltung/Einloesung | Hoch (kein Locking, Pending-Zustaende) | monetization.json |
| Votes (Shields) | JSON (Fahrstuhl) | data/monetization.json -> votes[] | Vote-Historie + Shield-Reward-Statistik | Mittel | monetization.json |
| Reminder | JSON (Fahrstuhl) | data/monetization.json -> reminders[] | Versand-/Fehlerhistorie fuer Reminder | Mittel | monetization.json |
| Shields/User-Stats | Konfig-/Stats-Layer | user stats store (getUserStats/setUserStats) | Shields vergeben/verbrauchte Schutzzeit | Mittel (separate Persistenzschicht) | User stats store |
| Voice Sessions | MySQL (Fahrstuhl) | voice_channel_sessions | Dauer, Reward-Felder, Reward-Fehler | Mittel | voice_channel_sessions |
| Token-Ledger | SQLite (EselTokens) | users, transactions, reward_state, voice_reward_claims | Token-Balance, Reward-Cooldowns, Claims | Mittel (Systemgrenze zwischen Projekten) | EselTokens DB |

## 4. API-Routen

Hinweis: Schreiboperationen sind markiert. Auth bezieht sich auf den jeweils sichtbaren Guard im Code.

### 4.1 Fahrstuhl botAPI: /premium/*

| Route | Methode | Zweck | Auth | Schreibt Daten |
|---|---|---|---|---|
| /premium/activate | POST | Premium aktivieren (basic/pro) | Bearer BOT_API_TOKEN | Ja |
| /premium/deactivate | POST | Premium deaktivieren | Bearer BOT_API_TOKEN | Ja |
| /premium/users | GET | Liste aktiver Premium-User | Bearer BOT_API_TOKEN | Nein |
| /premium/user/:userId | GET | Premium-Status fuer User | Bearer BOT_API_TOKEN | Nein |
| /premium/calendar | GET | Ablaufkalender | Bearer BOT_API_TOKEN | Nein |
| /premium/reminders/send | POST | Reminder versenden + Reminder-Log | Bearer BOT_API_TOKEN | Ja |

### 4.2 Fahrstuhl botAPI: /monetization/*

| Route | Methode | Zweck | Auth | Schreibt Daten |
|---|---|---|---|---|
| /monetization/revenue | GET | Revenue-Liste + Summary | Bearer BOT_API_TOKEN | Nein |
| /monetization/revenue | POST | Revenue-Eintrag anlegen | Bearer BOT_API_TOKEN | Ja |
| /monetization/revenue/delete | POST | Revenue-Eintrag loeschen | Bearer BOT_API_TOKEN | Ja |
| /monetization/promos | GET | Promo-Liste | Bearer BOT_API_TOKEN | Nein |
| /monetization/promos/health | GET | Pending/Stale Redemption Health | Bearer BOT_API_TOKEN | Nein |
| /monetization/promos/create | POST | Promo anlegen | Bearer BOT_API_TOKEN | Ja |
| /monetization/promos/toggle | POST | Promo aktiv/inaktiv | Bearer BOT_API_TOKEN | Ja |
| /monetization/promos/redeem | POST | Promo einloesen (Premium oder Shields) | Bearer BOT_API_TOKEN | Ja |
| /monetization/votes | GET | Vote-Liste + Summary | Bearer BOT_API_TOKEN | Nein |

### 4.3 Guild-Premium API-Seiten (Dashboard PHP)

| Seite/Endpoint | Methode | Zweck | Auth | Schreibt Daten |
|---|---|---|---|---|
| guild-premium-api.php?action=lookup | GET | Guild + Owner Premium anzeigen | requireAdmin | Nein |
| guild-premium-api.php?action=list | GET | Aktive Guild-Premium-Grant-Liste | requireAdmin | Nein |
| guild-premium-api.php?action=activate | POST | Owner-Premium aktivieren | requireAdmin + CSRF | Ja |
| guild-premium-api.php?action=extend | POST | Owner-Premium verlaengern | requireAdmin + CSRF | Ja |
| guild-premium-api.php?action=deactivate | POST | Owner-Premium deaktivieren | requireAdmin + CSRF | Ja |

### 4.4 EselTokens Token/Reward-Routen (Auszug)

| Route | Methode | Zweck | Auth | Schreibt Daten |
|---|---|---|---|---|
| /api/tokens/daily | POST | Daily-Token-Claim | Session/Role | Ja |
| /api/tokens/vote | POST | Vote-Token-Claim via top.gg Check | Session/Role | Ja |
| /api/tokens/redeem | POST | Tokens -> XP einloesen | Session/Role | Ja |
| /api/tokens/starter-pack | POST | Starter-Paket claimen | Session/Role | Ja |
| /api/rewards/status | GET | Reward-Status (daily/vote/starter) | Session/Role | Nein |
| /api/integrations/fahrstuhl/voice-reward | POST | Voice-Reward von Fahrstuhl verbuchen | Bearer Integration Secret | Ja |

## 5. Workflows

### 5.1 Admin vergibt Premium

1. Admin startet Aktion im Dashboard (Premium/Guild-Premium).
2. PHP-Seite ruft /premium/activate via botAPI auf.
3. premiumManager -> premiumDatabase schreibt/aktualisiert premium_users.
4. botAPI liefert Ergebnis zurueck und loggt Aktivierung.

### 5.2 Premium laeuft ab

1. Premium-Check liest expires_at.
2. Bei Ablauf wird User nicht mehr als premium/pro behandelt.
3. /premium/calendar zeigt Resttage/expiring/expired an.
4. Optional kann /premium/reminders/send Reminder schreiben/versenden.

### 5.3 Promo-Code wird eingeloest

1. botAPI validiert Code + User.
2. reservePromoRedemption setzt pending-Redemption im JSON-Store.
3. Apply-Phase:
	 - Premium-Promo: activatePremium
	 - Shield-Promo: setUserStats Shields +x
4. Erfolg: completePromoRedemption
5. Fehler: cancelPromoRedemption

### 5.3.1 Pending Promo Redemptions

- Pending Redemptions bleiben im JSON-Store als `pending: true` markiert, bis der Apply-Schritt abgeschlossen ist.
- Eine Redemption gilt als stale, wenn `pending === true` und `redeemedAt` aelter als 15 Minuten ist.
- TTL-Konstante im Store: `STALE_PENDING_REDEMPTION_MS = 15 * 60 * 1000`.
- Read-only Health-Route: `/monetization/promos/health`.
- Die Monetization-Health-Seite zeigt stale pending Redemptions nur an.
- Es wird nichts automatisch geloescht oder recovered.
- Recovery bleibt ein separates spaeteres Thema.

### 5.4 Vote wird gezaehlt

Variante A (Fahrstuhl/top.gg webhook):
- /topgg/webhook erfasst upvote, vergibt Shields, schreibt Vote in monetizationStore.

Variante B (EselTokens Vote Claim):
- /api/tokens/vote prueft top.gg Check-API und Cooldown, vergibt Tokens, schreibt transaction + reward_state.

### 5.5 Shield wird vergeben

1. Durch top.gg webhook oder Promo-Reedeem (shields).
2. Speicherung ueber getUserStats/setUserStats (Fahrstuhl).
3. Shields sind von Token-Ledger getrennt.

### 5.6 Voice Reward wird an EselTokens gesendet

1. VoiceRewardBridge liest aktive/beendete voice_channel_sessions.
2. Berechnet zu vergebende Tokens (min session, ratio, cap ueber Zielsystem).
3. POST an EselTokens /api/integrations/fahrstuhl/voice-reward.
4. Erfolg/Fail wird in voice_channel_sessions (reward_tokens, rewarded_at, reward_error) dokumentiert.

## 6. Bekannte Risiken

- JSON-Store bleibt filebasiert
	- prozesslokales Write-Locking reduziert Kollisionen, ersetzt aber keine transaktionale Datenbank.
- Pending-Promo-Redemptions koennen haengen bleiben
	- wenn Prozess zwischen reserve und complete ausfaellt.
- Mehrere Datenquellen
	- Premium (SQLite), Monetization (JSON), Voice (MySQL), Tokens (EselTokens SQLite).
- Fehlende einheitliche Audit-Historie
	- Actions sind verteilt in Logs/Stores ohne zentrales, konsistentes Audit-Schema.
- Moegliche Race Conditions
	- insbesondere Promo maxUses, parallel redeem, reminder runs.

## 7. Empfohlene spaetere Fixes (Phase 3)

1. Promo-Redeem-Locking oder DB-Migration
	 - Promo-Code- und Redemption-Flow in transaktionales DB-Modell migrieren.
2. Pending-Recovery-Job
	 - regelmaessiger Worker, der alte pending Redemptions erkennt und sauber reconciled.
3. Audit-Log fuer Monetization-Aktionen
	 - zentrales Audit-Event-Schema fuer activate/deactivate/redeem/toggle/revenue/vote.
4. Read-only Admin-Statusseite fuer Promo/Premium-Health
	 - pending counts, stale pending, redemption failures, reminder failures, expiring premium.
5. Tests fuer Premium/Votes/Promos
	 - Unit + Integrations-Tests fuer Contract, Cooldowns, idempotency, error handling.

## 8. Betriebs-Checkliste (Read-only)

### 8.1 Regelmaessige Read-only Checks

- Git/Release-Stand:
	- Worktree sauber, erwarteter Commit auf origin/main.
- Dashboard-Seiten-Health (nur GET/HEAD):
	- premium.php, premium-hub.php, users.php, rewards-hub.php, monetization.php, redeem.php, server-plans.php.
- API-Health (nur GET):
	- /premium/users, /premium/calendar, /monetization/revenue, /monetization/promos, /monetization/votes.
- Container-Health:
	- dashboard-php und fahrstuhl (running/healthy).

### 8.2 Logs, die geprueft werden sollten

- dashboard-php logs:
	- PHP Fatal, uncaught errors, 500 responses.
- fahrstuhl logs:
	- PREMIUM_* failures, PROMO_* failures, top.gg webhook errors.
- VoiceRewardBridge:
	- delivery failed, reward rejected, repeated permanent errors.
- EselTokens integration logs:
	- unauthorized, invalid sessionId/discordId, daily-cap anomalies.

### 8.3 Daten, die nie manuell geaendert werden sollten

- Fahrstuhl monetization.json (revenue/promo/votes/reminders) im laufenden Betrieb.
- Fahrstuhl premium.db (premium_users) ohne abgestimmte Migration/Tooling.
- Voice reward Felder in voice_channel_sessions ohne Ursachenanalyse.
- EselTokens Ledger-Tabellen (users.balance, transactions, reward_state, voice_reward_claims) ohne kontrolliertes Recovery-Verfahren.

---

Stand: Phase 2 Dokumentation (read-only Analyse, keine produktiven Schreibaktionen).
