/**
 * H-63 — phone-identity migration DRY RUN. Reports only; writes nothing.
 *
 *   npx tsx server/scripts/phone-identity-dryrun.ts
 *
 * 27 user documents belong to 23 people: 15 are not stored in the canonical
 * `07XXXXXXXXX` form, 10 of those cannot be canonicalised at all, and 4 people
 * hold two documents each because the old client's spelling made their first
 * document unfindable and the app offered them registration a second time. The
 * `pushTokens` collection has 20 documents, 9 keyed by a pre-H-52 raw phone.
 *
 * Reconciling that is a production data change, so this script exists to size and
 * de-risk it WITHOUT performing it.
 *
 * Safety, by construction rather than by discipline:
 *   • the Firestore handle is wrapped so that set/update/delete/add/commit/create
 *     throw if anything ever calls them — a future edit cannot quietly start writing
 *   • every phone is masked as 07****567; no full number is ever printed
 *
 * What it answers:
 *   • how many records are affected
 *   • whether two documents belong to one person (a CONFLICT needing a human)
 *   • whether a value can be recovered at all
 *   • whether anyone holds more than one push token document
 *   • whether a rename would lose a token or a notification preference
 */
import admin from "firebase-admin";
import {
  canonicalIraqiPhone,
  isCanonicalIraqiPhone,
  maskPhone,
} from "../../shared/phone";

/** Wrap a Firestore instance so every mutating method throws. */
function readOnly<T extends object>(target: T): T {
  const FORBIDDEN = new Set([
    "set",
    "update",
    "delete",
    "add",
    "create",
    "commit",
    "batch",
    "runTransaction",
    "bulkWriter",
    "recursiveDelete",
  ]);
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === "string" && FORBIDDEN.has(prop)) {
        throw new Error(
          `DRY RUN: refusing to call Firestore.${prop}() — this script must never write`,
        );
      }
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(obj, args);
          return out && typeof out === "object" ? readOnly(out as object) : out;
        };
      }
      return value && typeof value === "object"
        ? readOnly(value as object)
        : value;
    },
  }) as T;
}

interface UserRow {
  id: string;
  raw: string;
  canonical: string;
  identity: string;
}

/**
 * The identity behind a value `canonicalIraqiPhone` cannot resolve.
 *
 * The pre-H-52 screen sent `00964${typed}`, so someone who typed `07701234567`
 * was stored as `0096407701234567` — country code plus the local form, leading
 * zero and all. Canonicalising that gives `007701234567`, which is not a valid
 * number: the rule assumes what follows the country code is the subscriber part
 * `7XXXXXXXXX`, and here it is the local part `07XXXXXXXXX`.
 *
 * This strips the country code and then normalises whatever is left, which
 * recovers the subscriber for both spellings.
 *
 * It exists HERE and not in shared/phone.ts on purpose. Accepting a sixteen-digit
 * string is right when reading a record the old client wrote; it would be wrong at
 * the login door, where H-52 deliberately refuses that shape rather than guess.
 * Migration tooling may be lenient about history; authentication may not.
 */
