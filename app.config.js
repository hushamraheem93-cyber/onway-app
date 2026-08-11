/**
 * C-14: EAS built release binaries with an empty Firebase config and no Maps key,
 * and the build SUCCEEDED. Every profile in eas.json set exactly one variable
 * (EXPO_PUBLIC_API_BASE_URL) while the app reads nine more, and client/lib/firebase.ts
 * defaults each missing value to "" — so the failure only surfaced on a user's
 * phone, as a blank map and a Firebase client wired to project "".
 *
 * The build now refuses to produce a binary that cannot work. This runs at config
 * evaluation time, which is exactly when EAS resolves the profile's env, so a
 * missing variable stops the build with a named list instead of shipping.
 *
 * Only presence is checked, never a value logged — these are public EXPO_PUBLIC_*
 * identifiers, but the check must not become a place secrets get printed.
 */
const REQUIRED_ENV = [
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
  "GOOGLE_MAPS_API_KEY",
];

// Only a real binary build must fail. Local tooling (expo start, prebuild
// inspection, `expo config`) keeps working so the repo stays usable without a
// full production environment.
const IS_BINARY_BUILD = process.env.EAS_BUILD === "true";

if (IS_BINARY_BUILD) {
  const missing = REQUIRED_ENV.filter((k) => !String(process.env[k] ?? "").trim());
  if (missing.length > 0) {
    throw new Error(
      "\n\n[app.config.js] Refusing to build — required configuration is missing:\n" +
        missing.map((k) => `  • ${k}`).join("\n") +
        "\n\nSet them as EAS secrets (eas secret:create) or in the profile's env block.\n" +
        "A build without these produces an app with a blank map and a Firebase client\n" +
        "pointing at no project — it fails on the user's phone, not here.\n",
    );
  }
}

module.exports = {
  expo: {
    name: "Onway",
    slug: "onway",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "tawseeli",
    // Force the light design on every device. "automatic" let an Android phone in
    // system dark mode drag native surfaces (status bar, keyboard, inputs) dark and
    // clashed with the app's light-only UI. Matches the intended iOS light look.
    userInterfaceStyle: "light",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.husham.onway",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "يستخدم التطبيق موقعك لتحديد عنوان التوصيل ومتابعة موقع السائق.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "يحتاج التطبيق إلى موقعك في الخلفية لتتبع التوصيل بدقة.",
        NSPhotoLibraryUsageDescription:
          "اختر صورة من مكتبتك لتحديث ملفك الشخصي أو إضافة منتج.",
        NSPhotoLibraryAddUsageDescription:
          "يحتاج التطبيق إلى الإذن لحفظ الصور في مكتبتك.",
        NSCameraUsageDescription:
          "التقط صورة لملفك الشخصي أو لإضافة منتج جديد.",
        NSUserNotificationUsageDescription:
          "أرسل لك إشعارات فورية بحالة طلبك وتحديثات التوصيل.",
      },
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#F83D0D",
        foregroundImage: "./assets/images/adaptive-icon.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.husham.onway",
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    },
    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#F83D0D",
        },
      ],
      "expo-web-browser",
      "expo-secure-store",
      "expo-audio",
      "expo-font",
      // Crash reporting (H-32). The org/project pair only drives source-map
      // upload at build time and is read from the build environment — never
      // committed. The auth token is deliberately NOT passed here: the Sentry
      // CLI reads SENTRY_AUTH_TOKEN from the environment, so the secret stays
      // an EAS secret and never touches a tracked file.
      [
        "@sentry/react-native/expo",
        {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
        },
      ],
    ],
    experiments: {
      reactCompiler: true,
    },
    extra: {
      supportsRTL: true,
      eas: {
        projectId: "31018b2b-d742-4f09-8d17-48d00575216c",
      },
    },
  },
};
