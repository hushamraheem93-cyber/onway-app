/**
 * M-80…M-83 — making the app right-to-left on the FIRST launch, not the second.
 *
 * `I18nManager.forceRTL(true)` does not lay the current session out again. It writes
 * a native flag that the platform reads when it starts, so the launch that sets it
 * still draws left-to-right and only the NEXT one is correct. The app called it from
 * two module bodies (client/constants/theme.ts and client/App.tsx), so every fresh
 * install opened mirrored once and then "fixed itself" — which is what the audit saw.
 *
 * Waiting a moment before rendering does not fix that; it moves the mirrored frame
 * later. What removes it is noticing that the flag has not taken effect and
 * reloading while the splash screen is still up, so the wrong direction is never
 * painted.
 *
 * A reload that can repeat is worse than the bug, so the attempt is recorded before
 * it happens and read back on the way in. A platform that can never honour forceRTL
 * — web, or a build where reloading is unavailable — then renders in whatever
 * direction it has instead of restarting forever.
 */
import { I18nManager, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";

/** Set once, before anything lays out. Safe to call more than once. */
export function applyRtlFlags(): void {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

const RELOAD_ATTEMPT_KEY = "onway.rtl.reloadAttempted";

export type RtlStartupAction = "ready" | "reload";

/**
 * What startup should do, given what it can observe. Pure on purpose: the decision
 * is the part worth testing, and every branch that must NOT reload is as important
 * as the one that must.
 */
export function rtlStartupAction(state: {
  /** Is the running session actually right-to-left? */
  isRTL: boolean;
  /** Have we already restarted once trying to make it so? */
  alreadyAttempted: boolean;
  /** Can this platform reload itself at all? */
  canReload: boolean;
}): RtlStartupAction {
  // Already correct — the overwhelmingly common case, every launch after the first.
  if (state.isRTL) return "ready";
  // One restart is a fix; a second is a loop.
  if (state.alreadyAttempted) return "ready";
  // Nothing to reload with: render as-is rather than hang on the splash.
  if (!state.canReload) return "ready";
  return "reload";
}

/**
 * Resolve the layout direction before the first frame is shown.
 *
 * Call it while the splash screen is still up and await it before hiding the splash;
 * on the launch that needs a restart the user sees the splash, not a mirrored app.
 */
export async function ensureRtl(): Promise<void> {
  if (I18nManager.isRTL) return;

  // Default to "attempted" so that a storage failure can never produce a loop: not
  // reloading costs one mirrored launch, reloading in a loop costs the whole app.
  let alreadyAttempted = true;
  try {
    alreadyAttempted = (await AsyncStorage.getItem(RELOAD_ATTEMPT_KEY)) === "1";
  } catch {
    /* keep the safe default */
  }

  const action = rtlStartupAction({
    isRTL: I18nManager.isRTL,
    alreadyAttempted,
    canReload: Platform.OS !== "web",
  });
  if (action !== "reload") return;

  // Record BEFORE reloading. If this write fails there is no way to remember the
  // attempt, so the reload is abandoned rather than risked.
  try {
    await AsyncStorage.setItem(RELOAD_ATTEMPT_KEY, "1");
  } catch {
    return;
  }

  try {
    await Updates.reloadAsync();
  } catch {
    /* Reloading is unavailable in this build; the next launch starts RTL anyway. */
  }
}
