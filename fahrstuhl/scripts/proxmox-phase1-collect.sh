#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/home/marvin/fahrstuhl"
ARTIFACT_ROOT="$BASE_DIR/docs/phase1-artifacts"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$ARTIFACT_ROOT/$STAMP"

mkdir -p "$OUT_DIR"

log() {
  echo "[$(date +%H:%M:%S)] $*"
}

safe_run() {
  local outfile="$1"
  shift
  {
    echo "# command: $*"
    echo
    "$@"
  } > "$outfile" 2>&1 || true
}

cd "$BASE_DIR"

log "Collecting service inventory"
safe_run "$OUT_DIR/inventory-services.txt" docker compose config --services
safe_run "$OUT_DIR/inventory-docker-ps.txt" docker compose ps
safe_run "$OUT_DIR/inventory-docker-images.txt" docker images

log "Collecting network and port inventory"
safe_run "$OUT_DIR/inventory-ports.txt" ss -ltnp
safe_run "$OUT_DIR/inventory-volumes.txt" docker volume ls
{
  echo "# docker volume inspect (top-level)"
  echo
  docker volume ls --format '{{.Name}}' | while read -r v; do
    echo "## $v"
    docker volume inspect "$v" || true
    echo
  done
} > "$OUT_DIR/inventory-volume-inspect.txt" 2>&1

log "Collecting env files inventory"
{
  echo "/home/marvin/fahrstuhl/.env"
  echo "/home/marvin/fahrstuhl/.env-dashboard"
  echo "/home/marvin/eseltokens/.env.local"
  echo "/home/marvin/webhooks/.env"
  echo "/home/marvin/team/.env"
  echo "/home/marvin/filehoster/.env"
  echo "/home/marvin/linkshortener/.env"
  echo "/home/marvin/zitatboard/.env"
  echo "/home/marvin/musikbot/.env"
} > "$OUT_DIR/inventory-env-files.txt"

log "Collecting host resources"
safe_run "$OUT_DIR/inventory-host-resources.txt" bash -lc 'uname -a; echo; uptime; echo; free -h; echo; df -h; echo; lsblk'

log "Running backup status before"
safe_run "$OUT_DIR/backup-status-before.txt" node scripts/backup-all.js --status

log "Running backup now"
safe_run "$OUT_DIR/backup-run.txt" node scripts/backup-all.js

log "Running backup status after"
safe_run "$OUT_DIR/backup-status-after.txt" node scripts/backup-all.js --status

log "Running restore test"
safe_run "$OUT_DIR/restore-test.txt" node scripts/restore-test.js

log "Done. Artifacts at: $OUT_DIR"
echo "$OUT_DIR" > "$ARTIFACT_ROOT/latest.txt"
