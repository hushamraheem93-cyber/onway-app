#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OnWay — Code Update Script
# Run on the VPS after pushing new code to GitHub:
#   bash /var/www/onway/deployment/update.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
err()     { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

APP_DIR="/var/www/onway"
[[ ! -d "$APP_DIR" ]] && err "App directory not found: ${APP_DIR}. Run server-setup.sh first."

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
if pm2 describe onway &>/dev/null; then
  pm2 reload onway
  success "PM2 reloaded with new build"
else
  warn "PM2 process 'onway' not found — starting it..."
  pm2 start ecosystem.config.js
  pm2 save
  success "PM2 started"
fi

echo ""
echo -e "${GREEN}Update complete!${NC}"
echo ""
pm2 status
echo ""
echo "Check logs: pm2 logs onway --lines 20"
