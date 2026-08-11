#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OnWay — Code Update Script
# Run on the VPS after pushing new code to GitHub, AS THE SERVICE USER:
#   sudo -u onway bash <app-dir>/deployment/update.sh
# (e.g. /var/www/onway-app/deployment/update.sh)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
err()     { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# App directory. Derived from THIS script's own location (…/deployment/update.sh, so the
# parent directory is the app root), which makes the script work no matter where the repo
# was cloned. It was previously hardcoded to /var/www/onway and failed on installs that
# live at /var/www/onway-app. An explicit ONWAY_APP_DIR still overrides when set.
APP_DIR="${ONWAY_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
[[ ! -d "$APP_DIR" ]] && err "App directory not found: ${APP_DIR}. Run server-setup.sh first."

# H-46: PM2 runs the app as whoever runs this script. Updating as root would start a
# SECOND, root-owned PM2 daemon alongside the service one — the server would be back
# to full privileges and the two daemons would fight over port 5000.
SERVICE_USER="${ONWAY_SERVICE_USER:-onway}"
if [[ $EUID -eq 0 ]] && id -u "$SERVICE_USER" >/dev/null 2>&1; then
  err "Do not update as root. Run:  sudo -u ${SERVICE_USER} bash ${BASH_SOURCE[0]}"
fi

cd "$APP_DIR"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  OnWay — Updating to latest code                              ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

info "Pulling latest code from GitHub..."
git pull origin main
success "Code updated"

info "Installing/updating dependencies..."
npm install --prefer-offline 2>&1 | tail -3
success "Dependencies ready"

info "Building server..."
npm run build
success "Build complete → server_dist/index.js"

info "Reloading PM2 (zero-downtime)..."
# `pm2 reload onway` replays the environment captured at the ORIGINAL `pm2 start`.
# ecosystem.config.js is what parses .env, so reloading by process name never picks
# up a changed .env — ssl-setup.sh rewrites ALLOWED_ORIGINS, prints "Reloading PM2 to
# pick up new .env", and the process keeps the old value forever. Passing the
# ecosystem FILE re-executes it, so .env is parsed again on every deploy.
#
# startOrReload also removes the branch that used to call `warn`, which was never
# defined in this script: under `set -euo pipefail` that aborted the deploy with
# exit 127 after the pull and build but BEFORE `pm2 start`, leaving the site down
# while the operator saw "Build complete".
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
success "PM2 reloaded with the new build and a freshly-parsed .env"

echo ""
echo -e "${GREEN}Update complete!${NC}"
echo ""
pm2 status
echo ""
echo "Check logs: pm2 logs onway --lines 20"
