// UI/integration tests (React Native Testing Library + expo-router/testing-library).
// Domain tests in tests/*.test.mts run separately with `npm test` (node:test).
// https://docs.expo.dev/develop/unit-testing/
// https://docs.expo.dev/router/reference/testing/
const iosPreset = require("jest-expo/ios/jest-preset");

const JS = "\\.[jt]sx?$";
const [babelJest, babelOptions] = iosPreset.transform[JS];

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo/ios",
  // Resolves the web implementations of Reanimated/Worklets inside Jest.
  // https://docs.swmansion.com/react-native-reanimated/docs/guides/testing/
  resolver: "react-native-reanimated/jest/resolver",
  roots: ["<rootDir>/__tests__"],
  testMatch: ["<rootDir>/__tests__/**/*.test.[jt]s?(x)"],
  // https://docs.swmansion.com/react-native-gesture-handler/docs/guides/testing/
  setupFiles: ["react-native-gesture-handler/jestSetup.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Each test renders the whole route tree; the first render per file also transforms it.
  testTimeout: 20_000,
  moduleNameMapper: {
    // global.css (Uniwind/Tailwind) is compiled by Metro, not needed in Jest.
    "\\.css$": "<rootDir>/__mocks__/style.js",
  },
  transform: {
    // Same babel-jest + babel-preset-expo setup as jest-expo/ios, plus `import()` -> require().
    [JS]: [
      babelJest,
      {
        ...babelOptions,
        plugins: [require.resolve("./__tests__/helpers/babel-dynamic-import.js")],
      },
    ],
  },
  // Packages that ship untranspiled ESM/TS/JSX for React Native.
  // Base list from https://docs.expo.dev/develop/unit-testing/ (and jest-expo's default).
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|(jest-)?react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|react-native-svg|standard-navigation|panelui-native|uniwind|@shopify/flash-list|@react-native-async-storage|tailwind-merge|tailwind-variants|clsx))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
