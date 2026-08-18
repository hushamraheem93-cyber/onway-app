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
# NOTE: ssl-setup.sh carries a byte-identical copy of this function. Neither
# script can source the other: ssl-setup.sh is run standalone on a server that may
# predate this checkout. (H-78 removed the `curl | bash` entry point, so this
# script now DOES have its siblings on disk — the duplication is kept only so
# ssl-setup.sh stays independently runnable.) A unit test asserts the two copies
# stay equal.
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

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  OnWay — Production Server Setup                              ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Configuration prompts ─────────────────────────────────────────────────────
read -rp "$(echo -e "${YELLOW}Domain name${NC} (e.g. api.example.com — or press Enter to use server IP): ")" DOMAIN
echo ""

GITHUB_REPO="hushamraheem93-cyber/onway-app"
APP_DIR="/var/www/onway-app"
# H-46: the Node process used to run as root, so any flaw in an upload path or in
# sharp's native image decoding escalated straight to full control of the box —
# including .env, which holds a Firebase service account with unrestricted admin
# rights. It runs as this unprivileged system user now. Root is still needed for
# the SETUP itself (apt, nginx, ufw, certbot) — that part is unavoidable and ends
# when the script does.
SERVICE_USER="onway"
NODE_VERSION="22"

# ── Service account (H-46) ────────────────────────────────────────────────────
# A system user with no login shell and no password. It owns the application and
# is the only identity the running server ever has.
#
# This block MUST come after SERVICE_USER is assigned. It used to sit above the
# configuration section, where the variable did not exist yet: under
# `set -euo pipefail` the unset reference aborted the script with
# "SERVICE_USER: unbound variable" on its very first real step — so on a fresh
# VPS the service user was never created and the whole H-46 hardening below
# never ran. Nothing downstream reported it, because the script was already dead.
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/${SERVICE_USER}" \
          --shell /usr/sbin/nologin --comment "OnWay application service" "$SERVICE_USER"
  success "Service user ${SERVICE_USER} created (no shell, no password)"
else
  success "Service user ${SERVICE_USER} already exists"
fi

# A PM2 daemon left over from a root-era install would keep running the server as
# root and fight this one for port 5000. Detect it and stop, rather than silently
# creating a second daemon — killing someone's live production process is the
# operator's call, not this script's.
if pgrep -u root -f "PM2.*God Daemon" >/dev/null 2>&1; then
  err "A root-owned PM2 daemon is running. Migrate it before continuing:
    pm2 delete onway || true
    pm2 unstartup systemd || true
    pm2 kill
  then re-run this script."
fi

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
  # H-78: the ONE remaining pipe-into-shell, and a deliberate exception. This is
  # NodeSource's own signed apt-repository installer over TLS from their domain —
  # the vendor-documented way to add the repo, and the same trust decision as
  # `apt-get install` itself. What H-78 removed was piping OUR deployment script
  # from a raw file host into a root shell, unread. A test pins this as the only
  # occurrence so a second one cannot appear unnoticed.
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

# ── Repository authentication (H-78) ──────────────────────────────────────────
#
# The README promised "you will be asked for your GitHub PAT" while this script
# had exactly one prompt — for the domain — and cloned a PRIVATE repository over
# anonymous HTTPS. It could only ever fail here. Worse, the documented entry
# point was `curl … | bash`, which leaves the script no terminal to prompt on, so
# even adding a prompt would not have helped.
#
# The token is taken from the environment (`sudo -E`), and only falls back to an
# interactive prompt when a terminal is actually attached.
#
# It is NEVER written into the clone URL. That form is persisted verbatim into
# .git/config and then leaks from every `git remote -v`, every `git pull` error
# and every backup of the server. GIT_ASKPASS hands the credential to git for the
# duration of this process and nothing else.
CLONE_METHOD="${ONWAY_CLONE_METHOD:-https}"

if [[ "$CLONE_METHOD" == "ssh" ]]; then
  CLONE_URL="git@github.com:${GITHUB_REPO}.git"
  info "Cloning over SSH — expecting a deploy key on this server."
