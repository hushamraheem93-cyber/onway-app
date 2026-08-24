/**
 * H-80 — the one place the fetch interceptors get installed.
 *
 * They used to be installed by two bare calls at module scope in
 * AuthContext.tsx:
 *
 *     installDriverAuthInterceptor();
 *     installAdminAuthInterceptor();
 *
 * which made patching global.fetch a side effect of importing the module. That
 * is not something a module should decide: it happens on import order, it
 * happens even in a test or a script that only wanted a type from the file, and
 * it happens again in any environment that evaluates the module more than once
 * (a second bundle chunk, a Fast Refresh cycle) — each evaluation bringing a
 * fresh `installed` flag with it, so the guards inside those functions cannot
 * see the previous installation.
 *
 * Installation is now an explicit, idempotent step the app performs once, from
 * AuthProvider. The flag lives here rather than in the two modules, so both
 * wrappers are installed together or not at all, and a re-render, a re-mount or
 * a second import cannot add another layer to the fetch chain.
 */
import { installDriverAuthInterceptor } from "@/lib/driverAuth";
import { installAdminAuthInterceptor } from "@/lib/adminAuth";

let installed = false;

/**
 * Install the driver and admin fetch interceptors. Safe to call any number of
 * times; only the first call does anything.
 */
export function installAuthInterceptors(): void {
  if (installed) return;
  installed = true;
  installDriverAuthInterceptor();
  installAdminAuthInterceptor();
}

