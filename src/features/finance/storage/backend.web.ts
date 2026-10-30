import AsyncStorage from "@react-native-async-storage/async-storage";
import { t } from "@/shared/i18n/core";
import type { FinanceState } from "../model";
import { parseState } from "../schema";
import {
  LEGACY_KEY,
  keepRecoveryCopy,
  notifyOutbox,
  optimisticUpdate,
  patchSyncLocal,
  serialize,
  UnreadableDataError,
  requireLedgerOwner,
  type Listener,
  type SyncLocal,
  type SyncWork,
  type TransactOptions,
} from "./shared";
import { syncChanges } from "@/features/sync/core";
import { getSyncStatus, setSyncStatus } from "@/features/sync/status";

// Cloud-sync bookkeeping (outbox + small values), written under the same lock.
const SYNC_KEY = "jav-budget:sync:v1";
async function readSyncLocal(): Promise<SyncLocal> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SyncLocal>) : {};
    return { outbox: { ...parsed.outbox }, values: { ...parsed.values } };
  } catch {
    return { outbox: {}, values: {} };
  }
}
const writeSyncLocal = (local: SyncLocal) =>
  AsyncStorage.setItem(SYNC_KEY, JSON.stringify(local));

// Web: one JSON document in localStorage (via AsyncStorage), coordinated across tabs with Web Locks,
// or an optimistic re-read-before-write check where Web Locks are unavailable.
// expo-sqlite on web needs wasm + COOP/COEP headers that the dev server and static hosts don't guarantee.
const listeners = new Set<Listener>();
const withLock = <T,>(work: () => Promise<T>): Promise<T> =>
  typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request(LEGACY_KEY, work)
    : work();

function parseStored(raw: string): FinanceState {
  try {
    return parseState(JSON.parse(raw));
  } catch (error) {
    throw new UnreadableDataError(
      error instanceof Error ? error.message : String(error),
    );
  }
}
const locked = () => typeof navigator !== "undefined" && !!navigator.locks;

export function transact<R extends FinanceState | null>(
  change: (base: FinanceState | null) => R,
  options: TransactOptions = {},
): Promise<R> {
  return serialize(() =>
    withLock(async () => {
      if (options.owner) {
        if (!locked()) throw new Error(t("store.storageBusy"));
        requireLedgerOwner(await readSyncLocal(), options.owner);
      }
      let raw: string | null = null;
      let base: FinanceState | null = null;
      try {
        const result = await optimisticUpdate(
          () => AsyncStorage.getItem(LEGACY_KEY),
          (data) => AsyncStorage.setItem(LEGACY_KEY, data),
          (current) => {
            raw = current;
            base = current ? parseStored(current) : null;
            const result = change(base);
            return { result, data: result ? JSON.stringify(result) : undefined };
          },
          // With Web Locks there is no race to retry.
          locked() ? 1 : 5,
        );
        if (result && JSON.stringify(result) !== raw) {
          const keys = options.record === false ? [] : syncChanges(base, result);
          if (keys.length) {
            const at = new Date().toISOString();
            const local = await readSyncLocal();
            await writeSyncLocal(
              patchSyncLocal(local, { outbox: Object.fromEntries(keys.map((k) => [k, at])) }),
            );
          }
          for (const listener of listeners) listener(result);
          if (keys.length) notifyOutbox();
        }
        return result;
      } catch (error) {
        // Keep the unreadable value so "start with empty data" loses nothing.
        if (error instanceof UnreadableDataError && raw)
          await keepRecoveryCopy(AsyncStorage, raw);
        throw error;
      }
    }),
  );
}
// Reads the ledger and the sync bookkeeping and writes what `work` returns
// under the same lock. A returned state is not added to the outbox.
export function syncTransact<R>(
  work: (base: FinanceState | null, local: SyncLocal) => SyncWork<R>,
): Promise<R> {
  return serialize(() =>
    withLock(async () => {
      const raw = await AsyncStorage.getItem(LEGACY_KEY);
      const local = await readSyncLocal();
      const output = work(raw ? parseStored(raw) : null, local);
      if ((output.state || output.patch) && !locked()) throw new Error(t("store.storageBusy"));
      if (output.state) {
        const data = JSON.stringify(output.state);
        if (data !== raw) {
          if ((await AsyncStorage.getItem(LEGACY_KEY)) !== raw)
            throw new Error(t("store.storageBusy"));
          await AsyncStorage.setItem(LEGACY_KEY, data);
          for (const listener of listeners) listener(output.state);
        }
      }
      if (output.patch) await writeSyncLocal(patchSyncLocal(local, output.patch));
      return output.result;
    }),
  );
}
// Continues with empty data after an UnreadableDataError; the old value stays
// in the recovery key.
export function discardUnreadableData(): Promise<void> {
  return serialize(() =>
    withLock(async () => {
      const raw = await AsyncStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      try {
        parseState(JSON.parse(raw));
        return; // Readable after all (another tab fixed it); keep it.
      } catch {
        await keepRecoveryCopy(AsyncStorage, raw);
        await AsyncStorage.removeItem(LEGACY_KEY);
      }
    }),
  );
}
export function subscribe(listener: Listener, onError: () => void) {
  listeners.add(listener);
  const refresh = (event: StorageEvent) => {
    if (event.key !== null && event.key !== LEGACY_KEY && event.key !== SYNC_KEY) return;
    // Another tab wrote the shared ledger or its sync bookkeeping. Its own
    // sync cycles do this for the same account all the time (lastSyncedAt), so
    // the gate only closes when the stored owner no longer matches this
    // session: another account may be replacing the ledger. Until the read
    // below, this tab still shows its own (same-owner) copy, and writes are
    // checked against the stored owner (requireLedgerOwner).
    void syncTransact((base, local) => {
      const user = getSyncStatus().user?.id;
      const owned =
        !!user &&
        local.values.userId === user &&
        local.values.bootstrapped === user;
      if (!owned) setSyncStatus({ ledgerUserId: null });
      if (base && user && local.values.userId === user) listener(base);
      // Only pending changes need a sync here; the other tab's own cycle
      // already pushed its work, and syncing back would bounce between tabs.
      return { result: Object.keys(local.outbox).length > 0 };
    })
      .then((pending) => {
        if (pending) notifyOutbox();
      })
      .catch(onError);
  };
  if (typeof window !== "undefined") window.addEventListener("storage", refresh);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", refresh);
  };
}
