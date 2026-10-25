import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FinanceState } from "../model";
import { parseState } from "../schema";
import {
  LEGACY_KEY,
  keepRecoveryCopy,
  optimisticUpdate,
  serialize,
  UnreadableDataError,
  type Listener,
} from "./shared";

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
): Promise<R> {
  return serialize(() =>
    withLock(async () => {
      let raw: string | null = null;
      try {
        const result = await optimisticUpdate(
          () => AsyncStorage.getItem(LEGACY_KEY),
          (data) => AsyncStorage.setItem(LEGACY_KEY, data),
          (current) => {
            raw = current;
            const result = change(current ? parseStored(current) : null);
            return { result, data: result ? JSON.stringify(result) : undefined };
          },
          // With Web Locks there is no race to retry.
          locked() ? 1 : 5,
        );
        if (result && JSON.stringify(result) !== raw)
          for (const listener of listeners) listener(result);
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
    if (event.key !== LEGACY_KEY || !event.newValue) return;
    try {
      listener(parseState(JSON.parse(event.newValue)));
    } catch {
      onError();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", refresh);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", refresh);
  };
}
