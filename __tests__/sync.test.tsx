import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, screen, waitFor } from "expo-router/testing-library";
import { en, fixture, renderApp, stored, TODAY } from "./helpers/app";
import { client, meta, records, server, USER, VALID_CODE } from "./helpers/supabase-mock";
import { setSyncStatus } from "@/features/sync/status";
import { requestSync, signOut, whenIdle } from "@/features/sync/engine";

jest.mock("@/features/sync/config", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_KEY: "sb_publishable_test",
  syncConfigured: true,
  RECEIPTS_BUCKET: "receipts",
}));
jest.mock("@/features/sync/supabase", () => ({
  getSupabase: () => jest.requireActual("./helpers/supabase-mock").client,
}));
jest.mock("@/features/sync/auth-verifier", () => ({
  createAuthVerifier: () => jest.requireActual("./helpers/supabase-mock").client,
}));

jest.mock("@/features/sync/google-auth", () => ({
  hasGoogleCallback: () => false,
  finishGoogleSignIn: async () => {},
  beginGoogleSignIn: jest.fn(async () => {
    const { client } = jest.requireActual("./helpers/supabase-mock");
    await client.auth.setSession({ access_token: "token", refresh_token: "refresh" });
    return true;
  }),
}));

const SYNC_KEY = "jav-budget:sync:v1";
// Lets the background sync work finish (inside act).
const settled = () => act(() => whenIdle());
beforeEach(async () => {
  await AsyncStorage.removeItem(SYNC_KEY);
  server.reset();
  setSyncStatus({ ready: false, user: null, ledgerUserId: null, phase: "idle", error: null, lastSyncedAt: null, decision: null });
});

test("a signed-out deep link cannot reveal retained financial data", async () => {
  await renderApp("/activity", fixture());
  expect(await screen.findByLabelText(en("account.emailA11y"))).toBeOnTheScreen();
  expect(screen.queryByText("Coffee beans")).not.toBeOnTheScreen();
  expect(screen.queryByRole("tab", { name: en("tabs.home") })).not.toBeOnTheScreen();
  expect((await stored()).transactions).toHaveLength(3);
});

test("the default-provider email link signs in without navigating to its redirect", async () => {
  const { user } = await renderApp("/settings", fixture());
  await user.type(await screen.findByLabelText(en("account.emailA11y")), "ana@example.com");
  await user.press(screen.getByRole("button", { name: en("account.sendCode") }));
  await user.type(await screen.findByLabelText(en("account.codeA11y")), "https://example.supabase.co/auth/v1/verify?token=valid-hash&type=magiclink&redirect_to=http://localhost:3000");
  await user.press(screen.getByRole("button", { name: en("account.verify") }));
  await settled();
  expect(client.auth.verifyOtp).toHaveBeenLastCalledWith({ token_hash: "valid-hash", type: "email" });
  expect(await screen.findByText(en("account.signedInAs", { email: USER.email }))).toBeOnTheScreen();
});

test("a valid link for a different email never publishes a session or uploads the ledger", async () => {
  const { user } = await renderApp("/settings", fixture());
  await user.type(await screen.findByLabelText(en("account.emailA11y")), "victim@example.com");
  await user.press(screen.getByRole("button", { name: en("account.sendCode") }));
  await user.type(await screen.findByLabelText(en("account.codeA11y")), "https://example.supabase.co/auth/v1/verify?token=valid-hash&type=magiclink");
  await user.press(screen.getByRole("button", { name: en("account.verify") }));
  await settled();
  expect(await screen.findByText(en("auth.error.invalidCode"))).toBeOnTheScreen();
  expect(client.auth.setSession).not.toHaveBeenCalled();
  expect(server.session).toBeNull();
  expect(records()).toEqual([]);
  expect(screen.queryByRole("tab", { name: en("tabs.home") })).not.toBeOnTheScreen();
});

test("an auth failure locks the retained ledger instead of treating it as offline", async () => {
  server.signIn();
  await AsyncStorage.setItem(SYNC_KEY, JSON.stringify({
    outbox: {}, values: { userId: USER.id, bootstrapped: USER.id },
  }));
  await renderApp("/activity", fixture());
  await settled();
  expect(await screen.findByText("Coffee beans")).toBeOnTheScreen();
  const original = client.from;
  client.from = () => { throw Object.assign(new Error("JWT expired"), { status: 401 }); };
  try {
    await act(() => requestSync());
    expect(screen.queryByText("Coffee beans")).not.toBeOnTheScreen();
    expect(screen.queryByRole("tab", { name: en("tabs.home") })).not.toBeOnTheScreen();
    expect((await stored()).transactions).toHaveLength(3);
  } finally { client.from = original; }
});

