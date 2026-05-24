# Proxmox Migration - Phase 2 (Cutover Runbook)

Stand: 2026-05-24
Prerequisite: Phase 1 completed and green

## Objective

Move your current production stack from bare-metal Docker host to Proxmox-managed VM with minimal risk and fast rollback.

## Target architecture

- Host: Proxmox VE on the old laptop
- Guest VM: Debian (single production VM for now)
- Runtime: Docker + Docker Compose
- App root in VM: `/home/marvin`

## Recommended VM sizing

- vCPU: 4
- RAM: 8 GB (minimum 6 GB)
- Disk: 120 GB (thin OK, monitor usage)
- Swap in VM: 4 GB

## Downtime expectation

- Well-prepared cutover: 30-60 minutes
- Include verification buffer: up to 90 minutes

## 1) Pre-cutover checklist (T-24h to T-1h)

- [ ] `backup-all.js --status` is green with `mysqlDump.ok=true`
- [ ] `restore-test.js` green on latest snapshot
- [ ] No recent OOM entries in `dmesg` and `journalctl -k`
- [ ] Current git head and env files documented
- [ ] Domain/proxy update path confirmed (Nginx/cloudflared)
- [ ] Rollback owner and command plan agreed

## 2) Prepare Proxmox host

Run on fresh Proxmox install:

```bash
apt update && apt -y full-upgrade
pveversion -v
```

Create VM (Debian 12), then in VM:

```bash
apt update && apt -y full-upgrade
apt -y install ca-certificates curl gnupg lsb-release git jq rsync
```

Install Docker in VM:

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt update
apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker
```

Create swap in VM (if not already):

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
```

## 3) Data transfer to VM (staging)

From old host, create fresh snapshot first:

```bash
cd /home/marvin/fahrstuhl
node scripts/backup-all.js
node scripts/backup-all.js --status
```

Transfer required directories to VM (example):

```bash
rsync -aHAX --delete /home/marvin/fahrstuhl/ root@<VM_IP>:/home/marvin/fahrstuhl/
rsync -aHAX --delete /home/marvin/eseltokens/ root@<VM_IP>:/home/marvin/eseltokens/
rsync -aHAX --delete /home/marvin/filehoster/ root@<VM_IP>:/home/marvin/filehoster/
rsync -aHAX --delete /home/marvin/linkshortener/ root@<VM_IP>:/home/marvin/linkshortener/
rsync -aHAX --delete /home/marvin/statuspage/ root@<VM_IP>:/home/marvin/statuspage/
rsync -aHAX --delete /home/marvin/team/ root@<VM_IP>:/home/marvin/team/
rsync -aHAX --delete /home/marvin/zitatboard/ root@<VM_IP>:/home/marvin/zitatboard/
rsync -aHAX --delete /home/marvin/webhooks/ root@<VM_IP>:/home/marvin/webhooks/
rsync -aHAX --delete /home/marvin/musikbot/ root@<VM_IP>:/home/marvin/musikbot/
```

## 4) Dry run in VM (no public traffic yet)

```bash
cd /home/marvin/fahrstuhl
docker compose config --services
docker compose up -d
docker compose ps
```

Health checks in VM:

```bash
curl -sSf http://127.0.0.1:3102/health
curl -sSf http://127.0.0.1:3100/eseltokens/api/health
curl -sSf http://127.0.0.1:3112/health
```

Verify memory guardrails still active:

```bash
docker stats --no-stream | egrep 'fahrstuhl|musikbot|eseltokens|lavalink'
```

## 5) Cutover window (production switch)

### 5.1 Freeze and final sync

On old host:

```bash
cd /home/marvin/fahrstuhl
node scripts/backup-all.js
```

Stop mutable app services (keep rollback fast):

```bash
cd /home/marvin/fahrstuhl
docker compose stop fahrstuhl-docker eseltokens-docker musikbot-docker dashboard-php
```

Final rsync to VM (same commands as section 3).

### 5.2 Bring VM production up

On VM:

```bash
cd /home/marvin/fahrstuhl
docker compose up -d
docker compose ps
```

### 5.3 Route traffic to VM

- Update reverse proxy/cloudflared target from old host to VM
- Reload proxy and verify domain responses

## 6) Post-cutover verification (must pass)

- [ ] Bot online and responding to commands
- [ ] Voice join/leave stable (no reconnect loop)
- [ ] Dashboard login and API calls work
- [ ] EselTokens API healthy
- [ ] Deploy webhooks reachable
- [ ] No OOM entries after 30 minutes

Commands:

```bash
docker compose ps
docker stats --no-stream
dmesg -T | egrep -i 'out of memory|oom-killer|killed process' | tail -n 80
journalctl -k -b | egrep -i 'out of memory|oom|killed process' | tail -n 120
```

## 7) Rollback plan (fast)

If verification fails:

1. Point proxy/cloudflared back to old host
2. On old host:

```bash
cd /home/marvin/fahrstuhl
docker compose up -d fahrstuhl-docker eseltokens-docker musikbot-docker dashboard-php
docker compose ps
```

3. Keep VM running for forensics, but production stays on old host

## 8) First week operations

- Daily backup + restore-test sample
- Keep old host intact (do not wipe) for at least 7 days
- Capture incidents and tune mem limits only if required

## 9) Optional hardening after cutover

- Move Portainer behind reverse proxy auth
- Restrict SSH to key-only login
- Add UFW allowlist for management ports
- Add external backup target (NAS/USB) and off-host retention
