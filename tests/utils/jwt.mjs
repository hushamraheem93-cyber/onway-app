import { createHmac } from "node:crypto";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required for test JWT signing");
  return secret;
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export function createSigner(vendorId) {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ vendorId, role: "vendor", iat: Math.floor(Date.now() / 1000) });
  const sig = createHmac("sha256", getSecret())
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}
