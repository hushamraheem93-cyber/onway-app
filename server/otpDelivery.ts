// OTP delivery via OTPIQ (https://otpiq.com) — Iraq SMS / WhatsApp verification.
//
// OTPIQ is used purely as the delivery layer: we still generate, expire, rate-limit and
// verify our own 6-digit code (see firebase.ts). OTPIQ's "verification" SMS type accepts
// our code in `verificationCode` and delivers it, so all existing OTP business logic and
// API endpoints are unchanged.
//
// Confirmed API contract (rstacode/otpiq official package + api.otpiq.com):
//   POST {base}/sms
//   Authorization: Bearer <API_KEY>
//   body: { phoneNumber: "9647XXXXXXXXX", smsType: "verification",
//           verificationCode: "123456", senderId?, provider? }
//
// Credentials come ONLY from the environment (never hardcoded):
//   OTP_IQ_API_KEY    — required to actually send (sk_live_...)
//   OTP_IQ_BASE_URL   — optional, default https://api.otpiq.com/api
//   OTP_IQ_SENDER_ID  — optional approved sender id from the OTPIQ dashboard
//   OTP_IQ_PROVIDER   — optional default channel ("auto" | "sms" | "whatsapp" | "telegram")
//
// Delivery is best-effort: it never throws, and returns { delivered } so callers can
// report an accurate status without blocking the auth flow.

import { isDevMode } from "./env";

export type OtpChannel = "sms" | "whatsapp";

export interface OtpDeliveryResult {
  delivered: boolean;
  channel: OtpChannel;
  providerMessageId?: string;
}

/** Normalise an Iraqi phone number to OTPIQ's expected `9647XXXXXXXXX` form. */
export function normalizeIraqiPhone(raw: string): string {
  let p = (raw || "").replace(/[^\d]/g, ""); // strip +, spaces, dashes → digits only
  if (p.startsWith("00964")) p = p.slice(2); // 00964... → 964...
  if (p.startsWith("964")) return p;
  if (p.startsWith("0")) return "964" + p.slice(1); // 07XXXXXXXXX → 9647XXXXXXXXX
  if (p.startsWith("7")) return "964" + p; // 7XXXXXXXXX → 9647XXXXXXXXX
  return p;
}

export async function deliverOtp(
  phoneNumber: string,
  code: string,
  channel: OtpChannel = "sms",
): Promise<OtpDeliveryResult> {
  const apiKey = process.env.OTP_IQ_API_KEY;

  if (!apiKey) {
    // No credentials configured. In dev, log so testing is possible; never in real prod.
    if (isDevMode()) {
      console.log(`[OTP] (OTPIQ not configured) → ${phoneNumber}: ${code}`);
    } else {
      console.warn(`[OTP] OTP_IQ_API_KEY not set — code not delivered to ${phoneNumber}`);
    }
    return { delivered: false, channel };
  }

  const base = (process.env.OTP_IQ_BASE_URL || "https://api.otpiq.com/api").replace(/\/+$/, "");
  const provider = channel === "whatsapp" ? "whatsapp" : (process.env.OTP_IQ_PROVIDER || "auto");

  const body: Record<string, unknown> = {
    phoneNumber: normalizeIraqiPhone(phoneNumber),
    smsType: "verification",
    verificationCode: code,
    provider,
  };
  if (process.env.OTP_IQ_SENDER_ID) body.senderId = process.env.OTP_IQ_SENDER_ID;

  try {
    const res = await fetch(`${base}/sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      console.error(`[OTP] OTPIQ ${res.status} for ${phoneNumber}:`, data?.message || data?.error || res.statusText);
      return { delivered: false, channel };
    }
    return { delivered: true, channel, providerMessageId: data?.smsId };
  } catch (error) {
    console.error(`[OTP] OTPIQ delivery error for ${phoneNumber}:`, error);
    return { delivered: false, channel };
  }
}
