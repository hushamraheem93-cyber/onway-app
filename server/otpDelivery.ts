// Pluggable OTP delivery (SMS / WhatsApp).
//
// The system previously generated an OTP but never delivered it, so real users could
// not receive a code. This module wires a delivery path that works as soon as a
// provider is configured via environment variables, and degrades gracefully (logging
// in dev, reporting delivered=false) when none is set — never throwing, so the auth
// flow is unaffected either way.
//
// Configure a gateway (any HTTP endpoint that accepts JSON { to, message }):
//   OTP_SMS_ENDPOINT       — SMS gateway URL
//   OTP_WHATSAPP_ENDPOINT  — WhatsApp gateway URL (optional)
//   OTP_DELIVERY_AUTH      — optional value sent as the Authorization header
//
// Backward compatible: callers get { delivered, channel } and can surface an accurate
// status, but delivery failures never block issuing/verifying the code.

export type OtpChannel = "sms" | "whatsapp";

export interface OtpDeliveryResult {
  delivered: boolean;
  channel: OtpChannel;
}

export async function deliverOtp(
  phoneNumber: string,
  code: string,
  channel: OtpChannel = "sms",
): Promise<OtpDeliveryResult> {
  const message = `رمز التحقق الخاص بك في OnWay هو: ${code}`;
  const endpoint =
    channel === "whatsapp" ? process.env.OTP_WHATSAPP_ENDPOINT : process.env.OTP_SMS_ENDPOINT;

  if (!endpoint) {
    // No provider configured. In dev, log so testing is possible; never in real prod.
    if (process.env.ALLOW_DEV_OTP === "true" && process.env.REPLIT_DEPLOYMENT !== "1") {
      console.log(`[OTP] (no ${channel} provider configured) → ${phoneNumber}: ${code}`);
    } else {
      console.warn(`[OTP] no ${channel} provider configured — code not delivered to ${phoneNumber}`);
    }
    return { delivered: false, channel };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OTP_DELIVERY_AUTH ? { Authorization: process.env.OTP_DELIVERY_AUTH } : {}),
      },
      body: JSON.stringify({ to: phoneNumber, message }),
    });
    if (!res.ok) {
      console.error(`[OTP] ${channel} gateway returned ${res.status} for ${phoneNumber}`);
      return { delivered: false, channel };
    }
    return { delivered: true, channel };
  } catch (error) {
    console.error(`[OTP] ${channel} delivery error for ${phoneNumber}:`, error);
    return { delivered: false, channel };
  }
}