function recoveredIdentity(raw: string): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00964")) d = d.slice(5);
  else if (d.startsWith("964")) d = d.slice(3);
  if (d.startsWith("7")) d = "0" + d;
  return d;
}

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error("FIREBASE_SERVICE_ACCOUNT is not set — nothing to inspect.");
    process.exit(1);
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  const db = readOnly(admin.firestore());

  console.log(
    "H-63 PHONE IDENTITY — DRY RUN (no writes, numbers masked)\n" +
      "=".repeat(70),
  );

  // ── users ────────────────────────────────────────────────────────────────
  const usersSnap = await db.collection("users").select("phoneNumber").get();
  const users: UserRow[] = usersSnap.docs.map((d: any) => {
    const value = String(d.data().phoneNumber ?? "");
    return {
      id: d.id,
      raw: value,
      canonical: canonicalIraqiPhone(value),
      identity: recoveredIdentity(value),
    };
  });

  // Group by the RECOVERED identity, not by the canonical form. Grouping by the
  // canonical form hides exactly the duplicates that matter: `0096407701234567`
  // canonicalises to `007701234567` and `07701234567` to itself, so the two
  // documents belonging to one person look like two different people.
  const byIdentity = new Map<string, UserRow[]>();
  for (const u of users) {
    if (!byIdentity.has(u.identity)) byIdentity.set(u.identity, []);
    byIdentity.get(u.identity)!.push(u);
  }

  const needRewrite = users.filter((u) => u.raw !== u.identity);
  const notCanonicalisable = users.filter(
    (u) => !isCanonicalIraqiPhone(u.canonical),
  );
  const recoverable = notCanonicalisable.filter((u) =>
    isCanonicalIraqiPhone(u.identity),
  );
  const unrecoverable = notCanonicalisable.filter(
    (u) => !isCanonicalIraqiPhone(u.identity),
  );
  const mergeConflicts = [...byIdentity.entries()].filter(
    ([, rows]) => rows.length > 1,
  );

  console.log("\nUSERS");
  console.log(`  documents                       : ${users.length}`);
  console.log(`  distinct identities             : ${byIdentity.size}`);
  console.log(`  documents needing a rewrite     : ${needRewrite.length}`);
  console.log(`  stored as 00964 + local form    : ${recoverable.length}`);
  console.log(`  not recoverable at all          : ${unrecoverable.length}`);
  console.log(`  identities held by >1 document  : ${mergeConflicts.length}`);
  for (const [identity, rows] of mergeConflicts) {
    console.log(
      `    ⚠ CONFLICT ${maskPhone(identity)} — ${rows.length} documents; a human must choose which survives`,
    );
  }
  for (const u of unrecoverable) {
    console.log(
      `    ⚠ MALFORMED ${maskPhone(u.identity)} — no valid number can be derived; leave untouched`,
    );
  }

  // ── pushTokens ───────────────────────────────────────────────────────────
  const tokensSnap = await db.collection("pushTokens").get();
  const tokens = tokensSnap.docs.map((d: any) => {
    const data = d.data();
    const value = String(data.phoneNumber ?? "");
    const canonical = canonicalIraqiPhone(value || d.id.replace(/_/g, ""));
    return {
      id: d.id,
      canonical,
      wantedId: canonical.replace(/[^a-zA-Z0-9]/g, "_"),
      hasToken: !!data.pushToken,
      hasPrefs: !!data.notificationPrefs,
    };
  });

  const tokensByCanonical = new Map<string, typeof tokens>();
  for (const t of tokens) {
    if (!tokensByCanonical.has(t.canonical))
      tokensByCanonical.set(t.canonical, [] as any);
    tokensByCanonical.get(t.canonical)!.push(t);
  }
  const misKeyed = tokens.filter((t) => t.id !== t.wantedId);
  const tokenConflicts = [...tokensByCanonical.entries()].filter(
    ([, rows]) => rows.length > 1,
  );

  console.log("\nPUSH TOKENS");
  console.log(`  documents                       : ${tokens.length}`);
  console.log(`  ids not derived from canonical  : ${misKeyed.length}`);
  console.log(`  identities with >1 document     : ${tokenConflicts.length}`);
  for (const [canonical, rows] of tokenConflicts) {
    const withToken = rows.filter((r) => r.hasToken).length;
    const withPrefs = rows.filter((r) => r.hasPrefs).length;
    console.log(
      `    ⚠ CONFLICT ${maskPhone(canonical)} — ${rows.length} documents, ` +
        `${withToken} carry a token, ${withPrefs} carry preferences`,
    );
    console.log(
      `      → merging would need a rule for which token and which preferences win`,
    );
  }

  // ── what a migration would have to do ────────────────────────────────────
  console.log("\nPROPOSED PLAN (not executed)");
  const safeUserRewrites = needRewrite.filter(
    (u) =>
      isCanonicalIraqiPhone(u.identity) &&
      byIdentity.get(u.identity)!.length === 1,
  );
  console.log(
    `  1. users: rewrite phoneNumber in place on ${safeUserRewrites.length} documents`,
  );
  console.log(
    `     (document ids are Firestore-generated, so no id changes and no re-parenting)`,
  );
  console.log(
    `  2. users: ${mergeConflicts.length} identities need a MANUAL merge decision first`,
  );
  console.log(
    `     - both documents belong to one person; which profile, addresses and`,
  );
  console.log(
    `       order history survive is a business decision, not a derivable one`,
  );
  console.log(
    `  3. users: ${unrecoverable.length} documents hold no derivable number — leave them alone`,
  );
  console.log(
    `  4. pushTokens: ${misKeyed.length} documents would move to a canonical id`,
  );
  console.log(
    `     - copy the newest token + preferences onto the canonical document`,
  );
  console.log(`     - only then delete the legacy document, in the same batch`);
  console.log(
    `  5. pushTokens: ${tokenConflicts.length} identities need a MANUAL merge decision`,
  );
  console.log(
    `  6. re-run this dry run afterwards; every counter above must read 0`,
  );

  console.log("\nWHY NOTHING RUNS AUTOMATICALLY");
  console.log(
    "  A rename that hits an existing document would silently discard one side. A",
  );
  console.log(
    "  merge picks whose profile and whose order history survive, and which device",
  );
  console.log(
    "  keeps receiving notifications. None of that is inferable from the data —",
  );
  console.log("  they are decisions for the operator.");

  console.log(
    "\nNOTE: the running server now reaches every one of these documents (H-63 widened",
  );
  console.log(
    "      the read path), so no customer is locked out while this stays pending. What",
  );
  console.log(
    "      the migration buys is consolidation: today four people still own two",
  );
  console.log(
    "      documents each, and only one of the two is the one they are using.",
  );
  console.log("=".repeat(70));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("dry run failed:", err?.message ?? err);
    process.exit(1);
  },
);
