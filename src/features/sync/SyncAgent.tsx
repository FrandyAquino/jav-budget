import { useEffect } from "react";
import { AppState } from "react-native";
import { useFinance } from "@/features/finance/store";
import { onOutboxChange } from "@/features/finance/storage/shared";
import { requestSync, startSync } from "./engine";
import { syncConfigured } from "./config";

// Local writes are pushed after a short pause, so a burst of edits is one sync.
const DEBOUNCE_MS = 2000;

// Runs cloud sync in the background once the ledger is loaded: on sign-in and
// launch (auth events), on returning to the foreground and after local
// changes. Renders nothing; status lives in ./status.
export function SyncAgent() {
  const { ready } = useFinance();
  useEffect(() => {
    if (!ready || !syncConfigured) return;
    const stop = startSync();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offOutbox = onOutboxChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void requestSync(), DEBOUNCE_MS);
    });
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void requestSync();
    });
    return () => {
      stop();
      offOutbox();
      clearTimeout(timer);
      subscription.remove();
    };
  }, [ready]);
  return null;
}
