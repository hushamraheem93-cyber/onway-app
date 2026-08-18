# OnWay — VPS Deployment Guide

**Target:** Ubuntu 24.04 LTS (Hostinger VPS)  
**Stack:** Node.js 22 + PM2 + Nginx + Let's Encrypt SSL

---

## What you need before starting

| Item | Where to get it |
|------|----------------|
| VPS IP address | Hostinger control panel |
| SSH access (root) | Hostinger → VPS → SSH info |
| Domain name (optional) | Your DNS provider |
| GitHub PAT token | github.com/settings/tokens → "repo" scope |
| Firebase service account JSON | Firebase Console → Project Settings → Service accounts |
| OTPIQ API key | otpiq.com dashboard |
| **Google Maps API key (required)** | Google Cloud Console → APIs & Services → Credentials |
| Your admin credentials | You choose username + password |

> **Google Maps key is required in production.** The customer, vendor and driver apps
> all depend on maps and readable addresses. Enable **all four** APIs on the key:
> *Maps SDK for Android*, *Maps SDK for iOS* (apps) **and** *Geocoding API* + *Places API*
> (server reverse-geocoding). Keep billing active. Do **not** restrict the key to
> Android/iOS applications only, or the server's geocoding calls are rejected
> (`REQUEST_DENIED`) and every location silently falls back to raw coordinates — use a
> separate IP-restricted server key allowing the VPS if you want a restriction. The
> server logs a boot-time error (and a per-request `[geocode]` error) if the key is
> missing or rejected.

---

## Deployment — 5 steps

### Step 1 — SSH into your VPS
```bash
ssh root@YOUR_VPS_IP
```

### Step 2 — Authenticate to GitHub

The repository is **private**, so `git clone` needs a credential. Provide a
Personal Access Token with `repo` scope through the environment — never inside a
URL, a file, or your shell history:

```bash
read -rsp "GitHub PAT: " GITHUB_TOKEN && echo && export GITHUB_TOKEN
```

`read -rs` keeps the token off the screen; because the assignment is part of the
`read` command rather than a literal, the token itself never lands in
`~/.bash_history`.

> **Never** write the token into `git clone https://<token>@github.com/...`. That
> form is stored verbatim in `.git/config` on the server and leaks in every
> subsequent `git remote -v`.

Prefer SSH? Skip the token, add a **read-only deploy key** to the repository
(GitHub → Settings → Deploy keys), and run the setup script with
`ONWAY_CLONE_METHOD=ssh`.

### Step 3 — Fetch the setup script, then read it, then run it

```bash
# 1. clone the repository you are about to deploy
git clone https://github.com/hushamraheem93-cyber/onway-app.git /var/www/onway-app
cd /var/www/onway-app

# 2. confirm you are on the commit you intend to deploy
git log -1 --oneline

# 3. read the script before you execute it
less deployment/server-setup.sh

# 4. run it — as root, because it installs system packages
sudo -E bash deployment/server-setup.sh
```

This takes ~3 minutes. It installs Node.js 22, PM2 and Nginx, configures the
firewall, creates the unprivileged `onway` service user, and builds the server.

`sudo -E` preserves `GITHUB_TOKEN` for the script. Root is needed to install
packages — **the application itself never runs as root**; PM2 runs it as the
`onway` service user (see Step 5).

> **Why not `curl … | bash`?** Piping a URL straight into a root shell executes
> whatever that URL returns *at that moment*, unread and unverifiable — a
> compromised or swapped file runs as root before you can see a line of it. It
> also gives the script no terminal to prompt on, which is why the previous
> version's promised token prompt could never appear and the clone failed on this
> private repository. Cloning first means you deploy a commit you can name.

### Step 4 — Fill in your secrets
```bash
bash /var/www/onway-app/deployment/env-setup.sh
```
This walks you through every required value interactively. You will need:
- `JWT_SECRET` and `SESSION_SECRET` — generate with the command shown
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — you choose
- `FIREBASE_SERVICE_ACCOUNT` — paste the single-line JSON
- `OTP_IQ_API_KEY` — from otpiq.com

### Step 5 — Start the server
```bash
cd /var/www/onway-app
pm2 start ecosystem.config.js
pm2 save
```

**Verify it's running:**
```bash
pm2 status
curl http://localhost:5000/api/settings/public
```

---

## SSL (if you have a domain)

Make sure your domain's DNS A record points to the VPS IP first, then:

```bash
bash /var/www/onway-app/deployment/ssl-setup.sh
```

This installs the Let's Encrypt certificate, enables HTTPS, sets up auto-renewal, and updates your `.env` automatically.

---

## Updating code after changes

Every time you push new code from Replit to GitHub, run this on the VPS:

```bash
bash /var/www/onway-app/deployment/update.sh
```

Zero-downtime reload — PM2 keeps the server running while the new build loads.

---

## Useful commands

```bash
pm2 status                    # process status
pm2 logs onway --lines 50     # recent logs
pm2 reload onway              # reload after .env change
pm2 restart onway             # full restart
pm2 stop onway                # stop server

nginx -t                      # test nginx config
systemctl reload nginx        # reload nginx
certbot renew --dry-run       # test SSL auto-renewal

ufw status                    # firewall rules
```

---

## Directory structure on VPS

```
/var/www/onway-app/
├── server_dist/        ← compiled server (npm run build)
├── server/             ← source (not used at runtime)
├── uploads/            ← user-uploaded images (persisted across updates)
├── assets/             ← static category/product images
├── logs/               ← PM2 logs
├── .env                ← secrets (chmod 600, never committed)
└── ecosystem.config.js ← PM2 configuration
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `502 Bad Gateway` | `pm2 status` → start if stopped |
| CORS error in browser | Edit `ALLOWED_ORIGINS` in `.env`, then `pm2 reload onway` |
| Mobile app can't reach API | Check `EXPO_PUBLIC_API_BASE_URL` in `.env` |
| `Port 5000 already in use` | `fuser -k 5000/tcp` then `pm2 start ecosystem.config.js` |
| OTP always fails | Check `OTP_IQ_API_KEY` in `.env` |
| Firebase errors | Verify `FIREBASE_SERVICE_ACCOUNT` is valid single-line JSON |
| SSL renewal fails | `certbot renew --dry-run` — check domain DNS |

---

## Security checklist

- [ ] `NODE_ENV=production` set
- [ ] `DEV_MODE=false` set  
- [ ] Port 5000 is NOT reachable from outside (only Nginx proxies to it)
- [ ] `.env` permissions: `chmod 600 /var/www/onway-app/.env`
- [ ] SSL certificate installed and auto-renewing
- [ ] Firewall enabled: `ufw status`
- [ ] Firestore security rules deployed
