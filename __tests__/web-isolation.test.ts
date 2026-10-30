import AsyncStorage from "@react-native-async-storage/async-storage";
import { emptyState } from "@/features/finance/model";
import { LEGACY_KEY, LedgerOwnerChangedError } from "@/features/finance/storage/shared";
import { getSyncStatus, setSyncStatus } from "@/features/sync/status";
import { subscribe, transact } from "@/features/finance/storage/backend.web";

const SYNC_KEY = "jav-budget:sync:v1";

test("an external account replacement closes access before publishing any ledger", async () => {
  const callbacks: Record<string, (event: { key: string }) => void> = {};
  const originalAdd = Object.getOwnPropertyDescriptor(window, "addEventListener");
  const originalRemove = Object.getOwnPropertyDescriptor(window, "removeEventListener");
  Object.defineProperty(window, "addEventListener", { configurable: true, value:
    (type: string, listener: (event: { key: string }) => void) => { callbacks[type] = listener; },
  });
  Object.defineProperty(window, "removeEventListener", { configurable: true, value: jest.fn() });
  const listener = jest.fn();
  const failed = jest.fn();
  const stop = subscribe(listener, failed);
  try {
    await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(emptyState()));
    await AsyncStorage.setItem(SYNC_KEY, JSON.stringify({ values: { userId: "other-account" }, outbox: {} }));
    callbacks.storage({ key: LEGACY_KEY });
    // Until the refresh reads the new owner, this tab keeps showing its own
    // copy; the other account's ledger is never published.
    // transact is serialized after the refresh, so it also drains its read.
    await transact((base) => base, { record: false });
    expect(getSyncStatus().ledgerUserId).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  } finally {
    stop();
    for (const [key, descriptor] of [["addEventListener", originalAdd], ["removeEventListener", originalRemove]] as const) {
      if (descriptor) Object.defineProperty(window, key, descriptor);
      else Reflect.deleteProperty(window, key);
    }
  }
});

test("a stale tab cannot mutate a ledger now owned by another account", async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: {
    request: (_key: string, work: () => Promise<unknown>) => work(),
  } });
  try {
    const state = JSON.stringify(emptyState());
    await AsyncStorage.setItem(LEGACY_KEY, state);
    await AsyncStorage.setItem(SYNC_KEY, JSON.stringify({ values: { userId: "other-account" }, outbox: {} }));
    setSyncStatus({ ledgerUserId: "test-ui" });
    const change = jest.fn((base) => base);
    await expect(transact(change, { owner: "test-ui" })).rejects.toBeInstanceOf(LedgerOwnerChangedError);
    expect(change).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBe(state);
  } finally {
    if (original) Object.defineProperty(navigator, "locks", original);
    else Reflect.deleteProperty(navigator, "locks");
  }
});

test("another tab of the same account syncing never closes this tab's ledger", async () => {
  const callbacks: Record<string, (event: { key: string }) => void> = {};
  const originalAdd = Object.getOwnPropertyDescriptor(window, "addEventListener");
  const originalRemove = Object.getOwnPropertyDescriptor(window, "removeEventListener");
  Object.defineProperty(window, "addEventListener", { configurable: true, value:
    (type: string, listener: (event: { key: string }) => void) => { callbacks[type] = listener; },
  });
  Object.defineProperty(window, "removeEventListener", { configurable: true, value: jest.fn() });
  const listener = jest.fn();
  const stop = subscribe(listener, jest.fn());
  try {
    await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(emptyState()));
    await AsyncStorage.setItem(SYNC_KEY, JSON.stringify({
      values: { userId: "same-account", bootstrapped: "same-account", lastSyncedAt: new Date().toISOString() },
      outbox: {},
    }));
    setSyncStatus({ user: { id: "same-account", email: "a@example.com" }, ledgerUserId: "same-account" });
    // The other tab's sync cycle rewrote the bookkeeping (lastSyncedAt).
    callbacks.storage({ key: SYNC_KEY });
    expect(getSyncStatus().ledgerUserId).toBe("same-account");
    await transact((base) => base, { record: false });
    expect(getSyncStatus().ledgerUserId).toBe("same-account");
    expect(listener).toHaveBeenCalled();
  } finally {
    stop();
    setSyncStatus({ user: null, ledgerUserId: null });
    for (const [key, descriptor] of [["addEventListener", originalAdd], ["removeEventListener", originalRemove]] as const) {
      if (descriptor) Object.defineProperty(window, key, descriptor);
      else Reflect.deleteProperty(window, key);
    }
  }
});