test("sign-out hides retained data and a different account cannot open it", async () => {
  server.signIn();
  await AsyncStorage.setItem(SYNC_KEY, JSON.stringify({
    outbox: {}, values: { userId: USER.id, bootstrapped: USER.id },
  }));
  await renderApp("/activity", fixture());
  await settled();
  expect(await screen.findByText("Coffee beans")).toBeOnTheScreen();
  await act(() => signOut("keep"));
  expect(await screen.findByLabelText(en("account.emailA11y"))).toBeOnTheScreen();
  expect(screen.queryByText("Coffee beans")).not.toBeOnTheScreen();
  expect((await stored()).transactions).toHaveLength(3);

  server.session = { access_token: "other-token", refresh_token: "other-refresh", user: { id: "user-2", email: "bea@example.com" } };
  await act(() => requestSync());
  expect(await screen.findByText(en("sync.switch.title"))).toBeOnTheScreen();
  expect(screen.queryByText("Coffee beans")).not.toBeOnTheScreen();
  expect(screen.queryByRole("tab", { name: en("tabs.home") })).not.toBeOnTheScreen();
  expect(records().filter((r) => r.user_id === "user-2")).toEqual([]);
});

test("missing cloud configuration fails closed", async () => {
  setSyncStatus({ configured: false });
  await renderApp("/settings", fixture());
  expect(await screen.findByText(en("auth.unavailable"))).toBeOnTheScreen();
  expect(screen.queryByText(en("backup.auto"))).not.toBeOnTheScreen();
  setSyncStatus({ configured: true });
});

test("an existing owner can open the local ledger when cloud requests fail", async () => {
  server.signIn();
  await AsyncStorage.setItem(SYNC_KEY, JSON.stringify({
    outbox: {}, values: { userId: USER.id, bootstrapped: USER.id },
  }));
  const original = client.from;
  client.from = () => { throw new Error("Network offline"); };
  try {
    await renderApp("/activity", fixture());
    await settled();
    expect(await screen.findByText("Coffee beans")).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByRole("tab", { name: en("tabs.home") })).toBeOnTheScreen());
  } finally {
    client.from = original;
  }
});

test("signing in with an email code uploads this device's data", async () => {
  const { user } = await renderApp("/settings");
  expect(await screen.findByText(en("auth.welcome"))).toBeOnTheScreen();

  await user.type(await screen.findByLabelText(en("account.emailA11y")), "ana@example.com");
  await user.press(screen.getByRole("button", { name: en("account.sendCode") }));
  expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
    email: "ana@example.com",
    options: { shouldCreateUser: true },
  });
  expect(await screen.findByText(en("account.codeSent", { email: "ana@example.com" }))).toBeOnTheScreen();
  // Resend waits for the cooldown.
  expect(screen.getByRole("button", { name: /^Resend email in \d+ s$/ })).toBeDisabled();

  // A wrong or expired code shows a clear error.
  await user.type(screen.getByLabelText(en("account.codeA11y")), "000000");
  await user.press(screen.getByRole("button", { name: en("account.verify") }));
  expect(await screen.findByText(en("auth.error.invalidCode"))).toBeOnTheScreen();

  await user.clear(screen.getByLabelText(en("account.codeA11y")));
  await user.type(screen.getByLabelText(en("account.codeA11y")), VALID_CODE);
  await user.press(screen.getByRole("button", { name: en("account.verify") }));
  expect(client.auth.verifyOtp).toHaveBeenLastCalledWith({ email: "ana@example.com", token: VALID_CODE, type: "email" });
  expect(await screen.findByText(en("account.signedInAs", { email: USER.email }))).toBeOnTheScreen();

  // The cloud was empty: everything local was pushed, device-local settings were not.
  await settled();
  expect(records().map((r) => r.id)).toEqual(expect.arrayContaining(["t-beans", "t-dinner", "t-pay", "main"]));
  expect(records().every((r) => r.user_id === USER.id)).toBe(true);
  expect(meta().map((m) => m.key).sort()).toEqual(
    ["settings_budgetPeriod", "settings_currency", "settings_email", "settings_exchangeRate", "settings_name", "settings_numberEntry"].sort(),
  );
  expect(await screen.findByText(new RegExp(`^${en("account.status.idle")} · `))).toBeOnTheScreen();
  const local = JSON.parse((await AsyncStorage.getItem(SYNC_KEY)) ?? "{}");
  expect(local.outbox).toEqual({});
  expect(local.values).toMatchObject({ userId: USER.id, bootstrapped: USER.id });
  await settled();
});

