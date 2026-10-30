// Jest stand-in for src/features/finance/storage/backend(.web).ts.
// Same contract (serialized read-modify-write of one JSON document, plus the
// sync outbox/values document) backed by the official AsyncStorage jest mock,
// without expo-sqlite or browser storage events.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FinanceState } from "@/features/finance/model";
import { parseState } from "@/features/finance/schema";
import {
  LEGACY_KEY,
  notifyOutbox,
  patchSyncLocal,
  serialize,
  requireLedgerOwner,
  type Listener,
  type SyncLocal,
  type SyncWork,
  type TransactOptions,
} from "@/features/finance/storage/shared";
import { syncChanges } from "@/features/sync/core";

const listeners = new Set<Listener>();
export const SYNC_KEY = "jav-budget:sync:v1";
async function readSyncLocal(): Promise<SyncLocal> {
  const raw = await AsyncStorage.getItem(SYNC_KEY);
  const parsed = raw ? (JSON.parse(raw) as Partial<SyncLocal>) : {};
  return { outbox: { ...parsed.outbox }, values: { ...parsed.values } };
}

export function transact<R extends FinanceState | null>(
  change: (base: FinanceState | null) => R,
  options: TransactOptions = {},
): Promise<R> {
  return serialize(async () => {
    if (options.owner) requireLedgerOwner(await readSyncLocal(), options.owner);
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    const base = raw ? parseState(JSON.parse(raw)) : null;
    const result = change(base);
    if (!result) return result;
    const data = JSON.stringify(result);
    if (data === raw) return result;
    await AsyncStorage.setItem(LEGACY_KEY, data);
    const keys = options.record === false ? [] : syncChanges(base, result);
    if (keys.length) {
      const at = new Date().toISOString();
      await AsyncStorage.setItem(
        SYNC_KEY,
        JSON.stringify(
          patchSyncLocal(await readSyncLocal(), {
            outbox: Object.fromEntries(keys.map((k) => [k, at])),
          }),
        ),
      );
    }
    for (const listener of listeners) listener(result);
    if (keys.length) notifyOutbox();
    return result;
  });
}
export function syncTransact<R>(
  work: (base: FinanceState | null, local: SyncLocal) => SyncWork<R>,
): Promise<R> {
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    const local = await readSyncLocal();
    const output = work(raw ? parseState(JSON.parse(raw)) : null, local);
    if (output.state && JSON.stringify(output.state) !== raw) {
      await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(output.state));
      for (const listener of listeners) listener(output.state);
    }
    if (output.patch)
      await AsyncStorage.setItem(SYNC_KEY, JSON.stringify(patchSyncLocal(local, output.patch)));
    return output.result;
  });
}
export function subscribe(listener: Listener, _onError: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
