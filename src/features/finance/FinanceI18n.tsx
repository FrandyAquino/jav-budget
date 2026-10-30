import type { ReactNode } from "react";
import { I18nProvider } from "@/shared/i18n/react";
import { useFinance } from "./store";

// Applies the saved language setting.
export function FinanceI18nProvider({ children }: { children: ReactNode }) {
  const { state } = useFinance();
  return (
    <I18nProvider setting={state.settings.language}>{children}</I18nProvider>
  );
}
