# Notfall-Handbuch eselbande.com

Stand: 30.08.2026

Dieses Dokument beantwortet zwei Fragen: **Was läuft wo?** und **Was tue ich, wenn
etwas kaputt ist?** Es liegt bewusst an zwei Orten — im Repo und auf dem Raspberry
Pi (`/home/marvin/NOTFALL.md`) — damit es auch dann noch lesbar ist, wenn der
Server nicht mehr da ist.

---

## 1. Die beiden Rechner

| | Server | Raspberry Pi |
|---|---|---|
| **Name** | laptop | eselbande-pi |
| **IP** | 192.168.2.177 (LAN, fest) | 192.168.2.90 (LAN, fest) |
| **Ausweich-IP** | 192.168.2.178 (WLAN) | 192.168.2.100 (WLAN) |
| **System** | Ubuntu 24.04 | Raspberry Pi OS (Debian 13) |
| **Datenträger** | eMMC-Karte, ~56 GB | USB-Stick, ~56 GB |
| **Aufgabe** | Alle Dienste (21 Container) | Überwachung, Backups, Ausweichsysteme |

**Zugang:** SSH nur aus dem Heimnetz oder über WireGuard. Die öffentliche
SSH-Freigabe wurde am 30.08. entfernt.

```bash
ssh root@192.168.2.177      # Server
ssh marvin@192.168.2.90     # Pi
```

Von unterwegs: erst WireGuard einschalten (`vpn.eselbande.com:51820`), dann
funktionieren beide Adressen wie zu Hause.

---

## 2. Wie die Website ins Internet kommt

**Wichtig zu verstehen:** Es gibt **keine Portfreigabe für die Website**. Der
Server baut über `cloudflared` eine Verbindung von innen nach außen zu Cloudflare
auf (ein sogenannter Tunnel). Cloudflare nimmt die Besucher entgegen und schickt
sie durch diesen Tunnel.

Daraus folgt zweierlei:

- Eure öffentliche IP ist **egal**. Wechselt sie, passiert nichts.
- Stirbt der Tunnel, ist alles offline — auch wenn der Server läuft.

Alle Domains (`eselbande.com` und sämtliche Unterdomains) zeigen als CNAME auf
`9d72043a-fd7b-4022-b9aa-b24bf16a4af8.cfargotunnel.com`.

**Ausnahme:** `vpn.eselbande.com` ist ein A-Eintrag ohne Cloudflare-Proxy und
zeigt direkt auf die Heim-IP. Das muss so sein, weil WireGuard UDP nutzt und
Cloudflare das nicht weiterleitet. Ein Cronjob hält den Eintrag aktuell.

---

## 3. Was von allein passiert

### Auf dem Server

| Was | Wann | Zweck |
|---|---|---|
| `infra-backup` | täglich 04:00 | Sichert nginx, netplan, TLS-Zertifikate, Cronjobs, systemd, docker-compose |
| `bot-gateway` | alle 3 Min | Prüft, ob die Bots wirklich mit Discord verbunden sind. Startet sie sonst neu |
| `storage-check` | stündlich | Warnt vor Verschleiß und Lesefehlern der eMMC |
| `ssh-audit` | alle 10 Min | Meldet erfolgreiche SSH-Anmeldungen von außerhalb des Heimnetzes |
| `bot-report-check` | alle 30 Min | Meldet, wenn der Bot von einem Server entfernt wird |
| `bot-report-weekly` | montags 09:00 | Wochenbericht zur Bot-Nutzung |
| Musikbot-Neustart | täglich 04:00 | Cronjob, räumt Speicherdruck auf |
| Statistik-Sammler | alle 5 Min | `eselbande-stats-collect.py` |
| VPN-DNS | alle 5 Min | Hält `vpn.eselbande.com` auf der aktuellen IP |

### Auf dem Pi

| Was | Wann | Zweck |
|---|---|---|
| `eselbande-watchdog` | alle 2 Min | Prüft Server und 7 Dienste von außen. Weckt den Server per Wake-on-LAN, schaltet die Wartungsseite ein |
| `eselbande-backup-pull` | täglich 05:00 | Holt die Backups vom Server (~14 GB) |
| `restore-probe` | monatlich | Prüft, ob sich die gesicherten Datenbanken wirklich öffnen lassen |
| `netcheck` | Dauerbetrieb | Protokolliert Störungen von Router, Internet und DNS |
| `lavalink` | Dauerbetrieb | Zweiter Audio-Knoten für den Musikbot |
| `wg-quick@wg0` | Dauerbetrieb | WireGuard-VPN |
| `cloudflared-wartung` | **nur bei Ausfall** | Ausweich-Tunnel mit Wartungsseite |

