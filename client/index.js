import { registerRootComponent } from "expo";

// H-32: crash reporting starts before the App module is EVALUATED, so a failure
// while App and its providers are still being loaded is reported too.
//
// App is pulled in with require() on purpose: ES import declarations are hoisted,
// so `import App from "@/App"` would run App's module body before this line no
// matter where the line sits. Does nothing unless EXPO_PUBLIC_SENTRY_DSN is set
// for the build, and never throws.
import { initCrashReporting } from "@/lib/crashReporting";

// M-80: the layout direction has to be set before ANY module lays anything out.
// It used to be a side effect of importing constants/theme.ts (and again of
// App.tsx), so which of them ran first decided when the flag was written. Applied
// here, ahead of the require() below, it is set once and always first.
import { applyRtlFlags } from "@/lib/rtl";

initCrashReporting();
applyRtlFlags();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const App = require("@/App").default;

registerRootComponent(App);
