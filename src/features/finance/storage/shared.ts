import { t } from "../../../shared/i18n/core.ts";
import type { FinanceState } from "../model";

export const LEGACY_KEY = "jav-budget:finance:v1";
// Untouched copy of stored data that could not be read; never deleted by the app.
export const RECOVERY_KEY = `${LEGACY_KEY}:recovery`;
export type Listener = (state: FinanceState) => void;

// Stored data exists but cannot be read. The raw value has been copied to
// RECOVERY_KEY, so the user may safely continue with empty data.
export class UnreadableDataError extends Error {
  readonly unreadable = true;
}
export const isUnreadableData = (error: unknown) =>
  !!(error as { unreadable?: unknown } | null)?.unreadable;

type KeyValue = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
// Copies `raw` to the recovery key without overwriting an earlier, different copy.
export async function keepRecoveryCopy(storage: KeyValue, raw: string) {
  const existing = await storage.getItem(RECOVERY_KEY);
  if (existing === raw) return;
  await storage.setItem(
    existing === null ? RECOVERY_KEY : `${RECOVERY_KEY}:${Date.now()}`,
    raw,
  );
}

// One write at a time per JS runtime, shared by the provider and background tasks.
let chain: Promise<unknown> = Promise.resolve();
export function serialize<T>(work: () => Promise<T>): Promise<T> {
  const task = chain.then(work);
  chain = task.catch(() => {});
  return task;
}

// Optimistic read-modify-write for storage without locks (other tabs may write
// at any time): if the stored value changed while `change` ran, apply the
// change again to the fresh value. Gives up after `attempts` conflicts.
export async function optimisticUpdate<R>(
  read: () => Promise<string | null>,
  write: (value: string) => Promise<void>,
  change: (raw: string | null) => { result: R; data?: string },
  attempts = 5,
): Promise<R> {
  for (let attempt = 1; ; attempt++) {
    const raw = await read();
    const { result, data } = change(raw);
    if (data === undefined || data === raw) return result;
    if ((await read()) !== raw) {
      if (attempt >= attempts) throw new Error(t("store.storageBusy"));
      continue;
    }
    await write(data);
    return result;
  }
}

// Cloud-sync bookkeeping kept next to the ledger (src/features/sync):
// `outbox` maps changed record/setting keys to the client time of the change;
// `values` holds small strings (signed-in user id, pull cursor, ...).
export type SyncLocal = { outbox: Record<string, string>; values: Record<string, string> };
export type SyncPatch = {
  clearOutbox?: boolean;
  outbox?: Record<string, string>;
  removeOutbox?: string[];
  // Removes every value before applying `values`.
  clearValues?: boolean;
  // null removes the value.
  values?: Record<string, string | null>;
};
// `state` replaces the ledger (validated by the caller, never recorded in the
// outbox); `patch` updates the sync bookkeeping in the same write.
export type SyncWork<R> = { state?: FinanceState; patch?: SyncPatch; result: R };
// record: false writes without adding the change to the outbox (data that came
// from the cloud, or erasing this device's copy on sign-out).
export type TransactOptions = { record?: boolean };

export function patchSyncLocal(local: SyncLocal, patch: SyncPatch = {}): SyncLocal {
  const outbox = patch.clearOutbox ? {} : { ...local.outbox };
  for (const key of patch.removeOutbox ?? []) delete outbox[key];
  Object.assign(outbox, patch.outbox);
  const values = patch.clearValues ? {} : { ...local.values };
  for (const [key, value] of Object.entries(patch.values ?? {}))
    if (value === null) delete values[key];
    else values[key] = value;
  return { outbox, values };
}
// Notified after a local write added entries to the outbox.
const outboxListeners = new Set<() => void>();
export function onOutboxChange(listener: () => void) {
  outboxListeners.add(listener);
  return () => {
    outboxListeners.delete(listener);
  };
}
export function notifyOutbox() {
  for (const listener of outboxListeners) listener();
}
