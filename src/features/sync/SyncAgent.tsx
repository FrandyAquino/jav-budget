import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useFinance } from "@/features/finance/store";
import { onOutboxChange } from "@/features/finance/storage/shared";
import { requestSync, startSync } from "./engine";
import { syncConfigured } from "./config";

// Local writes are pushed after a short pause, so a burst of edits is one sync.
const DEBOUNCE_MS = 2000;
// While the app is open, changes from other devices are pulled this often.
export const POLL_MS = 60_000;

// Runs cloud sync in the background once the ledger is loaded: on sign-in and
// launch (auth events), on returning to the foreground, every minute while
// open and after local changes. Renders nothing; status lives in ./status.
export function SyncAgent() {
  const { ready } = useFinance();
  useEffect(() => {
    if (!ready || !syncConfigured) return;
    const stop = startSync();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offOutbox = onOutboxChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void requestSync("outbox"), DEBOUNCE_MS);
    });
    let poll: ReturnType<typeof setInterval> | undefined;
    const polling = (active: boolean) => {
      clearInterval(poll);
      poll = active ? setInterval(() => void requestSync("timer"), POLL_MS) : undefined;
    };
    polling(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (status) => {
      polling(status === "active");
      if (status === "active") void requestSync("focus");
    });
    // Web: a tab brought back (focus) or restored from the back/forward cache.
    const web = Platform.OS === "web" && typeof window !== "undefined";
    const onFocus = () => void requestSync("focus");
    if (web) {
      window.addEventListener("focus", onFocus);
      window.addEventListener("pageshow", onFocus);
    }
    return () => {
      stop();
      offOutbox();
      clearTimeout(timer);
      polling(false);
      subscription.remove();
      if (web) {
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("pageshow", onFocus);
      }
    };
  }, [ready]);
  return null;
}
