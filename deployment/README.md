# OnWay — VPS Deployment Guide

Manual deployment guide for Hostinger Ubuntu VPS (or any Ubuntu 22.04+ server).

> **This guide is for reference only.** Execute each step manually and verify before proceeding.

---

## Prerequisites

| Requirement | Minimum |
|-------------|---------|
| OS | Ubuntu 22.04 LTS |
| RAM | 2 GB |
| CPU | 2 vCPU |
| Disk | 20 GB SSD |
| Node.js | 20 LTS |
| Open ports | 22 (SSH), 80 (HTTP), 443 (HTTPS) |

---

## 1 — Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Verify versions
node -v    # should print v20.x.x
npm -v
pm2 -v
nginx -v
```

---

## 2 — Deploy the Project

```bash
# Create the app directory
sudo mkdir -p /var/www/onway
sudo chown $USER:$USER /var/www/onway

# Clone or upload your project
# Option A — Git
git clone https://github.com/YOUR_USERNAME/onway.git /var/www/onway

# Option B — SCP from your local machine
# scp -r ./onway user@YOUR_SERVER_IP:/var/www/onway

cd /var/www/onway

# Install dependencies
npm install --omit=dev

# Create logs directory (required by PM2)
mkdir -p logs
```

---

## 3 — Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit with your real values
nano .env
```

**Required variables — must be set before starting the server:**

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to `production` |
| `PORT` | Port Node.js listens on (default: `5000`) |
| `JWT_SECRET` | Long random string for JWT signing |
| `SESSION_SECRET` | Long random string for session signing |
| `ADMIN_USERNAME` | Admin panel username |
| `ADMIN_PASSWORD` | Admin panel password |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins (e.g. `https://yourdomain.com`) |
| `EXPO_PUBLIC_API_BASE_URL` | Full backend URL (e.g. `https://api.yourdomain.com`) — baked into mobile builds |
| `FIREBASE_SERVICE_ACCOUNT` | Full contents of Firebase service account JSON (single line) |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key |
| `OTP_IQ_API_KEY` | OTPIQ SMS gateway key |
| `DEV_MODE` | Set to `false` in production |

**Generate secure secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Run twice — once for `JWT_SECRET`, once for `SESSION_SECRET`.

---

## 4 — Build the Backend

```bash
cd /var/www/onway

# Build the server bundle (outputs to server_dist/)
npm run build

# Verify the output exists
ls -la server_dist/index.js
```

---

## 5 — Build the Mobile App (Static Bundle)

> This step bakes `EXPO_PUBLIC_API_BASE_URL` into the mobile app bundle.
> Run it **after** setting your domain in `.env`.

```bash
cd /var/www/onway

# Load env vars from .env
export $(grep -v '^#' .env | xargs)

# Build static Expo bundles (iOS + Android)
npm run expo:static:build

# Output: static-build/ (served by the Express server)
```

---

## 6 — Start with PM2

```bash
cd /var/www/onway

# Start the application
pm2 start ecosystem.config.js

# Check status
pm2 status
pm2 logs onway --lines 50

# Save PM2 process list (survives reboots)
pm2 save

# Generate and enable systemd startup script
pm2 startup
# ↑ This prints a command — copy and run it (it starts with "sudo env PATH=...")
```

**Common PM2 commands:**
```bash
pm2 restart onway     # restart the app
pm2 reload onway      # zero-downtime reload
pm2 stop onway        # stop the app
pm2 delete onway      # remove from PM2
pm2 logs onway        # tail live logs
pm2 monit             # live dashboard
```

---

## 7 — Configure Nginx

```bash
# Copy the example config (replace YOUR_DOMAIN with your actual domain)
sudo cp /var/www/onway/deployment/nginx.conf /etc/nginx/sites-available/onway

# Edit the file and replace YOUR_DOMAIN
sudo nano /etc/nginx/sites-available/onway

# Enable the site
sudo ln -sf /etc/nginx/sites-available/onway /etc/nginx/sites-enabled/onway

# Remove the default Nginx site (optional but recommended)
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Apply
sudo systemctl reload nginx
```

