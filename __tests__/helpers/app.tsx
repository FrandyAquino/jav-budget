import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderRouter, screen } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import {
  emptyState,
  money,
  monthKey,
  today,
  type Currency,
  type FinanceState,
} from "@/features/finance/model";
import { LEGACY_KEY } from "@/features/finance/storage/shared";
import { translator, type Language } from "@/shared/i18n/core";
import { createI18n } from "@/shared/i18n/react";

// Strings come from the real dictionaries so tests follow copy changes.
export const en = translator("en");
export const es = translator("es");
// Date/month formatting helpers in English (monthName, monthLabel, ...).
export const enI18n = createI18n("en");
export const fmt = (cents: number, currency: Currency = "DOP", lang: Language = "en") =>
  money(cents, currency, false, lang);

export const MONTH = monthKey();
export const TODAY = today();

// A small, non-demo ledger with ids/names that are not starter categories
// (withoutUnusedDefaults would drop unused starter categories on load).
export function fixture(patch: Partial<FinanceState> = {}): FinanceState {
  const base = emptyState();
  return {
    ...base,
    accounts: [
      { id: "main", name: "Main checking", type: "bank", currency: "DOP", opening: 1_000_000, color: "#356C56" },
      { id: "dollars", name: "Dollar savings", type: "bank", currency: "USD", opening: 50_000, color: "#6F97B2" },
    ],
    categories: [
      { id: "groceries", name: "Groceries", icon: "shopping-bag", color: "#555B65", kind: "expense" },
      { id: "dining", name: "Dining out", icon: "coffee", color: "#7F6A7E", kind: "expense" },
      { id: "rent", name: "Rent", icon: "home", color: "#687666", kind: "expense" },
      { id: "paycheck", name: "Paycheck", icon: "briefcase", color: "#687666", kind: "income" },
    ],
    transactions: [
      { id: "t-beans", kind: "expense", amount: 45_000, accountId: "main", categoryId: "groceries", title: "Coffee beans", note: "", date: TODAY, tags: [] },
      { id: "t-dinner", kind: "expense", amount: 120_000, accountId: "main", categoryId: "dining", title: "Team dinner", note: "", date: TODAY, tags: [] },
      { id: "t-pay", kind: "income", amount: 300_000, accountId: "main", categoryId: "paycheck", title: "October paycheck", note: "", date: TODAY, tags: [] },
    ],
    ...patch,
    settings: { ...base.settings, name: "Ana", language: "en", onboarded: true, ...patch.settings },
  };
}

export async function seed(state: FinanceState) {
  await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(state));
}
export async function stored(): Promise<FinanceState> {
  return JSON.parse((await AsyncStorage.getItem(LEGACY_KEY)) ?? "null");
}

// Renders the real route tree (src/app) with the real root layout/providers.
export async function renderApp(initialUrl = "/", state: FinanceState = fixture()) {
  await seed(state);
  const user = userEvent.setup();
  await renderRouter("./src/app", { initialUrl });
  // FinanceProvider shows a loading shell until storage has been read.
  await screen.findByRole("tab", { name: en("tabs.home") }, { timeout: 5000 }).catch(() => undefined);
  return { user, screen };
}