test("Sync now pushes local edits and pulls changes from other devices", async () => {
  server.signIn();
  // This device already synced with the account; one edit is pending.
  await AsyncStorage.setItem(
    SYNC_KEY,
    JSON.stringify({
      outbox: { "r/transactions/t-beans": new Date().toISOString() },
      values: { userId: USER.id, bootstrapped: USER.id },
    }),
  );
  const { user } = await renderApp("/settings", fixture());
  expect(await screen.findByText(en("account.signedInAs", { email: USER.email }))).toBeOnTheScreen();
  await settled();
  expect(records().map((r) => r.id)).toContain("t-beans");

  // Another device adds a transaction and renames the profile.
  server.put("sync_records", {
    collection: "transactions",
    id: "t-phone",
    position: 3,
    deleted: false,
    client_updated_at: new Date(Date.now() + 1000).toISOString(),
    data: { id: "t-phone", kind: "expense", amount: 2_500, accountId: "main", categoryId: "dining", title: "Lunch from phone", note: "", date: TODAY, tags: [] },
  });
  server.put("sync_meta", { key: "settings_name", data: "Ana María", client_updated_at: new Date(Date.now() + 1000).toISOString() });
  // A device-local setting from the cloud is never applied.
  server.put("sync_meta", { key: "settings_biometrics", data: true, client_updated_at: new Date(Date.now() + 1000).toISOString() });

  await user.press(await screen.findByRole("button", { name: en("account.syncNow") }));
  await settled();
  const state = await stored();
  expect(state.transactions.map((t) => t.id)).toContain("t-phone");
  expect(state.settings.name).toBe("Ana María");
  expect(state.settings.biometrics).toBe(false);
  expect(await screen.findByText(new RegExp(`^${en("account.status.idle")} · Last synced`))).toBeOnTheScreen();
  await settled();
});

test("when both the device and the cloud have data, merging asks first", async () => {
  server.signIn();
  server.put("sync_records", {
    collection: "accounts",
    id: "cloud-cash",
    position: 0,
    deleted: false,
    client_updated_at: new Date().toISOString(),
    data: { id: "cloud-cash", name: "Cloud cash", type: "cash", currency: "DOP", opening: 0, color: "#BA965C" },
  });
  const { user } = await renderApp("/settings", fixture());
  await settled();
  expect(await screen.findByText(en("sync.merge.title"))).toBeOnTheScreen();
  expect((await stored()).accounts.map((a) => a.id)).not.toContain("cloud-cash");

  await user.press(screen.getByRole("button", { name: en("sync.merge.merge") }));
  await settled();
  expect((await stored()).accounts.map((a) => a.id)).toEqual(["main", "dollars", "cloud-cash"]);
  // Local records were uploaded too (union).
  expect(records().map((r) => r.id)).toEqual(expect.arrayContaining(["main", "dollars", "cloud-cash", "t-beans"]));
  expect(screen.queryByText(en("sync.merge.title"))).not.toBeOnTheScreen();
});

test("deleting the account removes cloud data and keeps this device's copy", async () => {
  server.signIn();
  server.receipts.add(`${USER.id}/receipt-1.jpg`);
  server.put("sync_meta", { key: "settings_name", data: "Ana", client_updated_at: new Date(0).toISOString() });
  await AsyncStorage.setItem(
    SYNC_KEY,
    JSON.stringify({ outbox: {}, values: { userId: USER.id, bootstrapped: USER.id } }),
  );
  const { user } = await renderApp("/settings", fixture());
  expect(await screen.findByText(en("account.signedInAs", { email: USER.email }))).toBeOnTheScreen();
  await settled();

  await user.press(screen.getByRole("button", { name: en("account.delete") }));
  expect(await screen.findByText(en("account.delete.title"))).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: en("account.delete.keep") }));
  await settled();

  expect(client.rpc).toHaveBeenCalledWith("delete_account");
  expect(server.receipts.size).toBe(0);
  expect(records()).toEqual([]);
  expect(meta()).toEqual([]);
  expect(await screen.findByLabelText(en("account.emailA11y"))).toBeOnTheScreen();
  // Retained data stays attributed to its deleted owner, never to the next login.
  expect((await stored()).transactions.map((t) => t.id)).toContain("t-beans");
  const local = JSON.parse((await AsyncStorage.getItem(SYNC_KEY)) ?? "{}");
  expect(local.values).toEqual({ userId: USER.id });
});


test("Google sign-in uses the same account gate and first-sync ownership rules", async () => {
  await AsyncStorage.setItem(SYNC_KEY, JSON.stringify({
    values: { userId: "previous-owner", bootstrapped: "previous-owner" }, outbox: {},
  }));
  const { user } = await renderApp("/settings", fixture());
  await user.press(await screen.findByRole("button", { name: en("account.google") }));
  await settled();
  expect(screen.queryByText("Coffee beans")).not.toBeOnTheScreen();
  expect(screen.queryByRole("tab", { name: en("tabs.home") })).not.toBeOnTheScreen();
  expect(records()).toEqual([]);
  expect((await stored()).transactions).toHaveLength(3);
});
