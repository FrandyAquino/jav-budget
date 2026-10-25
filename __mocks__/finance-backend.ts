// Jest stand-in for src/features/finance/storage/backend(.web).ts.
// Same contract (serialized read-modify-write of one JSON document) backed by the
// official AsyncStorage jest mock, without expo-sqlite or browser storage events.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FinanceState } from "@/features/finance/model";
import { parseState } from "@/features/finance/schema";
import {
  LEGACY_KEY,
  serialize,
  type Listener,
} from "@/features/finance/storage/shared";

const listeners = new Set<Listener>();

export function transact<R extends FinanceState | null>(
  change: (base: FinanceState | null) => R,
): Promise<R> {
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    const result = change(raw ? parseState(JSON.parse(raw)) : null);
    if (!result) return result;
    const data = JSON.stringify(result);
    if (data === raw) return result;
    await AsyncStorage.setItem(LEGACY_KEY, data);
    for (const listener of listeners) listener(result);
    return result;
  });
}
export function subscribe(listener: Listener, _onError: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
