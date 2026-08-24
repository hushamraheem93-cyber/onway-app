/**
 * H-80 — one in-memory source of truth for auth tokens.
 *
 * The driver and admin fetch interceptors called `getToken()` on EVERY request
 * just to attach an Authorization header. `getToken` is not a variable read: on
 * device it is `SecureStore.getItemAsync`, an IPC round-trip to the iOS Keychain
 * or the Android Keystore. The audit measured 10–40 ms of that per request, on
 * every driver poll and every admin call, for a whole shift — to fetch a value
 * that had not changed since login.
 *
 * The token now lives in memory and the store is read once per key, lazily. That
 * is only safe if memory is the single place the value is decided, so every
 * write goes through here too: `rememberToken` on login and refresh,
 * `forgetToken` on logout. Nothing else may call setToken/removeToken for a
 * cached key — that would leave memory holding a value the store no longer has.
 *
 * ── Why this is not a stale-credential risk ────────────────────────────────
 *   • a write updates memory and the store in the same call, so the next request
 *     uses the new value immediately;
 *   • a clear removes both, and a subsequent read returns null rather than
 *     falling back to the store, so a token cannot come back after logout;
 *   • concurrent first-reads share ONE in-flight store read instead of racing,
 *     so ten simultaneous requests cannot produce ten Keychain hits or ten
 *     different answers.
 *
 * Nothing here logs a token value.
 */
import { getToken, setToken, removeToken } from "@/lib/secureTokenStorage";

/** null is a real cached answer ("no token"); undefined means "not read yet". */
type Entry = {
  value: string | null;
  primed: boolean;
  inFlight: Promise<string | null> | null;
};

const cache = new Map<string, Entry>();

function entryFor(key: string): Entry {
  let e = cache.get(key);
  if (!e) {
    e = { value: null, primed: false, inFlight: null };
    cache.set(key, e);
  }
  return e;
}

/**
 * The token for `key`, from memory when known.
 *
 * Reads the secure store only on the first call after start-up or after
 * `invalidateToken`, and collapses concurrent first-reads into one.
 */
export async function readToken(key: string): Promise<string | null> {
  const e = entryFor(key);
  if (e.primed) return e.value;
  if (e.inFlight) return e.inFlight;

  e.inFlight = (async () => {
    try {
      const v = await getToken(key);
      // A write that lands while this read is in flight wins: it primes the
      // entry, and overwriting here would resurrect the value it replaced.
      if (!e.primed) {
        e.value = v;
        e.primed = true;
      }
      return e.value;
    } finally {
      e.inFlight = null;
    }
  })();

  return e.inFlight;
}

/** Persist a token and make it the value every subsequent request uses. */
export async function rememberToken(key: string, value: string): Promise<void> {
  const e = entryFor(key);
  e.value = value;
  e.primed = true;
  await setToken(key, value);
}

/** Remove a token from the store and from memory. */
export async function forgetToken(key: string): Promise<void> {
  const e = entryFor(key);
  e.value = null;
  // Stays primed: a read after logout must answer "no token" from memory rather
  // than going back to the store, which is what would let a race resurrect it.
  e.primed = true;
  await removeToken(key);
}

/**
 * Drop the cached answer so the next read consults the store again.
 *
 * For the case where something outside this module changed the stored value.
 */
export function invalidateToken(key: string): void {
  cache.delete(key);
}

