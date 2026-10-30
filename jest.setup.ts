import AsyncStorage from "@react-native-async-storage/async-storage";

// https://docs.swmansion.com/react-native-worklets/docs/guides/testing/
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
// expo-router/testing-library registers `react-native-reanimated/mock` when it is
// first imported. PanelUI's BottomSheet needs the real API (callable animated refs,
// shared value listeners), so load the testing library now and fill the module it
// hands out with the real web build (selected by the Reanimated Jest resolver).
// https://docs.swmansion.com/react-native-reanimated/docs/guides/testing/
require("expo-router/testing-library");
Object.assign(
  require("react-native-reanimated"),
  jest.requireActual("react-native-reanimated"),
);
require("react-native-reanimated").setUpTests();
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
// Native ledger uses expo-sqlite; tests persist one JSON document in mocked AsyncStorage.
jest.mock("@/features/finance/storage/backend", () =>
  jest.requireActual("./__mocks__/finance-backend"),
);
// Icon fonts (Feather) are bundled assets; treat them as already loaded.
jest.mock("expo-font", () => ({
  ...jest.requireActual("expo-font"),
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));
// Crash reporting is off without a DSN; its ESM build doesn't load under Jest.
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: (root: unknown) => root,
  captureException: jest.fn(),
}));
// Device services used by FinanceProvider/AppShell (reminders, Face ID, background task).
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => "id"),
  SchedulableTriggerInputTypes: { DATE: "date" },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
jest.mock("expo-background-task", () => ({
  getStatusAsync: jest.fn(async () => 1),
  registerTaskAsync: jest.fn(async () => {}),
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => {
    throw new Error("expo-sqlite is not used in Jest; see __mocks__/finance-backend.ts");
  }),
}));
// OS integrations rendered by the root layout; they have no visible UI.
jest.mock("@/features/quick-actions/quick-actions", () => ({
  QuickActionsSync: () => null,
}));
jest.mock("@/features/widgets/widget-sync", () => ({ WidgetSync: () => null }));

// Uniwind resolves CSS variables from the Metro-compiled stylesheet, which Jest
// does not build; its "variable not found" warnings are expected here.
const warn = console.warn;
jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("Uniwind - We couldn't find your variable")) return;
  warn(...args);
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem("jav-budget:sync:v1", JSON.stringify({
    outbox: {}, values: { userId: "ui-test-user", bootstrapped: "ui-test-user" },
  }));
  // Financial UI suites start as an established account. Auth suites reset
  // this explicitly and exercise the real gate with their Supabase mock.
  require("@/features/sync/status").setSyncStatus({
    configured: true, ready: true,
    user: { id: "ui-test-user", email: "ui@example.test" },
    ledgerUserId: "ui-test-user", transitioning: false, phase: "idle", error: null,
    decision: null, lastSyncedAt: null,
  });
});
