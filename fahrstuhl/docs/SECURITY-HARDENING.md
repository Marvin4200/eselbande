# Fahrstuhl Infrastructure Security Hardening

This guide is designed for Debian/Ubuntu production hosts running the Fahrstuhl stack under PM2.
It prioritizes non-breaking hardening and uptime safety.

## Scope

- SSH hardening
- Root login policy
- Fail2Ban for SSH
- UFW firewall baseline
- File permission checks
- PM2 env exposure checks
- Backup and upload exposure checks
- Nginx/Cloudflare reverse-proxy assumptions
- MariaDB exposure checks
- Automatic security updates

## 1) Run the non-destructive audit

```bash
cd /home/marvin/fahrstuhl
bash scripts/security-audit-server.sh
```

## 2) SSH recommended safe baseline

Check effective config:

```bash
sshd -T | egrep 'permitrootlogin|passwordauthentication|pubkeyauthentication|maxauthtries|x11forwarding'
```

Recommended values for production:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
```

Apply via drop-in (preferred):

```bash
sudo install -d -m 755 /etc/ssh/sshd_config.d
sudo tee /etc/ssh/sshd_config.d/99-fahrstuhl-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
EOF
sudo sshd -t
sudo systemctl reload ssh
```

## 3) Fail2Ban safe setup for SSH

Install and enable:

```bash
sudo apt-get update
sudo apt-get install -y fail2ban
```

Create jail override:

```bash
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'EOF'
[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
bantime.increment = true
bantime.factor = 2
EOF
```

Validate and restart:

```bash
sudo fail2ban-client -t
sudo systemctl enable fail2ban --now
sudo fail2ban-client status sshd
```

## 4) UFW minimal required ports (safe baseline)

Review before changing:

```bash
sudo ufw status verbose
ss -tulpen
```

Typical internet-facing ports only:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Internal-only service ports should remain localhost-bound and NOT publicly allowed:

- 3002 (Bot API)
- 8081 (dashboard-php)
- 9000 / 9001 (deploy webhooks)
- 3010-3015 (other internal apps)
- 3020 (musikbot health)
- 2333 (lavalink)
- 3306 (MariaDB)
- 6379 (Redis)

## 5) File permissions

Find world-writable files under /home/marvin:

```bash
find /home/marvin -xdev -type f -perm -0002
```

Fix only confirmed runtime files/directories:

```bash
sudo chmod 600 /home/marvin/fahrstuhl/.env
sudo chmod 600 /home/marvin/fahrstuhl/dashboard/.env
sudo chmod -R o-w /home/marvin/fahrstuhl
```

## 6) PM2 environment exposure checks

```bash
pm2 jlist > /tmp/pm2-jlist.json
jq -r '.[] | .name as $n | (.pm2_env.env // {}) | to_entries[]? | select((.key|ascii_downcase)|test("token|secret|password|key")) | "possible secret env key in " + $n + ": " + .key' /tmp/pm2-jlist.json
```

Do not print values in logs or dashboards.

## 7) Backups and uploads exposure checks

Backups should stay outside web roots:

```bash
test -d /home/marvin/backups && echo "ok"
```

Dashboard uploads checks:

```bash
find /home/marvin/fahrstuhl/dashboard/public/uploads -type f -name '*.php'
```

Result should be empty.

## 8) Git secret leakage controls

Ensure these are ignored and not tracked:

- .env
- dashboard/.env
- private keys (*.pem, *.key, *.p12, *.pfx)

Check tracked secret-like files:

```bash
cd /home/marvin/fahrstuhl
git ls-files "*.env" ".env*" "**/*.env" "**/*.pem" "**/*.key"
```

## 9) Nginx + Cloudflare proxy safety assumptions

Ensure real client IP handling and forwarded headers are configured correctly in nginx.

Minimum checks:

```bash
sudo nginx -t
grep -R "set_real_ip_from\|real_ip_header\|proxy_set_header" -n /etc/nginx
```

Cloudflare-origin only ingress should be enforced at firewall level where possible.

## 10) MariaDB exposure

```bash
ss -ltnp | grep 3306 || true
```

Prefer bind-address to loopback or private interface only (not 0.0.0.0) unless required.

## 11) Automatic security updates

```bash
systemctl is-enabled unattended-upgrades || true
```

If disabled:

```bash
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
sudo systemctl enable unattended-upgrades --now
```

## Notes for this repository

- `services/botAPI.js` enforces `BOT_API_TOKEN` by default and only allows local bypass when `ALLOW_LOCAL_API_WITHOUT_TOKEN=1`.
- `ecosystem.config.js` currently starts dashboard PHP on `0.0.0.0:8081`; keep this behind nginx/firewall and avoid direct public access.
- Whole-server backups are configured to `/home/marvin/backups`, outside web root assumptions.
