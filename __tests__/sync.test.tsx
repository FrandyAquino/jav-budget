import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, screen } from "expo-router/testing-library";
import { en, fixture, renderApp, stored, TODAY } from "./helpers/app";
import { client, meta, records, server, USER, VALID_CODE } from "./helpers/supabase-mock";
import { setSyncStatus } from "@/features/sync/status";
import { whenIdle } from "@/features/sync/engine";

jest.mock("@/features/sync/config", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_KEY: "sb_publishable_test",
  syncConfigured: true,
  RECEIPTS_BUCKET: "receipts",
}));
jest.mock("@/features/sync/supabase", () => ({
  getSupabase: () => jest.requireActual("./helpers/supabase-mock").client,
}));

const SYNC_KEY = "jav-budget:sync:v1";
// Lets the background sync work finish (inside act).
const settled = () => act(() => whenIdle());
beforeEach(() => {
  server.reset();
  setSyncStatus({ ready: false, user: null, phase: "idle", error: null, lastSyncedAt: null, decision: null });
});

test("signing in with an email code uploads this device's data", async () => {
  const { user } = await renderApp("/settings");
  expect(await screen.findByText(en("account.title"))).toBeOnTheScreen();

  await user.type(await screen.findByLabelText(en("account.emailA11y")), "ana@example.com");
  await user.press(screen.getByRole("button", { name: en("account.sendCode") }));
  expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
    email: "ana@example.com",
    options: { shouldCreateUser: true },
  });
  expect(await screen.findByText(en("account.codeSent", { email: "ana@example.com" }))).toBeOnTheScreen();
  // Resend waits for the cooldown.
  expect(screen.getByRole("button", { name: /^Resend code in \d+ s$/ })).toBeDisabled();

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
    ["settings_currency", "settings_email", "settings_exchangeRate", "settings_name", "settings_numberEntry"].sort(),
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
  // The device keeps its data, no longer linked to the deleted account.
  expect((await stored()).transactions.map((t) => t.id)).toContain("t-beans");
  const local = JSON.parse((await AsyncStorage.getItem(SYNC_KEY)) ?? "{}");
  expect(local.values ?? {}).toEqual({});
});