**Verify the proxy works (before SSL):**
```bash
curl -I http://YOUR_DOMAIN/api/settings/public
# Should return HTTP 200 or redirect
```

---

## 8 — SSL with Let's Encrypt

> Make sure your domain's DNS A record points to this server's IP before this step.

```bash
# Obtain certificate (Certbot will update nginx.conf automatically)
sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN

# Test auto-renewal
sudo certbot renew --dry-run
```

Certbot adds a cron job that renews certificates automatically. Confirm it:
```bash
sudo systemctl status certbot.timer
```

---

## 9 — Firewall

```bash
# Allow only SSH, HTTP, HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status

# Node.js port (5000) should NOT be public — only Nginx should reach it
# Verify it is not exposed:
sudo ufw status | grep 5000   # should show nothing
```

---

## 10 — Firestore / Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → **Project Settings** → **Service accounts**
3. Click **Generate new private key** → download JSON
4. Paste the entire JSON contents as a single line into `FIREBASE_SERVICE_ACCOUNT` in `.env`

**Deploy Firestore security rules:**
```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 11 — Health Check

After everything is running:

```bash
# Server responds
curl https://YOUR_DOMAIN/api/settings/public

# PM2 shows online
pm2 status

# Nginx is active
sudo systemctl status nginx

# No errors in logs
pm2 logs onway --lines 100
tail -n 50 /var/log/nginx/error.log
```

---

## Updating the Application

```bash
cd /var/www/onway

# Pull latest code
git pull origin main

# Install any new dependencies
npm install --omit=dev

# Rebuild server bundle
npm run build

# Rebuild mobile bundle if client code changed
export $(grep -v '^#' .env | xargs)
npm run expo:static:build

# Reload PM2 (zero downtime)
pm2 reload onway
```

---

## Directory Structure on VPS

```
/var/www/onway/
├── server/              # TypeScript source (not used at runtime)
├── server_dist/         # Compiled server — npm run build output
│   └── index.js
├── client/              # React Native source (not used at runtime)
├── static-build/        # Compiled mobile bundles — npm run expo:static:build output
├── uploads/             # User-uploaded files (persist across deploys)
├── logs/                # PM2 log files
├── .env                 # ← secrets (never commit)
├── ecosystem.config.js
└── deployment/
    ├── README.md
    └── nginx.conf
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `502 Bad Gateway` | Node.js not running | `pm2 status` → `pm2 start ecosystem.config.js` |
| `CORS error` in browser | `ALLOWED_ORIGINS` not set | Add your domain to `ALLOWED_ORIGINS` in `.env` and `pm2 reload onway` |
| Mobile app can't reach API | `EXPO_PUBLIC_API_BASE_URL` not set at build time | Rebuild with correct env var |
| `EADDRINUSE` on port 5000 | Duplicate process | `fuser -k 5000/tcp` then `pm2 start` |
| OTP always fails | `OTP_IQ_API_KEY` missing | Add key to `.env` |
| Admin login rejected | Wrong credentials | Check `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env` |
| Firebase errors | Bad service account | Verify JSON is single-line in `FIREBASE_SERVICE_ACCOUNT` |

---

## Security Checklist

- [ ] `NODE_ENV=production` is set
- [ ] `DEV_MODE=false` is set
- [ ] `JWT_SECRET` is at least 64 random characters
- [ ] `SESSION_SECRET` is at least 64 random characters
- [ ] Port 5000 is NOT publicly accessible (only via Nginx)
- [ ] SSL certificate is installed and auto-renewing
- [ ] Firewall is enabled (`ufw status`)
- [ ] `.env` file permissions: `chmod 600 .env`
- [ ] Firestore security rules are deployed
- [ ] `MASTER_RECOVERY_PASSWORD` is set to a strong value (or left empty to disable)
