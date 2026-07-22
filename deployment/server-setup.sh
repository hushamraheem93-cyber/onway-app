#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OnWay — One-Shot VPS Setup Script
# Target: Ubuntu 24.04 LTS (fresh Hostinger VPS)
# Run as root: bash server-setup.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()     { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash server-setup.sh"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  OnWay — Production Server Setup                              ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Configuration prompts ─────────────────────────────────────────────────────
read -rp "$(echo -e "${YELLOW}Domain name${NC} (e.g. api.example.com — or press Enter to use server IP): ")" DOMAIN
echo ""

GITHUB_REPO="hushamraheem93-cyber/onway-app"
APP_DIR="/var/www/onway"
NODE_VERSION="22"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. System update
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git unzip build-essential ufw nginx certbot python3-certbot-nginx
success "System packages updated"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. Node.js 22 (via NodeSource — matches Replit environment)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  info "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - -q
  apt-get install -y -qq nodejs
  success "Node.js $(node -v) installed"
else
  success "Node.js $(node -v) already installed"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. PM2
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 --silent
  success "PM2 $(pm2 -v) installed"
else
  success "PM2 $(pm2 -v) already installed"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. Clone / update project
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info "Setting up project directory at ${APP_DIR}..."
mkdir -p "$APP_DIR"

CLONE_URL="https://github.com/${GITHUB_REPO}.git"

if [[ -d "${APP_DIR}/.git" ]]; then
  info "Repository already exists — pulling latest..."
  cd "$APP_DIR"
  git pull origin main
else
  info "Cloning repository..."
  git clone "$CLONE_URL" "$APP_DIR"
  cd "$APP_DIR"
fi
success "Repository ready at ${APP_DIR}"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. Install dependencies & build
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info "Installing npm dependencies..."
npm install --prefer-offline 2>&1 | tail -3
success "Dependencies installed"

info "Building server..."
npm run build
success "Server built → server_dist/index.js"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. Directory structure
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
mkdir -p "${APP_DIR}/logs"
mkdir -p "${APP_DIR}/uploads"
chmod 755 "${APP_DIR}/uploads"
success "Directory structure ready"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. .env file (template — user must fill values)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ ! -f "${APP_DIR}/.env" ]]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"

  # Pre-fill NODE_ENV and PORT
  sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "${APP_DIR}/.env"
  sed -i 's/^PORT=.*/PORT=5000/'               "${APP_DIR}/.env"
  sed -i 's/^DEV_MODE=.*/DEV_MODE=false/'       "${APP_DIR}/.env"

  # Pre-fill ALLOWED_ORIGINS if domain was given
  if [[ -n "${DOMAIN:-}" ]]; then
    sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${DOMAIN}|" "${APP_DIR}/.env"
    sed -i "s|^EXPO_PUBLIC_API_BASE_URL=.*|EXPO_PUBLIC_API_BASE_URL=https://${DOMAIN}|" "${APP_DIR}/.env"
  fi

  warn ".env file created at ${APP_DIR}/.env"
  warn "You MUST fill in the required secrets before starting the server."
  warn "Required: JWT_SECRET, SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD,"
  warn "          FIREBASE_SERVICE_ACCOUNT, OTP_IQ_API_KEY"
else
  success ".env already exists — skipping (not overwritten)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 8. Nginx configuration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info "Configuring Nginx..."

SERVER_NAME="${DOMAIN:-_}"  # _ = catch-all if no domain given

cat > /etc/nginx/sites-available/onway <<NGINX_EOF
# ── Rate limiting zones ───────────────────────────────────────────────────────
limit_req_zone \$binary_remote_addr zone=onway_api:10m   rate=30r/s;
limit_req_zone \$binary_remote_addr zone=onway_login:10m rate=5r/m;

# ── HTTP ──────────────────────────────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    # Let's Encrypt ACME challenge (certbot will use this)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files \$uri =404;
    }

    # Redirect everything else to HTTPS (once SSL is installed)
    location / {
        # Uncomment after certbot: return 301 https://\$host\$request_uri;
        # While testing without SSL — proxy directly:
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 20M;
    }
}

