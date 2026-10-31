import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { today } from "./dates";

// Checks again just after midnight and on returning to the foreground (timers
// don't fire while the app is suspended).
function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const midnight = new Date();
    midnight.setHours(24, 0, 1, 0);
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, midnight.valueOf() - Date.now());
  };
  schedule();
  const subscription = AppState.addEventListener("change", (status) => {
    if (status === "active") onChange();
  });
  return () => {
    clearTimeout(timer);
    subscription.remove();
  };
}
// Today's local date ("YYYY-MM-DD"); re-renders when the day changes, so
// values derived from it aren't kept stale by memoization.
export function useToday() {
  return useSyncExternalStore(subscribe, today, today);
}
