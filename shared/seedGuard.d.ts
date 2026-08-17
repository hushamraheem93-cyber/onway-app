/**
 * Types for shared/seedGuard.mjs (H-68).
 *
 * The guard is plain JavaScript so that `scripts/seed-test-data.mjs` — which runs
 * under bare `node`, with no TypeScript loader — can import the same module the
 * server does. This file gives the TypeScript callers their types without
 * duplicating the logic.
 */
export declare const DEMO_SEED_OPT_IN: string;
export declare const DEMO_SEED_OPT_IN_VALUE: string;
export declare const NON_PRODUCTION_NODE_ENVS: string[];

/** Why a demo seed is refused, or null when it is permitted. */
export declare function demoSeedDenialReason(
  env?: NodeJS.ProcessEnv,
): string | null;

/** May this process seed demo data? Deny by default. */
export declare function isDemoSeedAllowed(env?: NodeJS.ProcessEnv): boolean;
