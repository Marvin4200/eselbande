# Proxmox Migration - Phase 1 (Inventory + Backup + Restore-Test)

Stand: 2026-05-24
Scope: Fahrstuhl stack on current Debian host

## Goal

Phase 1 is complete only if all three blocks are done:

1. Technical inventory is documented (services, ports, env files, volumes, health endpoints).
2. Fresh backup exists and is verified.
3. Restore test was executed and documented.

## A. Quick Inventory (from current compose setup)

Source: `docker-compose.yml`

### Services

- redis
- statuspage
- team
- linkshortener
- esel
- filehoster
- zitatboard
- autodeploy
- deploy-webhook
- lavalink-docker
- musikbot-docker
- backup-worker
- eseltokens-webhook-docker
- freegamesapi
- fahrstuhl-docker
- eseltokens-docker
- dashboard-php

### Host Ports (127.0.0.1 bindings)

- 3112 -> statuspage:3012
- 3114 -> team:3014
- 3110 -> linkshortener:3010
- 3115 -> esel:3015
- 3111 -> filehoster:3011
- 3113 -> zitatboard:3013
- 9111 -> autodeploy:9011
- 9100 -> deploy-webhook:9000
- 3233 -> lavalink:2333
- 3116 -> freegamesapi:3016
- 3102 -> fahrstuhl:3002
- 3100 -> eseltokens:3000
- 3181 -> dashboard-php:8081

### Named Docker Volumes

- redis_data
- statuspage_data
- linkshortener_data
- filehoster_data
- filehoster_uploads
- zitatboard_data

### Important env files to backup

- /home/marvin/fahrstuhl/.env
- /home/marvin/fahrstuhl/.env-dashboard
- /home/marvin/eseltokens/.env.local
- /home/marvin/webhooks/.env
- /home/marvin/team/.env
- /home/marvin/filehoster/.env
- /home/marvin/linkshortener/.env
- /home/marvin/zitatboard/.env
- /home/marvin/musikbot/.env

## B. Run Commands on Debian Host

Run from server console (not local Windows shell):

```bash
cd /home/marvin/fahrstuhl
bash scripts/proxmox-phase1-collect.sh
```

This writes artifacts to:

- /home/marvin/fahrstuhl/docs/phase1-artifacts/<timestamp>/

Expected files:

- inventory-services.txt
- inventory-docker-ps.txt
- inventory-docker-images.txt
- inventory-ports.txt
- inventory-volumes.txt
- inventory-env-files.txt
- inventory-host-resources.txt
- backup-status-before.txt
- backup-run.txt
- backup-status-after.txt
- restore-test.txt

## C. Success Criteria Checklist

Mark complete only if all are true:

- [ ] `inventory-services.txt` exists and lists all active stack services.
- [ ] `inventory-ports.txt` confirms currently used host ports.
- [ ] `inventory-volumes.txt` contains docker volume list and mountpoints.
- [ ] `backup-run.txt` reports successful backup execution.
- [ ] `backup-status-after.txt` shows fresh snapshot timestamp.
- [ ] `restore-test.txt` contains successful restore validation.

## D. If restore test fails

1. Do not continue to Proxmox install.
2. Fix backup integrity first.
3. Re-run:

```bash
cd /home/marvin/fahrstuhl
node scripts/backup-all.js
node scripts/backup-all.js --status
node scripts/restore-test.js
```

## E. Output to share back

Share these 3 files first for review:

- docs/phase1-artifacts/<timestamp>/inventory-host-resources.txt
- docs/phase1-artifacts/<timestamp>/backup-status-after.txt
- docs/phase1-artifacts/<timestamp>/restore-test.txt

After those are green, Phase 1 is done and we can execute Phase 2 (Proxmox install plan).

Phase 2 runbook:

- `docs/PROXMOX_PHASE2_CUTOVER.md`
