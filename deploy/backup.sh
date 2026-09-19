#!/usr/bin/env bash
# Nightly database backup. Keeps 30 days of JSON exports.
set -euo pipefail

APP_DIR="${KPI_APP_DIR:-/opt/kpi-dashboard}"
DEST="${KPI_BACKUP_DIR:-/var/backups/kpi-dashboard}"
KEEP_DAYS=30

mkdir -p "$DEST"
STAMP="$(date +%Y-%m-%d)"
OUT="$DEST/kpi-$STAMP.json"

# Export every table to JSON. Works against any Postgres the app can reach.
(cd "$APP_DIR" && node server/export.js "$OUT")
gzip -f "$OUT"

find "$DEST" -name 'kpi-*.json.gz' -mtime "+$KEEP_DAYS" -delete
echo "$(date -Is)  backed up to $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"

# Optional off-site copy: install rclone, run `rclone config` to connect Google
# Drive, then set KPI_RCLONE_REMOTE=gdrive:kpi-backups in /etc/kpi-dashboard.env
if [ -n "${KPI_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$OUT.gz" "$KPI_RCLONE_REMOTE" && echo "$(date -Is)  copied off-site"
fi
