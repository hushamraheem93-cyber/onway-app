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

# ── ALLOWED_ORIGINS is a LIST, and writing to it is ADDITIVE ──────────────────
# H-47: this used to be
#     sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${DOMAIN}|" .env
# The `.*` swallowed the operator's entire list and left one entry behind, with no
# warning and no way to notice. Running a documented step must never silently
# discard configuration.
#
# merge_allowed_origins keeps every entry already in the file, appends the ones
# passed as arguments only when they are absent, and collapses duplicates. It
# removes nothing, ever.
#
# The rewrite goes through a temp file that is copied BACK OVER the original with
# `cat >` rather than `mv`: .env is owned by the service user and mode 600 (H-46),
# and mv would replace it with the temp file's ownership and permissions.
#
# NOTE: server-setup.sh carries a byte-identical copy of this function. Neither
# script can source the other: this one is run standalone on a server that may
# predate the checkout. (H-78 removed the `curl | bash` entry point, so the
# duplication is now only about ssl-setup.sh staying independently runnable.)
# A unit test asserts the two copies stay equal.
merge_allowed_origins() {
  local env_file="$1"; shift
  local current entry seen=""

  current="$(sed -n 's/^ALLOWED_ORIGINS=//p' "$env_file" | head -1)"

  for entry in ${current//,/ } "$@"; do
    entry="$(printf '%s' "$entry" | tr -d '[:space:]')"
    [[ -z "$entry" ]] && continue
    case ",${seen}," in *",${entry},"*) continue ;; esac
    seen="${seen:+$seen,}${entry}"
  done

  local tmp
  tmp="$(mktemp)"
  if grep -q '^ALLOWED_ORIGINS=' "$env_file"; then
    awk -v val="$seen" '
      /^ALLOWED_ORIGINS=/ && !replaced { print "ALLOWED_ORIGINS=" val; replaced = 1; next }
      { print }
    ' "$env_file" > "$tmp"
  else
    cat "$env_file" > "$tmp"
    printf 'ALLOWED_ORIGINS=%s\n' "$seen" >> "$tmp"
  fi
  cat "$tmp" > "$env_file"
  rm -f "$tmp"

  printf '%s' "$seen"
}

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

# Add this domain to ALLOWED_ORIGINS in .env — WITHOUT dropping what is there.
# H-78: derived from this script's own location (…/deployment/x.sh → the parent is
# the app root), the same rule update.sh already uses. It was hardcoded to
# /var/www/onway while server-setup.sh installs to /var/www/onway-app, so this
# wrote to a directory that does not exist on a real install. ONWAY_APP_DIR still
# overrides.
APP_DIR="${ONWAY_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
if [[ -f "${APP_DIR}/.env" ]]; then
  BEFORE="$(sed -n 's/^ALLOWED_ORIGINS=//p' "${APP_DIR}/.env" | head -1)"
  AFTER="$(merge_allowed_origins "${APP_DIR}/.env" "https://${DOMAIN}")"
  info "ALLOWED_ORIGINS before: ${BEFORE:-(empty)}"
  info "ALLOWED_ORIGINS after : ${AFTER}"

  # EXPO_PUBLIC_API_BASE_URL is deliberately NOT touched here.
  #
  # It is a build-time value: the mobile app reads process.env.EXPO_PUBLIC_API_BASE_URL,
  # which Expo bakes into the bundle when the binary is built. eas.json is what
  # supplies it. Nothing on this server reads the variable at runtime, so rewriting
  # it here would only produce a .env that looks authoritative while disagreeing
  # with what is actually shipped in the app.
  echo ""
  info "EXPO_PUBLIC_API_BASE_URL was NOT modified — on purpose."
  echo "    It is injected at Expo BUILD time from eas.json, not read at runtime here."
  echo "    To point the mobile app at this domain, change it in eas.json and rebuild:"
  echo "      eas build --profile production --platform ios"
  echo ""
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