else
  CLONE_URL="https://github.com/${GITHUB_REPO}.git"

  if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    if [[ -t 0 ]]; then
      # -s: never echoed to the screen or captured in scrollback.
      read -rsp "$(echo -e "${YELLOW}GitHub PAT${NC} (repo scope, input hidden): ")" GITHUB_TOKEN
      echo ""
    fi
  fi

  if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    err "GITHUB_TOKEN is not set and there is no terminal to prompt on.
       ${GITHUB_REPO} is private, so an anonymous clone cannot succeed.
       Export a token first:  read -rsp 'GitHub PAT: ' GITHUB_TOKEN && export GITHUB_TOKEN
       then re-run with:      sudo -E bash deployment/server-setup.sh
       Or use a deploy key:   ONWAY_CLONE_METHOD=ssh sudo -E bash deployment/server-setup.sh"
  fi

  # Hands the token to git without it touching the URL, the disk copy of the
  # repo config, or the process list. Removed on exit, however the script ends.
  GIT_ASKPASS_FILE="$(mktemp)"
  trap 'rm -f "$GIT_ASKPASS_FILE"' EXIT
  chmod 700 "$GIT_ASKPASS_FILE"
  cat > "$GIT_ASKPASS_FILE" <<'ASKPASS'
#!/usr/bin/env bash
case "$1" in
  Username*) echo "x-access-token" ;;
  Password*) echo "${GITHUB_TOKEN}" ;;
esac
ASKPASS
  export GIT_ASKPASS="$GIT_ASKPASS_FILE"
  export GIT_TERMINAL_PROMPT=0   # fail instead of hanging on a hidden prompt
fi

if [[ -d "${APP_DIR}/.git" ]]; then
  info "Repository already exists — pulling latest..."
  cd "$APP_DIR"
  # `set -e` covers this, but the message an operator sees matters: a failed pull
  # here otherwise looks like a build failure three steps later.
  git pull origin main \
    || err "git pull failed. Check the token's 'repo' scope and that ${GITHUB_REPO} is reachable."
else
  info "Cloning repository..."
  git clone "$CLONE_URL" "$APP_DIR" \
    || err "git clone failed for ${GITHUB_REPO}.
       Most likely the token is missing the 'repo' scope, has expired, or the
       repository name is wrong. Nothing was installed."
  cd "$APP_DIR"
fi

# Prove the working tree is real before anything is built from it.
git rev-parse --verify HEAD >/dev/null 2>&1 \
  || err "no commit checked out at ${APP_DIR} — the clone did not complete."
info "Deploying commit: $(git log -1 --format='%h %s')"
success "Repository ready at ${APP_DIR}"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. Install dependencies & build
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
info "Installing npm dependencies..."
# H-48: see the same change in update.sh. `npm ci` installs exactly the locked tree
# and never rewrites package-lock.json, so no unreviewed package can enter here and
# the tracked lockfile stays clean for later `git pull`s.
npm ci --prefer-offline --no-audit --no-fund 2>&1 | tail -3
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

