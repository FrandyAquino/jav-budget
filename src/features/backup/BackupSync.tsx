import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFinance } from "@/features/finance/store";
import { runAutoBackup } from "./files";
import { canAccessLedger, useSyncStatus } from "@/features/sync/status";

// Debounce after writes, so a burst of edits produces one check.
const DEBOUNCE_MS = 5000;

// Runs the automatic backup (native) after data changes and when the app
// returns to the foreground. Renders nothing; failures never reach the UI
// beyond the status line in Settings.
export function BackupSync() {
  const { state, ready: loaded } = useFinance();
  const account = useSyncStatus();
  const ready = loaded && canAccessLedger(account);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
    if (!ready) return;
    const timer = setTimeout(() => void runAutoBackup(state), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ready, state]);
  useEffect(() => {
    if (!ready) return;
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void runAutoBackup(latest.current);
    });
    return () => subscription.remove();
  }, [ready]);
  return null;
}
