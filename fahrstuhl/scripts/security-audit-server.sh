#!/usr/bin/env bash
set -euo pipefail

# Non-destructive production security audit for Debian/Ubuntu hosts.
# This script does not change configuration and is safe to run on a live server.

MARVIN_HOME="${MARVIN_HOME:-/home/marvin}"
WEB_ROOT_CANDIDATES=(
  "/var/www"
  "/usr/share/nginx/html"
  "${MARVIN_HOME}/fahrstuhl/dashboard/public"
)

echo "== Fahrstuhl Production Security Audit =="
echo "Host: $(hostname)"
echo "Time: $(date -Iseconds)"
echo

report() {
  # Usage: report <severity> <message>
  local severity="$1"
  shift
  printf '[%s] %s\n' "$severity" "$*"
}

section() {
  echo
  echo "--- $* ---"
}

section "SSH hardening"
if command -v sshd >/dev/null 2>&1; then
  sshd_t="$(sshd -T 2>/dev/null || true)"
  permit_root="$(printf '%s\n' "$sshd_t" | awk '/^permitrootlogin /{print $2}' | head -n1)"
  password_auth="$(printf '%s\n' "$sshd_t" | awk '/^passwordauthentication /{print $2}' | head -n1)"
  pubkey_auth="$(printf '%s\n' "$sshd_t" | awk '/^pubkeyauthentication /{print $2}' | head -n1)"

  if [[ "$permit_root" == "yes" ]]; then
    report "CRITICAL" "PermitRootLogin is enabled"
  else
    report "LOW" "PermitRootLogin=$permit_root"
  fi

  if [[ "$password_auth" == "yes" ]]; then
    report "HIGH" "PasswordAuthentication is enabled"
  else
    report "LOW" "PasswordAuthentication=$password_auth"
  fi

  if [[ "$pubkey_auth" != "yes" ]]; then
    report "HIGH" "PubkeyAuthentication is not explicitly enabled"
  else
    report "LOW" "PubkeyAuthentication=yes"
  fi
else
  report "MEDIUM" "sshd command not found; cannot audit effective SSH config"
fi

section "Fail2Ban"
if command -v fail2ban-client >/dev/null 2>&1; then
  f2b_status="$(fail2ban-client status 2>/dev/null || true)"
  if printf '%s' "$f2b_status" | grep -qi 'jail list'; then
    report "LOW" "Fail2Ban is installed and responding"
    if printf '%s' "$f2b_status" | grep -q 'sshd'; then
      report "LOW" "sshd jail is present"
    else
      report "HIGH" "sshd jail missing in Fail2Ban"
    fi
  else
    report "HIGH" "Fail2Ban installed but not active"
  fi
else
  report "HIGH" "Fail2Ban not installed"
fi

section "Firewall and exposed ports"
if command -v ufw >/dev/null 2>&1; then
  ufw status verbose || true
  if ufw status | grep -q 'Status: active'; then
    report "LOW" "UFW is active"
  else
    report "HIGH" "UFW is inactive"
  fi
else
  report "MEDIUM" "UFW not installed"
fi

echo "Listening TCP/UDP ports:"
ss -tulpen || true

section "World-writable permissions"
if [[ -d "$MARVIN_HOME" ]]; then
  ww_count="$(find "$MARVIN_HOME" -xdev -type f -perm -0002 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$ww_count" == "0" ]]; then
    report "LOW" "No world-writable files under $MARVIN_HOME"
  else
    report "HIGH" "Found $ww_count world-writable files under $MARVIN_HOME"
    find "$MARVIN_HOME" -xdev -type f -perm -0002 2>/dev/null | head -n 30
  fi
else
  report "MEDIUM" "$MARVIN_HOME does not exist"
fi

section ".env file permissions"
find "$MARVIN_HOME" -maxdepth 4 -type f \( -name '.env' -o -name '.env.local' -o -name '.env-dashboard' \) -print0 2>/dev/null |
  while IFS= read -r -d '' f; do
    perms="$(stat -c '%a' "$f" 2>/dev/null || echo unknown)"
    owner="$(stat -c '%U:%G' "$f" 2>/dev/null || echo unknown)"
    echo "$f perms=$perms owner=$owner"
    if [[ "$perms" != "600" && "$perms" != "640" ]]; then
      report "MEDIUM" "Consider chmod 600 or 640 for $f"
    fi
  done

