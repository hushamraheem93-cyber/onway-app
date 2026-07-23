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
| Your admin credentials | You choose username + password |

---

## Deployment — 4 steps

### Step 1 — SSH into your VPS
```bash
ssh root@YOUR_VPS_IP
```

### Step 2 — Run the one-shot setup script
```bash
curl -fsSL https://raw.githubusercontent.com/hushamraheem93-cyber/onway-app/main/deployment/server-setup.sh | bash
```
This takes ~3 minutes. It installs Node.js 22, PM2, Nginx, configures the firewall, clones the repo, and builds the server.

You will be asked for:
- Your **domain name** (or press Enter to skip for now)
- Your **GitHub PAT token** (to clone the private repo)

### Step 3 — Fill in your secrets
```bash
bash /var/www/onway/deployment/env-setup.sh
```
This walks you through every required value interactively. You will need:
- `JWT_SECRET` and `SESSION_SECRET` — generate with the command shown
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — you choose
- `FIREBASE_SERVICE_ACCOUNT` — paste the single-line JSON
- `OTP_IQ_API_KEY` — from otpiq.com

### Step 4 — Start the server
```bash
cd /var/www/onway
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
bash /var/www/onway/deployment/ssl-setup.sh
```

This installs the Let's Encrypt certificate, enables HTTPS, sets up auto-renewal, and updates your `.env` automatically.

---

## Updating code after changes

Every time you push new code from Replit to GitHub, run this on the VPS:

```bash
bash /var/www/onway/deployment/update.sh
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
/var/www/onway/
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
- [ ] `.env` permissions: `chmod 600 /var/www/onway/.env`
- [ ] SSL certificate installed and auto-renewing
- [ ] Firewall enabled: `ufw status`
- [ ] Firestore security rules deployed