# H-46: everything the service touches belongs to the service user. The build ran
# as root above, so the tree is re-owned here rather than built twice.
#
# What the server actually needs, verified against the code rather than assumed:
#   • read  APP_DIR (server_dist, static assets, .env)
#   • write logs/ — PM2 writes these
#   • NOTHING else: every multer instance uses memoryStorage() and images go to
#     Firebase Storage, so the process writes no files at all. /uploads is served
#     read-only for legacy paths. Session revocation state lives in Firestore.
#   • port 5000 is above 1024, so no capability and no root are required.
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$APP_DIR"
chmod 750 "$APP_DIR"
chmod 700 "${APP_DIR}/logs"
success "Directory structure ready (owned by ${SERVICE_USER})"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. .env file (template — user must fill values)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ ! -f "${APP_DIR}/.env" ]]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  # H-46: 600 alone was not protection while the reader was root. Owned by the
  # service user and readable by nobody else.
  chown "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"

  # Pre-fill NODE_ENV and PORT
  sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "${APP_DIR}/.env"
  sed -i 's/^PORT=.*/PORT=5000/'               "${APP_DIR}/.env"
  sed -i 's/^DEV_MODE=.*/DEV_MODE=false/'       "${APP_DIR}/.env"

  # Add the domain to ALLOWED_ORIGINS if one was given — additive, never a replace.
  # (.env was just copied from .env.example, so the list is normally empty here.
  # It is still merged rather than overwritten: re-running this script on a server
  # whose .env already carries a list must not throw that list away.)
  if [[ -n "${DOMAIN:-}" ]]; then
    MERGED="$(merge_allowed_origins "${APP_DIR}/.env" "https://${DOMAIN}")"
    info "ALLOWED_ORIGINS=${MERGED}"
  fi

  # EXPO_PUBLIC_API_BASE_URL is deliberately left as the template's empty value.
  # It is baked into the mobile bundle at Expo BUILD time from eas.json; no server
  # module reads it at runtime. Writing it here would produce a .env that looks
  # authoritative while disagreeing with the binary that is actually shipped.
  warn "EXPO_PUBLIC_API_BASE_URL is NOT set by this script — it comes from eas.json"
  warn "at Expo build time. Change it there and rebuild to repoint the mobile app."

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

    # ── C-15: these used to live in the commented-out HTTPS block below ───────
    # `certbot --nginx` builds the TLS server block by COPYING this one. Anything
    # that sits in a comment is not copied, so the rate limits and the security
    # headers were never applied — not on port 80, and not on 443 after SSL was
    # installed either. They are part of the live block now, which is the only
    # way certbot carries them across.
    #
    # HSTS on a plaintext response is ignored by browsers (RFC 6797 §7.2), so
    # declaring it here is harmless before SSL and correct the moment certbot
    # clones this block.
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options           "SAMEORIGIN"  always;
    add_header X-Content-Type-Options    "nosniff"     always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;

    client_max_body_size 20M;
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;

    # Admin login — strict limit. An exact-match location outranks the /api/
    # prefix below regardless of the order they appear in, so the stricter rule
    # can never be shadowed by the looser one.
    location = /api/admin/login {
        limit_req zone=onway_login burst=3 nodelay;
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /api/ {
        limit_req zone=onway_api burst=60 nodelay;
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Socket.IO deliberately carries NO limit_req: a WebSocket is one long-lived
    # connection, and a per-request limiter would drop live order tracking.
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
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
    }
}
# The HTTPS server block is NOT written here, and must not be: \`certbot --nginx\`
# generates it from the block above and manages its certificate paths. A
# hand-written 443 block would either conflict with it or, as the commented-out
# one that used to sit here did, quietly hold the only copy of the security
# headers while never being parsed by nginx at all.
#
# Run deployment/ssl-setup.sh to obtain the certificate and turn port 80 into a
# redirect. Until then this server answers plaintext on port 80 — see the
# warning printed at the end of this script.

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
# H-46: was `-u root --hp /root`, which made the boot-time resurrection run the
# server as root on every reboot even if it had been started as someone else.
pm2 startup systemd -u "$SERVICE_USER" --hp "/home/${SERVICE_USER}" | tail -1 | bash 2>/dev/null || true
success "PM2 startup configured for ${SERVICE_USER}"

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
echo -e "${YELLOW}STEP 2 — Start the server (as the service user, NOT as root):${NC}"
echo "  sudo -u ${SERVICE_USER} bash -c 'cd ${APP_DIR} && pm2 start ecosystem.config.js && pm2 save'"
echo ""
# C-15: SSL used to be listed here as "optional", pointing at a bare certbot call.
# Following that produced exactly the server the audit described — admin passwords,
# vendor tokens, driver sessions and OTP codes crossing port 80 in the clear. It is
# a required step now, and it names ssl-setup.sh rather than certbot directly:
# ssl-setup.sh is the one that checks the certificate actually brought the rate
# limits and security headers into the HTTPS block, and that merges the domain into
# ALLOWED_ORIGINS instead of overwriting the list.
echo -e "${RED}STEP 3 — REQUIRED — Install SSL:${NC}"
echo -e "${RED}  Until this runs, port 80 serves EVERYTHING IN PLAINTEXT:${NC}"
echo "    admin login credentials, vendor tokens, driver sessions, OTP codes,"
echo "    and customer addresses."
echo "  Point your domain's A record at this server, then run:"
echo "    sudo bash ${APP_DIR}/deployment/ssl-setup.sh"
echo "  (It runs certbot, then FAILS if the HTTPS block is missing any header or"
echo "   rate limit — do not treat the site as secured until it prints OK.)"
echo ""
echo -e "${YELLOW}STEP 4 — Verify:${NC}"
echo "  sudo -u ${SERVICE_USER} pm2 status"
echo "  curl http://localhost:5000/api/settings/public"
echo "  # must print ${SERVICE_USER}, never root:"
echo "  ps -o user= -p \$(sudo -u ${SERVICE_USER} pm2 jlist | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).find(x=>x.name==='onway');console.log(a?a.pid:'')})\")"
echo ""
echo -e "${GREEN}Need to update code later? Run: bash ${APP_DIR}/deployment/update.sh${NC}"
echo ""
