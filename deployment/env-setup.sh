#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OnWay — Interactive .env Setup Helper
# Run AFTER server-setup.sh to fill in all required secrets interactively.
# Run on VPS: bash /var/www/onway/deployment/env-setup.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }

# H-78: derived from this script's own location (…/deployment/x.sh → the parent is
# the app root), the same rule update.sh already uses. It was hardcoded to
# /var/www/onway while server-setup.sh installs to /var/www/onway-app, so this
# wrote to a directory that does not exist on a real install. ONWAY_APP_DIR still
# overrides.
APP_DIR="${ONWAY_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${APP_DIR}/.env"

[[ ! -f "$ENV_FILE" ]] && cp "${APP_DIR}/.env.example" "$ENV_FILE" && chmod 600 "$ENV_FILE"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  OnWay — Environment Variable Setup                           ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Press Enter to keep the existing value (shown in brackets)."
echo ""

set_env() {
  local KEY="$1"
  local PROMPT="$2"
  local SECRET="${3:-false}"
  local CURRENT
  CURRENT=$(grep "^${KEY}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")

  if [[ "$SECRET" == "true" ]]; then
    read -rsp "$(echo -e "${YELLOW}${PROMPT}${NC} [${CURRENT:0:8}...]: ")" VALUE
    echo ""
  else
    read -rp "$(echo -e "${YELLOW}${PROMPT}${NC} [${CURRENT}]: ")" VALUE
  fi

  VALUE="${VALUE:-$CURRENT}"
  if grep -q "^${KEY}=" "$ENV_FILE"; then
    # escape & for sed
    ESCAPED=$(printf '%s\n' "$VALUE" | sed 's/[&/\]/\\&/g')
    sed -i "s|^${KEY}=.*|${KEY}=${ESCAPED}|" "$ENV_FILE"
  else
    echo "${KEY}=${VALUE}" >> "$ENV_FILE"
  fi
}

# Always set fixed values
sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "$ENV_FILE"
sed -i 's/^PORT=.*/PORT=5000/'               "$ENV_FILE"
sed -i 's/^DEV_MODE=.*/DEV_MODE=false/'       "$ENV_FILE"

echo -e "${BLUE}── Security secrets ─────────────────────────────────────────${NC}"
echo "(Generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\")"
echo ""
set_env "JWT_SECRET"     "JWT_SECRET     (64+ hex chars)" true
set_env "SESSION_SECRET" "SESSION_SECRET (64+ hex chars)" true
echo ""

echo -e "${BLUE}── Admin panel login ─────────────────────────────────────────${NC}"
set_env "ADMIN_USERNAME"          "ADMIN_USERNAME"
set_env "ADMIN_PASSWORD"          "ADMIN_PASSWORD" true
set_env "MASTER_RECOVERY_PASSWORD" "MASTER_RECOVERY_PASSWORD (emergency — leave blank to disable)" true
echo ""

echo -e "${BLUE}── Domain / CORS ─────────────────────────────────────────────${NC}"
# ALLOWED_ORIGINS is a COMMA-SEPARATED LIST, not one origin. The old prompt showed a
# single example, which is how an operator ends up storing one value where several
# belong. Same-origin surfaces (the /admin panel, /vendor, the mobile apps) do NOT
# need to be listed — they are allowed by the server's own origin. This is only for
# genuinely cross-origin browser clients.
echo "ALLOWED_ORIGINS is a COMMA-SEPARATED LIST — you may enter several origins."
echo "  one origin  : https://api.example.com"
echo "  several     : https://api.example.com,https://www.api.example.com"
echo "Leave blank if every client is same-origin or a native mobile app."
set_env "ALLOWED_ORIGINS"         "ALLOWED_ORIGINS (comma-separated, e.g. https://a.example.com,https://www.a.example.com)"
set_env "EXPO_PUBLIC_API_BASE_URL" "EXPO_PUBLIC_API_BASE_URL (same as above, no trailing slash)"
echo ""

echo -e "${BLUE}── Firebase ──────────────────────────────────────────────────${NC}"
echo "Paste the SINGLE-LINE JSON content from Firebase Console → Service accounts."
echo "(Project Settings → Service accounts → Generate new private key → open file → copy all on one line)"
echo ""
set_env "FIREBASE_SERVICE_ACCOUNT" "FIREBASE_SERVICE_ACCOUNT" true
echo ""

echo -e "${BLUE}── OTP / SMS ─────────────────────────────────────────────────${NC}"
set_env "OTP_IQ_API_KEY"   "OTP_IQ_API_KEY (from otpiq.com)" true
set_env "OTP_IQ_SENDER_ID" "OTP_IQ_SENDER_ID (optional)"
set_env "OTP_IQ_PROVIDER"  "OTP_IQ_PROVIDER (optional: auto/sms/whatsapp/telegram)"
echo ""

echo -e "${BLUE}── Google Maps (REQUIRED for production) ─────────────────────${NC}"
echo -e "  One key, two API groups: Maps SDK (Android/iOS) for the apps AND"
echo -e "  Geocoding API + Places API for the server. Do NOT restrict it to"
echo -e "  Android/iOS only, or server reverse-geocoding is rejected. See deployment/README.md."
set_env "GOOGLE_MAPS_API_KEY" "GOOGLE_MAPS_API_KEY (REQUIRED — Geocoding+Places enabled)" true
echo ""

echo -e "${BLUE}── Optional ──────────────────────────────────────────────────${NC}"
set_env "GOOGLE_CLIENT_ID"    "GOOGLE_CLIENT_ID (optional — only for Google admin login)"
set_env "ADMIN_GOOGLE_EMAIL"  "ADMIN_GOOGLE_EMAIL (optional — email allowed for Google login)"
echo ""

chmod 600 "$ENV_FILE"
success ".env saved to ${ENV_FILE}"
echo ""
echo -e "${YELLOW}Now start the server:${NC}"
echo "  sudo -u ${ONWAY_SERVICE_USER:-onway} bash -c 'cd ${APP_DIR} && pm2 start ecosystem.config.js && pm2 save'"
echo ""
