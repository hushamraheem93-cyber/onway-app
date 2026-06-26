# JWT_SECRET — Setup Guide

## What is it?

`JWT_SECRET` is a cryptographic secret used to sign and verify vendor authentication tokens (JWTs). It **must** be set before deploying to production. Without it, the server will **refuse to start**.

## Generate a Strong Secret

Run one of the following to generate a cryptographically secure random secret:

```bash
# Option 1: Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Option 2: OpenSSL
openssl rand -hex 64

# Option 3: Python
python3 -c "import secrets; print(secrets.token_hex(64))"
```

Example output (do NOT use this exact value):
```
3a8f2c1d9e4b7a6f5c2e8d1b4a7f3c6e9d2b5a8f1c4e7b0a3d6f9c2b5e8a1d4f7b0c3e6f9a2d5b8c1f4e7a0d3f6c9b2e5a8d1f4b7c0e3a6f9d2c5b8e1a4d7f0b3c6e9a2
```

## How to Add in Replit

1. Open your Replit project
2. Click **Secrets** (🔒 icon) in the left sidebar
3. Add a new secret:
   - **Key:** `JWT_SECRET`
   - **Value:** *(paste your generated secret)*
4. Click **Save**

## Security Rules

- **Never** commit the secret to Git
- **Never** share it in chat, issues, or documentation
- **Never** use the same secret for development and production
- Rotate it periodically (all vendor sessions will be invalidated on rotation)

## What Happens Without It?

| Environment | Behavior |
|---|---|
| **Production** (`NODE_ENV=production`) | Server refuses to start with `[FATAL]` error |
| **Development** | Server starts with a `[SECURITY] WARN` and uses an insecure dev fallback |

## Rotation

To rotate the secret:
1. Generate a new value as described above
2. Update the `JWT_SECRET` in Replit Secrets
3. Restart the server
4. All existing vendor sessions will be invalidated (vendors must log in again)
