#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OnWay — SSL Certificate Setup (Let's Encrypt via Certbot)
# Run AFTER your domain's DNS A record points to this server.
# Run on VPS: bash /var/www/onway/deployment/ssl-setup.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
err()     { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && err "Run as root: sudo bash ssl-setup.sh"

read -rp "$(echo -e "${YELLOW}Domain name${NC} (e.g. api.example.com): ")" DOMAIN
read -rp "$(echo -e "${YELLOW}Email address${NC} (for Let's Encrypt expiry notices): ")" EMAIL

echo ""
info "Verifying domain resolves to this server..."
SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org || curl -s --max-time 5 https://ifconfig.me || echo "unknown")
DOMAIN_IP=$(dig +short "$DOMAIN" | tail -1)

echo "  Server IP : ${SERVER_IP}"
echo "  Domain IP : ${DOMAIN_IP}"

if [[ "$SERVER_IP" != "$DOMAIN_IP" ]]; then
  err "Domain ${DOMAIN} resolves to ${DOMAIN_IP} but this server is ${SERVER_IP}.\nMake sure your DNS A record is correct and has propagated (can take up to 24h)."
fi
success "DNS check passed"

info "Installing SSL certificate for ${DOMAIN}..."
certbot --nginx \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --redirect

# Update ALLOWED_ORIGINS in .env
APP_DIR="/var/www/onway"
if [[ -f "${APP_DIR}/.env" ]]; then
  sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${DOMAIN}|" "${APP_DIR}/.env"
  sed -i "s|^EXPO_PUBLIC_API_BASE_URL=.*|EXPO_PUBLIC_API_BASE_URL=https://${DOMAIN}|" "${APP_DIR}/.env"
  info "Updated ALLOWED_ORIGINS and EXPO_PUBLIC_API_BASE_URL in .env"
fi

info "Reloading Nginx..."
nginx -t && systemctl reload nginx

info "Reloading PM2 to pick up new .env values..."
# Must pass the ecosystem FILE, not the process name: ecosystem.config.js is what
# parses .env, and `pm2 reload onway` replays the environment captured at the first
# `pm2 start`. The ALLOWED_ORIGINS this script just wrote would otherwise never
# reach the process — and with fail-closed CORS, an empty ALLOWED_ORIGINS 403s
# every browser request.
if [[ -f "${APP_DIR}/ecosystem.config.js" ]]; then
  (cd "${APP_DIR}" && pm2 startOrReload ecosystem.config.js --update-env && pm2 save) || \
    err "PM2 failed to reload with the new .env — the server is still using the old ALLOWED_ORIGINS."
else
  err "${APP_DIR}/ecosystem.config.js not found — cannot apply the new .env values."
fi

# Set up auto-renewal check
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
success "SSL installed for ${DOMAIN}!"
echo ""
echo -e "  Your API is now live at: ${GREEN}https://${DOMAIN}${NC}"
echo -e "  Admin panel:             ${GREEN}https://${DOMAIN}/admin${NC}"
echo ""
echo "  Auto-renewal is enabled (checked twice daily by systemd)."
echo "  Test renewal: certbot renew --dry-run"
