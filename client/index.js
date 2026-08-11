import { registerRootComponent } from "expo";

// H-32: crash reporting starts before the App module is EVALUATED, so a failure
// while App and its providers are still being loaded is reported too.
//
// App is pulled in with require() on purpose: ES import declarations are hoisted,
// so `import App from "@/App"` would run App's module body before this line no
// matter where the line sits. Does nothing unless EXPO_PUBLIC_SENTRY_DSN is set
// for the build, and never throws.
import { initCrashReporting } from "@/lib/crashReporting";

initCrashReporting();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const App = require("@/App").default;

registerRootComponent(App);