section "PM2 environment exposure"
if command -v pm2 >/dev/null 2>&1; then
  report "LOW" "PM2 detected"
  pm2 jlist >/tmp/pm2-jlist.json 2>/dev/null || true
  if [[ -s /tmp/pm2-jlist.json ]]; then
    report "LOW" "PM2 process list captured at /tmp/pm2-jlist.json"
    if command -v jq >/dev/null 2>&1; then
      jq -r '.[] | .name as $n | (.pm2_env.env // {}) | to_entries[]? | select((.key|ascii_downcase)|test("token|secret|password|key")) | "possible secret env key in " + $n + ": " + .key' /tmp/pm2-jlist.json || true
    else
      report "MEDIUM" "jq not installed; install jq for deeper PM2 env key scan"
    fi
  else
    report "MEDIUM" "Could not read PM2 jlist output"
  fi
else
  report "MEDIUM" "PM2 not found"
fi

section "Backup exposure"
BACKUP_ROOT="${BACKUP_ROOT:-${MARVIN_HOME}/backups}"
if [[ -d "$BACKUP_ROOT" ]]; then
  report "LOW" "Backup root exists at $BACKUP_ROOT"
  for webroot in "${WEB_ROOT_CANDIDATES[@]}"; do
    if [[ -d "$webroot" ]]; then
      case "$BACKUP_ROOT" in
        "$webroot"* )
          report "CRITICAL" "Backup root is under web root: $BACKUP_ROOT (web root $webroot)"
          ;;
      esac
    fi
  done
else
  report "MEDIUM" "Backup root not found at $BACKUP_ROOT"
fi

section "Dashboard upload directory"
UPLOAD_DIR="${MARVIN_HOME}/fahrstuhl/dashboard/public/uploads"
if [[ -d "$UPLOAD_DIR" ]]; then
  perms="$(stat -c '%a' "$UPLOAD_DIR" 2>/dev/null || echo unknown)"
  report "LOW" "Upload dir present: $UPLOAD_DIR (perms=$perms)"
  php_files="$(find "$UPLOAD_DIR" -type f -name '*.php' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$php_files" != "0" ]]; then
    report "HIGH" "PHP files found in uploads directory"
    find "$UPLOAD_DIR" -type f -name '*.php' 2>/dev/null | head -n 20
  fi
else
  report "MEDIUM" "Upload dir not found at $UPLOAD_DIR"
fi

section "Automatic security updates"
if systemctl is-enabled unattended-upgrades >/dev/null 2>&1; then
  report "LOW" "unattended-upgrades is enabled"
else
  report "MEDIUM" "unattended-upgrades is not enabled"
fi

section "Cloudflare/Nginx reverse proxy assumptions"
if command -v nginx >/dev/null 2>&1; then
  nginx -t || true
  if grep -R "set_real_ip_from\|real_ip_header\|proxy_set_header" -n /etc/nginx 2>/dev/null | head -n 20; then
    report "LOW" "Found reverse-proxy header directives in nginx config"
  else
    report "HIGH" "No reverse-proxy header directives found in nginx config scan"
  fi
else
  report "MEDIUM" "nginx not found"
fi

section "Localhost-only services"
if command -v ss >/dev/null 2>&1; then
  # Internal service ports expected to stay local in this stack.
  for p in 3002 8081 9000 9001 3010 3011 3012 3013 3014 3015 3020 2333 3306 6379; do
    if ss -ltnp 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)${p}$"; then
      if ss -ltnp 2>/dev/null | grep -E "0\.0\.0\.0:${p}|\[::\]:${p}" >/dev/null; then
        report "HIGH" "Port ${p} listens on all interfaces"
      else
        report "LOW" "Port ${p} is not listening on all interfaces"
      fi
    fi
  done
fi

section "MariaDB exposure"
if command -v mysql >/dev/null 2>&1; then
  if ss -ltnp 2>/dev/null | grep -E "0\.0\.0\.0:3306|\[::\]:3306" >/dev/null; then
    report "HIGH" "MariaDB appears externally bound on 3306"
  else
    report "LOW" "MariaDB does not appear externally bound on 3306"
  fi
else
  report "MEDIUM" "mysql client not found; cannot verify DB bind assumptions fully"
fi

echo
report "LOW" "Audit complete (read-only)."
