import { createHmac } from "node:crypto";

const SECRET = process.env.JWT_SECRET || "onway-vendor-secret-2024";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export function createSigner(vendorId) {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ vendorId, role: "vendor", iat: Math.floor(Date.now() / 1000) });
  const sig = createHmac("sha256", SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}
