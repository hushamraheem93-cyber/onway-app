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

APP_DIR="/var/www/onway"
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
set_env "ALLOWED_ORIGINS"         "ALLOWED_ORIGINS (e.g. https://api.example.com)"
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

echo -e "${BLUE}── Optional ──────────────────────────────────────────────────${NC}"
set_env "GOOGLE_MAPS_API_KEY" "GOOGLE_MAPS_API_KEY (optional)" true
set_env "GOOGLE_CLIENT_ID"    "GOOGLE_CLIENT_ID (optional — only for Google admin login)"
set_env "ADMIN_GOOGLE_EMAIL"  "ADMIN_GOOGLE_EMAIL (optional — email allowed for Google login)"
echo ""

chmod 600 "$ENV_FILE"
success ".env saved to ${ENV_FILE}"
echo ""
echo -e "${YELLOW}Now start the server:${NC}"
echo "  cd ${APP_DIR} && pm2 start ecosystem.config.js && pm2 save"
echo ""
