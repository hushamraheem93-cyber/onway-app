import { Platform } from "react-native";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";

const alarmSource = require("../assets/sounds/alarm.mp3");

let audioModeConfigured = false;
let activePlayer: AudioPlayer | null = null;

async function ensureAudioMode() {
  if (audioModeConfigured || Platform.OS === "web") return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "duckOthers",
    });
    audioModeConfigured = true;
  } catch {
    // ignore — playback will still be attempted with defaults
  }
}

// Every timer this module schedules — the repeat pulses AND each tone's removal
// timer. All of them are cleared by stopAlert(); nothing here may outlive it.
let repeatTimers: ReturnType<typeof setTimeout>[] = [];

/**
 * Bumped by every stopAlert() (H-61).
 *
 * playLoudAlert awaits ensureAudioMode() before it creates a player, so a pulse
 * whose timer had already fired could sail past a stopAlert() that landed inside
 * that await and start a tone with no player reference left to silence it —
 * clearing the timers alone cannot prevent that. Each play captures the generation
 * it began in and abandons itself if a stop has happened since.
 */
let alertGeneration = 0;

/**
 * Plays a loud, distinct alarm tone used to grab attention for new-order
 * events (driver batch offers, vendor new orders). Safe to call repeatedly.
 */
export async function playLoudAlert() {
  const generation = alertGeneration;
  try {
    await ensureAudioMode();
    // A stop landed while we were awaiting — this pulse belongs to a sequence that
    // no longer exists, so it must not start a tone.
    if (generation !== alertGeneration) return;

    if (activePlayer) {
      try {
        activePlayer.remove();
      } catch {}
      activePlayer = null;
    }

    const player = createAudioPlayer(alarmSource);
    activePlayer = player;
    player.volume = 1.0;
    player.play();

    repeatTimers.push(
      setTimeout(() => {
        try {
          player.remove();
        } catch {}
        if (activePlayer === player) activePlayer = null;
      }, 6000),
    );
  } catch {
    // silent — sound is a best-effort enhancement, never block the alert flow
  }
}

/**
 * Plays the alarm a bounded number of times spaced by `gapMs`, so an important
 * new-order/new-batch alert is much harder to miss than a single play. It always
 * self-terminates after `times` pulses (no risk of a stuck looping sound). Call
 * stopAlert() to end it early once the user acknowledges the event.
 */
export function playRepeatingAlert(times = 4, gapMs = 5000) {
  stopAlert(); // reset any in-flight sequence first
  const safeTimes = Math.max(1, Math.min(times, 6));
  for (let i = 0; i < safeTimes; i++) {
    repeatTimers.push(
      setTimeout(() => {
        void playLoudAlert();
      }, i * gapMs),
    );
  }
}

/**
 * Stops any repeating alert sequence and the currently-playing tone.
 *
 * Safe to call from a React cleanup: it clears the real timers rather than merely
 * flagging them, and invalidates any play that is mid-await.
 */
export function stopAlert() {
  alertGeneration += 1;
  repeatTimers.forEach((t) => clearTimeout(t));
  repeatTimers = [];
  if (activePlayer) {
    try {
      activePlayer.remove();
    } catch {}
    activePlayer = null;
  }
}