**Alle Meldungen gehen in denselben Discord-Kanal.** Kommt dort nichts, ist
entweder alles in Ordnung — oder beide Rechner sind aus.

---

## 4. Wenn etwas kaputt ist

### Die Website ist offline

1. **Kommt eine Wartungsseite?** Dann ist der Server weg, der Pi hat übernommen.
   Weiter bei „Server antwortet nicht".
2. **Kommt ein Cloudflare-Fehler (1033 o.ä.)?** Der Tunnel ist tot:
   ```bash
   ssh root@192.168.2.177 "systemctl status cloudflared; systemctl restart cloudflared"
   ```
3. **Kommt eine nginx-Fehlerseite?** Der Tunnel steht, ein Dienst ist kaputt:
   ```bash
   ssh root@192.168.2.177 "docker ps -a | grep -v Up"
   ```

### Server antwortet nicht

1. Der Pi versucht ihn bereits per Wake-on-LAN zu starten (15 Versuche über
   30 Minuten). Kurz abwarten.
2. Hilft das nicht: **Stromkabel prüfen.** Der Laptop hat keinen Akku — jede
   Unterbrechung reißt ihn sofort runter. Genau das war die Ursache am 30.08.
3. Vor Ort: einschalten. Docker startet alle Container von selbst.

### Ein Bot ist in Discord offline

Passiert von allein nichts binnen 6 Minuten, dann:
```bash
ssh root@192.168.2.177 "curl -s http://127.0.0.1:3102/health | head -c 300"   # Fahrstuhl
ssh root@192.168.2.177 "curl -s http://127.0.0.1:3020/health | head -c 300"   # EselMusic
```
Steht dort `"bereit": false`, hilft ein Neustart:
```bash
ssh root@192.168.2.177 "docker restart fahrstuhl-phase1"
```

### Der Musikbot spielt nicht

Meist ist ein Lavalink-Knoten weg. Der Bot prüft sich alle 30 Sekunden selbst
und repariert das normalerweise. Zustand ansehen:
```bash
ssh root@192.168.2.177 "docker logs --tail 30 musikbot-docker-phase1 | grep -i node"
```
Beide Knoten prüfen:
```bash
ssh root@192.168.2.177 "curl -s -H 'Authorization: PASSWORT' http://127.0.0.1:3233/v4/stats"        # Server
ssh root@192.168.2.177 "curl -s -H 'Authorization: PASSWORT' http://192.168.2.90:2333/v4/stats"     # Pi
```
Das Passwort steht in `/home/marvin/musikbot/application.yml`.

### Platte voll

```bash
ssh root@192.168.2.177 "df -h /; docker system df"
docker builder prune -f      # Zwischenspeicher, gefahrlos
docker image prune -f        # verwaiste Images, gefahrlos
```

---

## 5. Totalverlust: Server neu aufbauen

Voraussetzung: Der Pi lebt und hat die Backups.

**1. Grundsystem installieren** — Ubuntu Server, Docker, nginx, certbot,
cloudflared. Nutzer `marvin` anlegen.

