import { useEffect, useRef, type ReactNode } from "react";
import type { Language } from "@/shared/i18n/core";
import { I18nProvider, useT } from "@/shared/i18n/react";
import { relabelDemo } from "./model";
import { useFinance } from "./store";

// Applies the saved language setting and keeps untouched demo/seed records in
// the active language.
export function FinanceI18nProvider({ children }: { children: ReactNode }) {
  const { state } = useFinance();
  return (
    <I18nProvider setting={state.settings.language}>
      <RelabelDemo />
      {children}
    </I18nProvider>
  );
}
function RelabelDemo() {
  const { lang } = useT();
  const { state, ready, update } = useFinance();
  // The language seed text was last shown in; unknown until the first pass.
  const previous = useRef<Language | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const from = previous.current;
    if (relabelDemo(state, from) !== state)
      void update((s) => relabelDemo(s, from))
        .then(() => {
          previous.current = lang;
        })
        .catch(() => {});
    else previous.current = lang;
  }, [lang, ready, state, update]);
  return null;
}
