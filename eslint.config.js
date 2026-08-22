// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["client/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            "express",
            "firebase-admin",
            "jsonwebtoken",
            "multer",
            "sharp",
            "@octokit/rest",
            "http-proxy-middleware",
            "ws",
          ],
          message: "Server-only packages must not be imported into the mobile client.",
        }],
      }],
    },
  },
]);
