#!/usr/bin/env bash
#
# One-command install for the AI & Systems Daily KPI Dashboard on a fresh
# Ubuntu VM (Oracle Cloud Always Free, Google Cloud e2-micro, or any VPS).
#
#   curl -fsSL <raw-url>/deploy/setup.sh | sudo bash -s -- kpi.example.com
#
# Pass your domain to get automatic HTTPS. Omit it to serve plain HTTP on the
# VM's IP address, which is fine for a first test but not for real use.
set -euo pipefail

DOMAIN="${1:-}"
APP_USER="kpi"
APP_DIR="/opt/kpi-dashboard"
DATA_DIR="/var/lib/kpi-dashboard"
REPO="https://github.com/juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer.git"
BRANCH="claude/festive-wozniak-iednog"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
die() { printf '\n\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this with sudo."

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git >/dev/null

log "Installing Node.js 24"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
node -v | grep -q . || die "Node.js failed to install."
log "Node.js $(node -v) ready"

log "Creating the application user and directories"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR"

log "Fetching the application"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
(cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund >/dev/null)
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"

# Generate the team password and session secret once, then keep them across
# re-runs so nobody is logged out by an update.
ENV_FILE="/etc/kpi-dashboard.env"
if [ ! -f "$ENV_FILE" ]; then
  log "Generating credentials"
  APP_PASSWORD="$(head -c 9 /dev/urandom | base64 | tr -d '/+=' | head -c 12)"
  cat > "$ENV_FILE" <<EOF
PORT=4000
HOST=127.0.0.1
APP_PASSWORD=$APP_PASSWORD
SESSION_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
# Point at a managed Postgres (e.g. Supabase) to keep the data off this machine.
# Left unset, the app stores its database under $DATA_DIR on this server.
DATABASE_URL=${DATABASE_URL:-}
PGDATA_DIR=$DATA_DIR
EOF
  chmod 600 "$ENV_FILE"
  NEW_PASSWORD=1
fi

log "Installing the service"
cat > /etc/systemd/system/kpi-dashboard.service <<EOF
[Unit]
Description=AI & Systems Daily KPI Dashboard
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $APP_DIR/server/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --quiet kpi-dashboard
systemctl restart kpi-dashboard

log "Setting up the web server"
if ! command -v caddy >/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

if [ -n "$DOMAIN" ]; then
  # Caddy obtains and renews the HTTPS certificate automatically.
  printf '%s {\n\treverse_proxy 127.0.0.1:4000\n}\n' "$DOMAIN" > /etc/caddy/Caddyfile
  URL="https://$DOMAIN"
else
  printf ':80 {\n\treverse_proxy 127.0.0.1:4000\n}\n' > /etc/caddy/Caddyfile
  URL="http://$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || echo 'your-server-ip')"
fi
systemctl restart caddy

log "Opening the firewall"
# Oracle Cloud images ship with restrictive iptables rules that block 80/443.
if command -v iptables >/dev/null; then
  iptables -I INPUT 1 -p tcp --dport 80  -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
fi
command -v ufw >/dev/null && { ufw allow 80/tcp >/dev/null 2>&1 || true; ufw allow 443/tcp >/dev/null 2>&1 || true; }

log "Scheduling nightly backups"
install -m 755 "$APP_DIR/deploy/backup.sh" /usr/local/bin/kpi-backup
cat > /etc/cron.d/kpi-backup <<EOF
# Back up the database every night at 01:30
30 1 * * * root /usr/local/bin/kpi-backup >> /var/log/kpi-backup.log 2>&1
EOF

sleep 3
if systemctl is-active --quiet kpi-dashboard; then
  printf '\n\033[1;32m================================================\033[0m\n'
  printf '\033[1;32m  The dashboard is running.\033[0m\n\n'
  printf '  Address:   %s\n' "$URL"
  if [ "${NEW_PASSWORD:-0}" = "1" ]; then
    printf '  Password:  %s\n\n' "$(grep APP_PASSWORD "$ENV_FILE" | cut -d= -f2)"
    printf '  Save that password now — share it with your team.\n'
    printf '  To change it later: sudo nano %s\n' "$ENV_FILE"
    printf '  then: sudo systemctl restart kpi-dashboard\n'
  else
    printf '  Password:  unchanged (see %s)\n' "$ENV_FILE"
  fi
  printf '\033[1;32m================================================\033[0m\n\n'
else
  die "The service did not start. Check: journalctl -u kpi-dashboard -n 40"
fi
