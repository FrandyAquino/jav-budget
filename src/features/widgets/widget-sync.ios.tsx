import { useEffect, useRef } from "react";
import { useFinance } from "@/features/finance/store";
import BudgetWidget from "./budget-widget";
import { monthKey } from "@/features/finance/model";
import { widgetTimeline } from "./snapshot";
import { useT } from "@/shared/i18n/react";

const DEBOUNCE_MS = 800;

// Pushes a fresh snapshot to the home-screen widget whenever finance state changes.
export function WidgetSync() {
  const { state, ready } = useFinance();
  // Snapshot strings follow the app language; resync when it changes.
  const { lang } = useT();
  const last = useRef("");
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      try {
        const entries = widgetTimeline(state);
        const key = monthKey() + JSON.stringify(entries.map((e) => e.props));
        if (key === last.current) return;
        last.current = key;
        BudgetWidget.updateTimeline(entries);
      } catch (error) {
        console.warn("Widget sync failed", error);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, ready, lang]);
  return null;
}
