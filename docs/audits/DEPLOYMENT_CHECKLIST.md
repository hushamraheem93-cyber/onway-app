# OnWay — Production Deployment Checklist

Use this checklist every time you deploy or update the server.
**All `REQUIRED` variables must be set before starting the app.**

---

## Environment Variables

### 🔴 REQUIRED — Server will refuse to start without these in production

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `NODE_ENV` | Must be `production` | Set to literal string `production` |
| `JWT_SECRET` | Signs all auth tokens | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `SESSION_SECRET` | Signs admin session cookies | Same command as above (use a different value) |
| `ADMIN_USERNAME` | Admin panel login name | You choose |
| `ADMIN_PASSWORD` | Admin panel password | You choose (use a strong password) |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK credentials | Firebase Console → Project Settings → Service accounts → Generate new private key → paste entire JSON as one line |
| `OTP_IQ_API_KEY` | SMS OTP delivery | otpiq.com dashboard |

### 🟠 REQUIRED for correct operation (server starts but features break without these)

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `ALLOWED_ORIGINS` | CORS allowed domains | Your domain(s), e.g. `https://api.example.com` |
| `EXPO_PUBLIC_API_BASE_URL` | Mobile app's API endpoint (baked at build time) | Your server URL, e.g. `https://api.example.com` |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase client SDK | Firebase Console → Project Settings → Your apps → Web app → Config |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase client SDK | Same source as above |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Firebase client SDK | Same source as above |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase client SDK | Same source as above |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase client SDK | Same source as above |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase client SDK | Same source as above |
| `GOOGLE_MAPS_API_KEY` | Map rendering in mobile app | Google Cloud Console → APIs & Services → Credentials |

### 🟡 OPTIONAL — Features degrade gracefully without these

| Variable | Description | Default / Behavior |
|----------|-------------|-------------------|
| `PORT` | HTTP port to listen on | `5000` |
| `MASTER_RECOVERY_PASSWORD` | Emergency admin password reset | Disabled when empty |
| `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase Analytics | Analytics disabled |
| `OTP_IQ_BASE_URL` | Custom OTPIQ endpoint | `https://api.otpiq.com/api` |
| `OTP_IQ_SENDER_ID` | OTPIQ sender name | OTPIQ default |
| `OTP_IQ_PROVIDER` | OTP channel (sms/whatsapp/telegram) | `auto` |
| `GOOGLE_CLIENT_ID` | Google OAuth for admin login | Google login disabled |
| `ADMIN_GOOGLE_EMAIL` | Email allowed for Google admin login | No Google login access |
| `DEV_MODE` | Enables `0000` OTP bypass | `false` — **never `true` in prod** |

---

## Pre-deploy Checks

### Code & Build
- [ ] `npm install` completes with no errors
- [ ] `npm run build` produces `server_dist/index.js` (no TypeScript errors)
- [ ] No `.env` file committed to git (`git ls-files | grep "^\.env"` returns nothing)
- [ ] No service account JSON committed (`git ls-files | grep "service.account"` returns nothing)

### Server
- [ ] `NODE_ENV=production` is set
- [ ] `DEV_MODE=false` (or not set)
- [ ] `PORT=5000` (or chosen port) is set
- [ ] `JWT_SECRET` is at least 64 random characters
- [ ] `SESSION_SECRET` is at least 64 random characters
- [ ] `.env` file permissions: `chmod 600 .env`

### Firebase
- [ ] `FIREBASE_SERVICE_ACCOUNT` is valid JSON on a single line
- [ ] All `EXPO_PUBLIC_FIREBASE_*` values match the same Firebase project
- [ ] Firestore security rules are deployed: `firebase deploy --only firestore:rules`
- [ ] Firestore indexes are deployed: `firebase deploy --only firestore:indexes`

### Network
- [ ] Domain's DNS A record points to the VPS IP
- [ ] Port 5000 is NOT publicly accessible (only Nginx proxies to it)
- [ ] UFW firewall allows only 22, 80, 443
- [ ] SSL certificate installed: `certbot --nginx -d yourdomain.com`
- [ ] SSL auto-renewal confirmed: `certbot renew --dry-run`

### PM2
- [ ] `pm2 start ecosystem.config.js` succeeds
- [ ] `pm2 save` run (survives reboots)
- [ ] `pm2 status` shows `onway` as `online`
- [ ] Health check: `curl http://localhost:5000/api/settings/public` returns 200

---

## Post-deploy Verification

```bash
# 1. Server is up
pm2 status
curl -s http://localhost:5000/api/settings/public | python3 -m json.tool

# 2. HTTPS works (after SSL install)
curl -s https://yourdomain.com/api/settings/public

# 3. Logs are clean
pm2 logs onway --lines 30

# 4. No obvious errors
grep -i "error\|fatal\|crash" /var/www/onway/logs/onway-error.log | tail -20
```

---

## Secret Rotation

If any secret is compromised:

| Secret | Rotation steps |
|--------|---------------|
| `JWT_SECRET` | Generate new value → update `.env` → `pm2 reload onway` → **all users are logged out** |
| `SESSION_SECRET` | Same as above → **all admin sessions invalidated** |
| `ADMIN_PASSWORD` | Update `.env` → `pm2 reload onway` |
| `FIREBASE_SERVICE_ACCOUNT` | Revoke old key in Firebase Console → generate new → update `.env` → `pm2 reload onway` |
| `OTP_IQ_API_KEY` | Regenerate in OTPIQ dashboard → update `.env` → `pm2 reload onway` |
| `GOOGLE_MAPS_API_KEY` | Restrict/regenerate in GCP → update `.env` → rebuild mobile bundle |

---

## Files That Must Never Be Committed

These patterns are in `.gitignore`. Verify with `git ls-files | grep -E`:

```
\.env$
service-account
firebase-adminsdk
\.pem$
\.key$
\.p12$
\.jks$
```
