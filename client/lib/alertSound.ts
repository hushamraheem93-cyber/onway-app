import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

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

/**
 * Plays a loud, distinct alarm tone used to grab attention for new-order
 * events (driver batch offers, vendor new orders). Safe to call repeatedly.
 */
export async function playLoudAlert() {
  try {
    await ensureAudioMode();

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

    setTimeout(() => {
      try {
        player.remove();
      } catch {}
      if (activePlayer === player) activePlayer = null;
    }, 6000);
  } catch {
    // silent — sound is a best-effort enhancement, never block the alert flow
  }
}
