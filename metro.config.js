// Sentry's Expo config adds Debug IDs that match uploaded source maps.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withUniwindConfig } = require("uniwind/metro");

const config = getSentryExpoConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./uniwind-types.d.ts",
  // Named themes must be registered here or setTheme() throws.
  extraThemes: ["moon", "moon-dark", "grass", "grass-dark"],
});
