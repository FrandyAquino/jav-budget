import { allTranslations, type PlainKey } from "../../shared/i18n/core.ts";
import type { Category, FinanceState } from "./types.ts";

// Starter categories the onboarding suggests (named per language through
// starterKeys); `name` keeps the English text.
export const defaultCategories: Category[] = [
  {
    id: "food",
    name: "Food & drinks",
    icon: "coffee",
    color: "#555B65",
    kind: "expense",
  },
  {
    id: "shopping",
    name: "Shopping",
    icon: "shopping-bag",
    color: "#7F6A7E",
    kind: "expense",
  },
  {
    id: "transport",
    name: "Transport",
    icon: "truck",
    color: "#466477",
    kind: "expense",
  },
  {
    id: "home",
    name: "Home & bills",
    icon: "home",
    color: "#687666",
    kind: "expense",
  },
  {
    id: "health",
    name: "Health",
    icon: "heart",
    color: "#7E8791",
    kind: "expense",
  },
  {
    id: "fun",
    name: "Entertainment",
    icon: "headphones",
    color: "#8A7264",
    kind: "expense",
  },
  {
    id: "salary",
    name: "Salary",
    icon: "briefcase",
    color: "#687666",
    kind: "income",
  },
  {
    id: "freelance",
    name: "Freelance",
    icon: "monitor",
    color: "#466477",
    kind: "income",
  },
  {
    id: "other",
    name: "Other income",
    icon: "gift",
    color: "#7F6A7E",
    kind: "income",
  },
];
export const starterKeys: Record<string, PlainKey> = {
  food: "starter.category.food",
  shopping: "starter.category.shopping",
  transport: "starter.category.transport",
  home: "starter.category.home",
  health: "starter.category.health",
  fun: "starter.category.fun",
  salary: "starter.category.salary",
  freelance: "starter.category.freelance",
  other: "starter.category.other",
};
// A starter category with its seeded id and an untouched seeded name.
const isStarter = (c: Category) => {
  const key = starterKeys[c.id];
  return !!key && allTranslations(key).includes(c.name);
};
// Old data may hold starter categories the user never used. Drop those.
export function withoutUnusedDefaults(state: FinanceState): FinanceState {
  const used = new Set([
    ...[...state.transactions, ...state.recurring].flatMap((t) => [
      t.categoryId,
      ...(t.splits ?? []).map((s) => s.categoryId),
    ]),
    ...state.budgets.map((b) => b.categoryId),
  ]);
  const categories = state.categories.filter(
    (c) => used.has(c.id) || !isStarter(c),
  );
  return categories.length === state.categories.length
    ? state
    : { ...state, categories };
}
// One-time cleanup for data saved before starter categories became optional.
// The persisted marker makes it run once, so later launches never remove
// anything (the user may have recreated a category with a starter name).
export function pruneStarterCategoriesOnce(state: FinanceState): FinanceState {
  if (state.starterPruned) return state;
  return { ...withoutUnusedDefaults(state), starterPruned: true };
}
export function emptyState(): FinanceState {
  return {
    version: 2,
    // Fresh data has nothing to clean up.
    starterPruned: true,
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    monthlyBudgets: [],
    recurring: [],
    goals: [],
    settings: {
      name: "",
      email: "",
      numberEntry: "decimal",
      appIcon: "graphite",
      language: "system",
      // Brand-new data goes through the first-run onboarding.
      onboarded: false,
      currency: "DOP",
      appearance: "system",
      biometrics: false,
      notifications: false,
      budgetPeriod: "monthly",
      autoBackup: true,
    },
  };
}
