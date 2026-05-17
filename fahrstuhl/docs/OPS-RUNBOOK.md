# Fahrstuhl Ops Runbook

## Nginx warnings cleanup

Nginx loads every file in `/etc/nginx/sites-enabled/*`. Backup files in that folder can therefore become active configs and cause `conflicting server name` warnings.

Run this on the server:

```bash
cd /home/marvin/fahrstuhl
bash scripts/cleanup-nginx-site-backups.sh
```

The script moves backup-like files to `/root/nginx-config-backups/<timestamp>/`, runs `nginx -t`, and reloads nginx only after the config test passes.

## PM2 naming

The main bot process is named `fahrstuhl`. Do not start a second `fahrstuhl-bot` process. Use:

```bash
pm2 restart fahrstuhl --update-env
pm2 save
```

## Ops alerts

The bot posts warnings to the log channels when health checks, PM2, backup verification, or nginx config checks report problems.

Useful env switches:

```bash
OPS_ALERTS_ENABLED=true
OPS_ALERT_INTERVAL_MS=300000
OPS_ALERT_COOLDOWN_MS=1800000
OPS_ALERT_STARTUP_DELAY_MS=90000
```

## Whole-server backups

Whole-server backups are created by `scripts/backup-all.js` and scheduled by PM2 process `backup-worker`.

Retention policy is automatic:

- Keep all snapshots for last 24h (hourly)
- Keep one snapshot per day for next 14d
- Keep one snapshot per week for next 8w

### One-time manual backup

```bash
cd /home/marvin/fahrstuhl
node scripts/backup-all.js
node scripts/backup-all.js --status
```

Main status file:

```bash
/home/marvin/backups/backup-status.json
```

Each snapshot contains:

- `manifest.json` (copied items)
- `verification.json` (post-copy validation)
- service data (`fahrstuhl`, `eseltokens`, `filehoster`, `linkshortener`, `zitatboard`, `statuspage`)
- optional Redis persistence files
- PM2 dump/ecosystem files
- copied `.env` files

### PM2 scheduling

```bash
cd /home/marvin/fahrstuhl
pm2 restart backup-worker --update-env
pm2 logs backup-worker --lines 100
pm2 save
```

### API checks

```bash
curl -s http://127.0.0.1:3002/backup/system/status
curl -s http://127.0.0.1:3002/health/summary
```

### Restore drill (recommended monthly)

1. Create a fresh backup snapshot.
2. Restore into a staging path or staging VM first.
3. Validate app boot and data integrity.
4. Only then run production restore.

Automated snapshot restore validation (copies latest snapshot into temp dir and validates manifest paths):

```bash
cd /home/marvin/fahrstuhl
node scripts/restore-test.js
```

Database/files restore for Fahrstuhl core:

```bash
cd /home/marvin/fahrstuhl
node scripts/restore-backup.js --mode full --sql <mysql_dump.sql> --files <files_archive.tar.gz> --restart false
```

For whole-server snapshots, restore service data by copying the selected snapshot subfolders back to their service paths while services are stopped (`pm2 stop ...`), then start and validate:

```bash
pm2 stop all
# restore files from /home/marvin/backups/<snapshot>/...
pm2 start ecosystem.config.js
pm2 save
```

---

## EselMusic (Musikbot) — Lavalink Recovery

### Symptome

- EselMusic joined einen Voice-Channel und verlässt ihn sofort wieder, im Minuten-Takt
- Logs zeigen `Connection Destroyed` ohne eine vorherige `Connected`-Meldung von Shoukaku
- `/play` schlägt fehl mit `Can't find any nodes to connect on`

### Ursache

Lavalink akkumuliert nach einem Neustart/Rebuild des `musikbot-docker`-Containers TCP-Verbindungen im `CLOSE_WAIT`-Zustand (alte Container-IP, neue Container-IP). Wenn genug Verbindungen in diesem Zustand sind, akzeptiert der Lavalink-Java-Prozess keine neuen WebSocket-Verbindungen mehr — ohne selbst abzustürzen. Der Container bleibt `Up`, aber Shoukaku kann nicht connecten.

### Diagnose

```bash
# Shoukaku-Log prüfen: gibt es "Connected"? Oder nur "Connecting"?
docker logs --since 30m musikbot-docker-phase1 2>&1 | grep -Ei 'shoukaku|connected|destroyed|error'

# Lavalink-Log prüfen: Gibt es neue Session-Einträge?
docker logs --since 30m lavalink-docker-phase1 2>&1 | tail -30

# Container-Status
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

Wenn Shoukaku nur `Connecting to ws://lavalink-docker:2333...` zeigt, aber kein `Connected` folgt, ist Lavalink betroffen.

### Fix

**Reihenfolge wichtig:** Erst Lavalink, dann Musikbot — damit Shoukaku beim Start eine saubere Verbindung bekommt.

```bash
# 1. Lavalink neu starten (löscht stale CLOSE_WAIT-Verbindungen)
docker restart lavalink-docker-phase1

# 2. Warten bis Lavalink bereit ist (ca. 15 Sekunden)
sleep 15

# 3. Musikbot neu starten
cd /home/marvin/fahrstuhl && docker compose restart musikbot-docker
```

### Verifikation

```bash
docker logs --since 10m musikbot-docker-phase1 2>&1 | grep -Ei 'Lavalink node|ready|Rejoin attempt|Connection Destroyed|Unknown interaction|DiscordAPIError'
```

Erwartet nach erfolgreichem Fix:
- `✅ Lavalink node "main" connected`
- `Lavalink is ready to communicate !`
- Keine weiteren `Connection Destroyed`-Einträge im Loop
