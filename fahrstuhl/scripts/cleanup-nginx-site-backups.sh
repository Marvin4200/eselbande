#!/usr/bin/env bash
set -euo pipefail

SITES_ENABLED="${NGINX_SITES_ENABLED_DIR:-/etc/nginx/sites-enabled}"
BACKUP_ROOT="${NGINX_BACKUP_CONFIG_DIR:-/root/nginx-config-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="${BACKUP_ROOT}/${STAMP}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root."
  exit 1
fi

if [[ ! -d "$SITES_ENABLED" ]]; then
  echo "sites-enabled directory not found: $SITES_ENABLED"
  exit 1
fi

mapfile -t BACKUP_FILES < <(
  find "$SITES_ENABLED" -maxdepth 1 -type f \
    \( -iname "*.bak" -o -iname "*.bak*" -o -iname "*.backup" -o -iname "*.old" -o -iname "*~" \) \
    -printf '%f\n' | sort
)

echo "Active nginx site files:"
ls -la "$SITES_ENABLED"

if [[ "${#BACKUP_FILES[@]}" -eq 0 ]]; then
  echo "No backup-like files found in $SITES_ENABLED."
else
  mkdir -p "$TARGET_DIR"
  echo "Moving backup-like files to $TARGET_DIR:"
  for file in "${BACKUP_FILES[@]}"; do
    echo "  - $file"
    mv -- "$SITES_ENABLED/$file" "$TARGET_DIR/$file"
  done
fi

echo
echo "Checking nginx config..."
nginx -t

echo
echo "Reloading nginx..."
systemctl reload nginx

echo
echo "Done. If warnings remain, inspect duplicates with:"
echo "grep -R \"server_name\" -n $SITES_ENABLED"