# ── HTTPS (Certbot fills in SSL block automatically) ──────────────────────────
# server {
#     listen 443 ssl http2;
#     listen [::]:443 ssl http2;
#     server_name ${SERVER_NAME};
#
#     # SSL managed by Certbot — do not edit manually
#     # ssl_certificate     /etc/letsencrypt/live/${SERVER_NAME}/fullchain.pem;
#     # ssl_certificate_key /etc/letsencrypt/live/${SERVER_NAME}/privkey.pem;
#     # include             /etc/letsencrypt/options-ssl-nginx.conf;
#     # ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;
#
#     add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
#     add_header X-Frame-Options           "SAMEORIGIN"  always;
#     add_header X-Content-Type-Options    "nosniff"     always;
#     add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
#
#     client_max_body_size 20M;
#     gzip on;
#     gzip_types text/plain application/json application/javascript text/css;
#
#     # Admin login — strict rate limit
#     location = /api/admin/login {
#         limit_req zone=onway_login burst=3 nodelay;
#         proxy_pass http://127.0.0.1:5000;
#         include /etc/nginx/proxy_params;
#     }
#
#     # API
#     location /api/ {
#         limit_req zone=onway_api burst=60 nodelay;
#         proxy_pass http://127.0.0.1:5000;
#         include /etc/nginx/proxy_params;
#     }
#
#     # Socket.io WebSocket
#     location /socket.io/ {
#         proxy_pass         http://127.0.0.1:5000;
#         proxy_http_version 1.1;
#         proxy_set_header   Upgrade \$http_upgrade;
#         proxy_set_header   Connection "Upgrade";
#         proxy_set_header   Host \$host;
#         proxy_set_header   X-Real-IP \$remote_addr;
#         proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
#         proxy_read_timeout 86400s;
#     }
#
#     # Everything else
#     location / {
#         proxy_pass         http://127.0.0.1:5000;
#         proxy_http_version 1.1;
#         proxy_set_header   Upgrade \$http_upgrade;
#         proxy_set_header   Connection 'upgrade';
#         proxy_set_header   Host \$host;
#         proxy_set_header   X-Real-IP \$remote_addr;
#         proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
#         proxy_set_header   X-Forwarded-Proto \$scheme;
#         proxy_cache_bypass \$http_upgrade;
#         proxy_read_timeout 300s;
#         client_max_body_size 20M;
#     }
# }
NGINX_EOF

# Enable site
ln -sf /etc/nginx/sites-available/onway /etc/nginx/sites-enabled/onway
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t && systemctl reload nginx
success "Nginx configured and reloaded"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 9. UFW Firewall
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'
# Port 5000 is NOT opened — only Nginx accesses it internally
ufw --force enable
success "Firewall configured (22, 80, 443 open; 5000 blocked externally)"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 10. PM2 startup (survives server reboots)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info "Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root | tail -1 | bash 2>/dev/null || true
success "PM2 startup configured"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Done — next steps
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup complete! Follow these steps to finish:                ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}STEP 1 — Fill in your secrets:${NC}"
echo "  nano ${APP_DIR}/.env"
echo ""
echo -e "  Required values to fill in:"
echo -e "  ${RED}  JWT_SECRET${NC}             — 64+ random hex chars"
echo -e "  ${RED}  SESSION_SECRET${NC}         — 64+ random hex chars"
echo -e "  ${RED}  ADMIN_USERNAME${NC}         — admin panel login"
echo -e "  ${RED}  ADMIN_PASSWORD${NC}         — admin panel password"
echo -e "  ${RED}  FIREBASE_SERVICE_ACCOUNT${NC} — single-line JSON from Firebase console"
echo -e "  ${RED}  OTP_IQ_API_KEY${NC}         — from otpiq.com dashboard"
echo ""
echo -e "  Generate secrets with:"
echo "  node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
echo ""
echo -e "${YELLOW}STEP 2 — Start the server:${NC}"
echo "  cd ${APP_DIR}"
echo "  pm2 start ecosystem.config.js"
echo "  pm2 save"
echo ""
echo -e "${YELLOW}STEP 3 (optional — if you have a domain) — Install SSL:${NC}"
echo "  Make sure your domain's A record points to this server's IP first, then:"
echo "  certbot --nginx -d ${DOMAIN:-your-domain.com}"
echo ""
echo -e "${YELLOW}STEP 4 — Verify:${NC}"
echo "  pm2 status"
echo "  curl http://localhost:5000/api/settings/public"
echo ""
echo -e "${GREEN}Need to update code later? Run: bash ${APP_DIR}/deployment/update.sh${NC}"
echo ""
