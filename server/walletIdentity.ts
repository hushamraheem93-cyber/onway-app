/**
 * H-72 — the driver's financial identity, separated from their phone number.
 *
 * Driver settlements are keyed `driver:${accountId}` (settlement.ts ledgerId /
 * accountKey), and accountId was the phone number. A phone number is not an
 * identity: it is reassigned. Deleting a driver left `settlementLedger/driver:
 * <phone>` behind — nothing deletes a ledger — and the next person to register
 * with that number resolved to the same document and inherited the debt, along
 * with the settlements, requests, payments and adjustments filed under the same
 * accountKey. Above the configured threshold (default 50,000 IQD) the inherited
 * balance also blocked them from going online or receiving a batch, so a brand
 * new driver could be locked out before their first delivery.
 *
 * A driver now carries `walletId` — minted once at registration, opaque, and
 * never derived from anything that can be reassigned or edited. Registering
 * again after a deletion creates a new driver document and therefore a new
 * walletId, so the old ledger stays where it is, under its own id, still
 * readable by the admin and still auditable. Nothing is renamed or merged.
 *
 * ── Why a legacy fallback, and why it takes the caller's phone ──────────────
 * Every driver already in production predates walletId and has a ledger at
 * `driver:<phone>`. Minting ids for them here would silently point their
 * balance at an empty document, so a driver without a walletId keeps resolving
 * to a phone — the SAME phone string the call site used before this change.
 *
 * That last part matters. The ledger id was built from the phone in the
 * driver's TOKEN, which production does not always store identically in the
 * driver document ("07…" in the token, "009647…" in Firestore — see the H-63
 * notes and the eviction comment in the delete route). Resolving a legacy
 * driver through `driver.phoneNumber` would therefore address a DIFFERENT
 * ledger than the one holding their money. So the fallback is the caller's
 * phone, passed in explicitly, and legacy behaviour is bit-for-bit unchanged.
 *
 * Backfilling walletId onto existing drivers is a data migration and is NOT
 * done here; it needs its own decision and a ledger rename. See the H-72 report.
 */
import { randomBytes } from "node:crypto";

/** Distinguishes a minted id from a phone number at a glance, in logs and in Firestore. */
export const DRIVER_WALLET_ID_PREFIX = "drv_";

/** `drv_` + 24 lowercase hex characters (12 random bytes). */
export const DRIVER_WALLET_ID_RE = /^drv_[0-9a-f]{24}$/;

/**
 * A fresh driver wallet id.
 *
 * 96 bits of randomness: collisions are not a practical concern, and unlike a
 * counter or a timestamp the value leaks nothing about the driver or about how
 * many drivers exist. `rand` is injectable so tests can pin the output.
 */
export function mintDriverWalletId(rand: () => string = () => randomBytes(12).toString("hex")): string {
  const hex = rand();
  const id = `${DRIVER_WALLET_ID_PREFIX}${hex}`;
  if (!DRIVER_WALLET_ID_RE.test(id)) {
    // A malformed id would be written straight onto a money document.
    throw new Error("mintDriverWalletId: generator did not produce 24 hex characters");
  }
  return id;
}

export function isMintedDriverWalletId(value: unknown): boolean {
  return typeof value === "string" && DRIVER_WALLET_ID_RE.test(value);
}

/**
 * The account id to use for this driver's money.
 *
 * `fallbackPhone` is the phone the CALLER holds (the token's, normally) and is
 * used only for drivers minted before walletId existed — see the note above on
 * why the driver document's own phone must not be substituted for it.
 *
 * Fails closed. If there is neither a minted id nor a usable phone, this throws
 * rather than returning something like "driver:undefined", which would collect
 * unrelated drivers' balances into one shared document.
 */
export function driverWalletIdOf(
  driver: { walletId?: unknown } | null | undefined,
  fallbackPhone: unknown,
): string {
  const minted = driver?.walletId;
  if (isMintedDriverWalletId(minted)) return minted as string;

  const phone = typeof fallbackPhone === "string" ? fallbackPhone.trim() : "";
  if (phone !== "") return phone;

  throw new Error("driverWalletIdOf: no wallet id and no phone — refusing to key a ledger");
}

/**
 * The account id for an admin-supplied value, which may be either a phone (the
 * admin panel lists drivers by phone) or an account id copied from the
 * settlement accounts list.
 *
 * `lookup` returns the driver document for a phone, or null. It is passed in so
 * this module stays free of Firestore and can be exercised directly in tests.
 *
 * A deleted driver has no document to resolve through, which is why the
 * settlement accounts list exposes `accountId`: passing that value takes the
 * first branch and reaches the ledger without needing the driver to exist.
 */
export async function resolveDriverAccountId(
  phoneOrAccountId: string,
  lookup: (phone: string) => Promise<{ walletId?: unknown } | null>,
): Promise<string> {
  if (isMintedDriverWalletId(phoneOrAccountId)) return phoneOrAccountId;
  const driver = await lookup(phoneOrAccountId).catch(() => null);
  return driverWalletIdOf(driver, phoneOrAccountId);
}