**2. Konfiguration zurückholen** (liegt auf dem Pi):
```bash
ls /home/marvin/backups-server/_infra/           # neueste Sicherung wählen
tar -xzf infra-JJJJMMTT-HHMMSS.tar.gz
```
Enthält: `compose/` (docker-compose.yml und .env), `nginx/`, `netz/` (netplan),
`tls/` (Let's Encrypt), `cron/`, `systemd/` und `SYSTEM.txt` mit der
Systembeschreibung.

**3. Daten zurückholen:**
```bash
rsync -a /home/marvin/backups-server/JJJJMMTT-HHMMSS/ /home/marvin/
```
Struktur: `env/` (die .env-Dateien je Dienst), dazu Datenordner der Dienste.

**4. Cloudflare-Tunnel:** Zugangsdatei nach `/root/.cloudflared/` legen (liegt
auch auf dem Pi unter `/etc/cloudflared/`), `config.yml` aus der Sicherung.

**5. Starten:**
```bash
cd /home/marvin/fahrstuhl && docker compose up -d
```

**6. Prüfen:** Alle Container `healthy`? Website erreichbar? Bots in Discord
online? Wartungsseite auf dem Pi wieder aus?

### Pi neu aufbauen

Weniger dringend — es geht nichts verloren, nur die Überwachung fehlt. Die
Skripte liegen alle in `/home/marvin/` auf dem Pi und sollten mitgesichert
werden. **Achtung:** Der Pi bootet von einem USB-Stick, nicht von SD-Karte.

---

## 6. Zugänge

| Was | Wo |
|---|---|
| SSH-Schlüssel | `~/.ssh/eselbande_deploy` (Arbeitsrechner) |
| WireGuard-Profil | `/etc/wireguard/clients/marvin.conf` auf dem Pi |
| Lavalink-Passwort | `/home/marvin/musikbot/application.yml` |
| Discord-Bot-Token | `/home/marvin/fahrstuhl/.env`, `/home/marvin/musikbot/.env` |
| Cloudflare-API-Token | `/usr/local/bin/cloudflare-ddns.sh` |
| Router | speedport.ip |
| Backup-Zugang Pi→Server | Nur lesendes rsync, in `/root/.ssh/authorized_keys` |

---

## 7. Bekannte Schwachstellen

**Der Laptop hat keinen Akku.** Jede Stromunterbrechung ist ein harter Absturz.
Eine kleine USV (~40 €) würde das beheben.

**Die eMMC verschleißt.** Karte von 07/2020, 2409 GB geschrieben, der
SLC-Bereich hat seine geschätzte Lebensdauer bereits überschritten. Reserveblöcke
sind noch unangetastet, akut ist es also nicht — aber ein Wechsel auf SSD sollte
eingeplant werden. `storage-check` warnt, sobald sich das verschlechtert.

**Beide Backup-Kopien stehen in derselben Wohnung.** Bei Brand, Diebstahl oder
Blitzschlag sind beide weg. Eine verschlüsselte Kopie bei einem Anbieter würde
das schließen.

**Der Pi hängt an einem USB-Stick.** Die sind weniger haltbar als SD-Karten oder
SSDs. Wenn er ausfällt: Backups und Überwachung weg, die Dienste laufen weiter.

**Alte Bots stillgelegt (2026-09-11).** `musikbot-docker-phase1`,
`eselmoderator-phase1`, `eselmoderator-dashboard-phase1` und `eselbuilder-bot`
sind per `docker stop` deaktiviert (NICHT gelöscht — `docker start
<name>` bringt sie im Notfall sofort zurück). Nur noch zwei Bots aktiv:
`fahrstuhl-phase1` und `eselbande-bot-phase1`. Vorher komplette
Legacy-Datenübernahme gefahren (`scripts/migrate-legacy-data.ts` in
`eselbande-bot`, siehe dessen README Abschnitt 4 #3) — alle Song-Stats,
Mod-Cases, Tickets (18) und Server-Backups (11, inkl. Sections) sind jetzt in
der neuen `eselbande`-Schema-DB. `eselbande-bot-phase1`s Speicherlimit wurde
dafür dauerhaft von 512m auf 1024m erhöht (Host hat 9GB+ frei, kein Problem).
**Nicht migriert (bewusst, siehe Skript-Kommentar):** `AiSound`/`SoundUser` —
für `/sound` gibt es keine Vorgängerdaten. **Weiterhin ungetestet in echtem
Gebrauch:** `/sound`, `/aisounds`, `/ticket`, `/serverbackup`, TempVoice — die
alten Bots liefen bislang als Fallback, jetzt nicht mehr. Landingpage
entsprechend aktualisiert (kein "Testbetrieb" mehr, EselMusic/Eselbuilder-
Karten durch eine gemeinsame "EselBande-Bot"-Karte ersetzt).

~~`docker compose up` auf `fahrstuhl/docker-compose.yml` legt `marvin_internal`
neu an`~~ **BEHOBEN (2026-09-11).** Root Cause gefunden: Die Netzwerk-Definition
in der Compose-Datei hatte nur `name: marvin_internal`, ohne `external: true`
— Compose versuchte deshalb bei jedem Lauf, die Live-Netzwerk-Config gegen
einen gespeicherten `com.docker.compose.config-hash`-Label abzugleichen, und
bei einer Diskrepanz (vermutlich durch die Compose-Versionshistorie auf
diesem Server) landete das immer bei "Netzwerk entfernen + neu anlegen".
**Fix:** `networks.marvin_internal.external: true` in
`fahrstuhl/docker-compose.yml` ergänzt (Backup davor als
`docker-compose.yml.bak-external-network-fix-<timestamp>` im selben Ordner).
Damit fasst Compose die Netzwerk-Lifecycle nie mehr an. Verifiziert per
`--dry-run` auf mehreren Services (kein "Network ... Removing/Creating" mehr)
und durch einen echten `docker compose up -d` auf `admin-dashboard`,
`eseltokens-docker` — Container-Zahl am Netzwerk vorher/nachher identisch (25).
**`docker compose up -d <service>` auf dieser Datei ist ab jetzt wieder
gefahrlos möglich** — der `--dry-run`-Vorbehalt aus den älteren Abschnitten
dieses Dokuments gilt nicht mehr für das Netzwerk selbst (siehe aber unten,
separates kleineres Problem).

**Neu entdecktes, kleineres Folgeproblem (2026-09-11):** `musikbot-docker-phase1`
und `fahrstuhl-docker` werden bei praktisch jedem `docker compose up` — auch
wenn sie nicht Ziel des Befehls sind — als "Recreate" markiert (vermutlich
derselbe Grundmechanismus wie beim Netzwerk, aber auf Service- statt
Netzwerk-Ebene: Config-Hash-Drift). Folgen bisher beobachtet: `musikbot` blieb
nach einem Recreate im Status "Created" statt zu starten (Musikbot kurzzeitig
offline, durch `docker start musikbot-docker-phase1` behoben) und `shop`
konnte wegen einer widersprüchlichen `depends_on: fahrstuhl-docker`-Bedingung
(fehlender Healthcheck auf `fahrstuhl-docker`) nicht sauber über Compose neu
erstellt werden (`shop` läuft deshalb weiterhin manuell erstellt, nicht
Compose-getrackt). **Deutlich kleineres Risiko als der Netzwerk-Bug** (betrifft
nur einzelne Container, nicht das gesamte Netzwerk), aber noch nicht
behoben — braucht eine eigene Untersuchung (vermutlich hilft ein
Healthcheck-Block für `fahrstuhl-docker` sowie derselbe Config-Hash-Ansatz
wie beim Netzwerk).

~~Fahrstuhl-Bot vergibt keine EselTokens für Voice-Zeit~~ **BEHOBEN
(2026-09-11).** War `ESELTOKENS_VOICE_REWARD_URL` in `fahrstuhl/.env`, die auf
`http://127.0.0.1:3000/...` zeigte (im `fahrstuhl-phase1`-Container also auf
sich selbst statt auf `eseltokens-phase1`). Fix in der `.env` eingetragen
(`http://eseltokens-docker:3000/eseltokens/api/integrations/fahrstuhl/voice-reward/`),
`fahrstuhl-docker` per manuellem `docker stop`+`rm`+`docker compose up -d`
neu erstellt (Compose-eigener Auto-Remove griff wegen des oben beschriebenen
Recreate-Problems nicht, deshalb der Umweg). Verifiziert per direktem
Connectivity-Test aus dem Container (`ESELTOKENS_VOICE_REWARD_SECRET`
korrekt, Endpoint antwortet mit erwarteter Validierung statt `fetch failed`).
Läuft seither stabil, `RestartCount=0`.

**EselWorld: Auto-Deploy per GitHub-Webhook + Discord-DM (seit 2026-09-09).**
`Marvin4200/eselworld`, Branch `main` → Push löst automatisch
`git pull` + `docker compose up -d --build` in `/home/marvin/eselworld` aus.
Läuft als eigenständiger systemd-Service `eselworld-deploy-webhook`
(`/home/marvin/eselworld/deploy-webhook.py`, Python, NICHT in Docker — bewusst,
damit ein Rebuild dieses Webhooks selbst nie `docker compose` auf einer der
gemeinsamen Compose-Dateien anfasst). Public Endpoint:
`https://world.eselbande.com/_deploy-webhook` (nginx proxied zu
`127.0.0.1:9151`), HMAC-Secret in `/home/marvin/eselworld/deploy-webhook.env`
(`ESELWORLD_DEPLOY_SECRET`, im GitHub-Repo unter Settings → Webhooks
hinterlegt). Start-/Erfolgs-/Fehler-Meldungen kommen als **private Discord-DM**
an Marvin (User-ID `740958995887685696`), nicht in einen Kanal — nutzt dafür
den vorhandenen `eselbande-bot`-Token (`DISCORD_BOT_TOKEN` in derselben
`.env`). Wichtiger Stolperstein: Discords API blockt Requests ohne
`User-Agent`-Header mit Cloudflare-Fehler 1010 — der Header ist im Script
gesetzt, falls das Script mal neu geschrieben wird, daran denken.
Service-Status prüfen: `systemctl status eselworld-deploy-webhook`,
Logs: `journalctl -u eselworld-deploy-webhook -f`.

---

## 8. Wenn eine Meldung kommt, die du nicht einordnen kannst

Alle Wächter schreiben Protokolle mit:

| Wächter | Protokoll |
|---|---|
| Watchdog | Pi: `/home/marvin/watchdog/watchdog.log` |
| Netz-Störungen | Pi: `/home/marvin/netlog/events.csv` |
| Wiederherstellungsprobe | Pi: `/home/marvin/restore-probe/probe.log` |
| Backup-Abgleich | Pi: `/home/marvin/backup-pull.log` |
| Bot-Verbindung | Server: `/home/marvin/bot-gateway/gateway.log` |
| Speicher | Server: `/home/marvin/storage-check/storage.log` |
| SSH | Server: `/home/marvin/ssh-audit/audit.log` |

Laufende Fehler aller Dienste: **admin.eselbande.com**
