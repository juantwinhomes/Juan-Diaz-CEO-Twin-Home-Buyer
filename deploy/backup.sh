#!/usr/bin/env bash
# Nightly database backup. Keeps 30 days of snapshots.
#
# The database is one file, so a backup is one file. sqlite3's .backup command
# copies it safely while the app is running, which a plain cp cannot guarantee.
set -euo pipefail

DB="${KPI_DB_PATH:-/var/lib/kpi-dashboard/kpi.db}"
DEST="${KPI_BACKUP_DIR:-/var/backups/kpi-dashboard}"
KEEP_DAYS=30

[ -f "$DB" ] || { echo "$(date -Is)  no database at $DB"; exit 0; }
mkdir -p "$DEST"

STAMP="$(date +%Y-%m-%d)"
sqlite3 "$DB" ".backup '$DEST/kpi-$STAMP.db'"
gzip -f "$DEST/kpi-$STAMP.db"

find "$DEST" -name 'kpi-*.db.gz' -mtime "+$KEEP_DAYS" -delete
echo "$(date -Is)  backed up to $DEST/kpi-$STAMP.db.gz ($(du -h "$DEST/kpi-$STAMP.db.gz" | cut -f1))"

# Optional off-site copy: install rclone, run `rclone config` to connect Google
# Drive, then set KPI_RCLONE_REMOTE=gdrive:kpi-backups in /etc/kpi-dashboard.env
if [ -n "${KPI_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$DEST/kpi-$STAMP.db.gz" "$KPI_RCLONE_REMOTE" && echo "$(date -Is)  copied off-site"
fi
