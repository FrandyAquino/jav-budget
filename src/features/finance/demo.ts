import {
  allTranslations,
  getLanguage,
  LANGUAGES,
  translate,
  t as tr,
  type Language,
  type PlainKey,
} from "../../shared/i18n/core.ts";
import { monthKey, today } from "./dates.ts";
import { nextDate } from "./recurrence.ts";
import type { Category, FinanceState, Kind } from "./types.ts";

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
// Seed text lives in the dictionaries; `defaultCategories` keeps the English
// names. Demo records are created in the active language and relabeled when
// the language changes while the demo is active: only records with a seeded
// id whose text still equals the seed in the previous language. Anything the
// user renamed or created is never touched, and tags are never relabeled.
const categoryKeys: Record<string, PlainKey> = {
  food: "demo.category.food",
  shopping: "demo.category.shopping",
  transport: "demo.category.transport",
  home: "demo.category.home",
  health: "demo.category.health",
  fun: "demo.category.fun",
  salary: "demo.category.salary",
  freelance: "demo.category.freelance",
  other: "demo.category.other",
};
const accountKeys: Record<string, PlainKey> = {
  popular: "demo.account.popular",
  cash: "demo.account.cash",
  visa: "demo.account.visa",
  usd: "demo.account.usd",
};
const goalKeys: Record<string, PlainKey> = { travel: "demo.goal.travel" };
// Brand names stay as they are; descriptive titles are translated.
const titleKeys: Record<string, PlainKey> = {
  "Monthly salary": "demo.tx.salary",
  "Apartment rent": "demo.tx.rent",
  "Uber ride": "demo.tx.uber",
  "Weekend coffee": "demo.tx.coffee",
  "Freelance project": "demo.tx.freelance",
  "Electricity bill": "demo.tx.electricity",
  "Fuel station": "demo.tx.fuel",
  "Dinner with friends": "demo.tx.dinner",
  "Internet service": "demo.tx.internet",
  "Lunch at Laurel": "demo.tx.lunch",
};
const samples: [string, string, number, number, string, Kind][] = [
  ["Monthly salary", "salary", 85000, 1, "popular", "income"],
  ["Apartment rent", "home", 24500, 2, "popular", "expense"],
  ["Supermercado Nacional", "food", 3240, 4, "popular", "expense"],
  ["Uber ride", "transport", 380, 5, "cash", "expense"],
  ["Spotify Premium", "fun", 449, 6, "visa", "expense"],
  ["Weekend coffee", "food", 420, 8, "cash", "expense"],
  ["Zara", "shopping", 3650, 9, "visa", "expense"],
  ["Freelance project", "freelance", 12000, 10, "popular", "income"],
  ["Electricity bill", "home", 2450, 11, "popular", "expense"],
  ["Farmacia Carol", "health", 1250, 12, "cash", "expense"],
  ["Fuel station", "transport", 2800, 14, "popular", "expense"],
  ["Dinner with friends", "food", 2850, 16, "visa", "expense"],
  ["Internet service", "home", 1950, 17, "popular", "expense"],
  ["Supermercado Nacional", "food", 4620, 18, "popular", "expense"],
  ["Adidas", "shopping", 4850, 19, "visa", "expense"],
  ["Café Santo Domingo", "food", 385, 20, "cash", "expense"],
  ["Uber ride", "transport", 320, 21, "cash", "expense"],
  ["Lunch at Laurel", "food", 1650, 22, "visa", "expense"],
];
// Seeded transaction id -> title key ("demo-3" is samples[3]).
const transactionKeys: Record<string, PlainKey> = Object.fromEntries(
  samples.flatMap(([title], i) =>
    titleKeys[title] ? [[`demo-${i}`, titleKeys[title]]] : [],
  ),
);
function isSeedName(category: Pick<Category, "id" | "name">) {
  const key = categoryKeys[category.id];
  return !!key && allTranslations(key).includes(category.name);
}
function relabel<T extends { id: string }>(
  rows: T[],
  field: keyof T & string,
  keys: Record<string, PlainKey>,
  from: readonly Language[],
): T[] {
  let changed = false;
  const next = rows.map((row) => {
    const key = Object.prototype.hasOwnProperty.call(keys, row.id)
      ? keys[row.id]
      : undefined;
    const value = row[field];
    if (!key || typeof value !== "string") return row;
    const label = tr(key);
    if (value === label || !from.some((lang) => translate(lang, key) === value))
      return row;
    changed = true;
    return { ...row, [field]: label };
  });
  return changed ? next : rows;
}
// Renames untouched seed records of an active demo into the active language.
// `from` is the language the app was showing before; when unknown (first run
// after launch) any other language counts. Real (non-demo) data is never
// relabeled: after "Start fresh" the user's categories are their own.
export function relabelDemo(
  state: FinanceState,
  from?: Language,
): FinanceState {
  if (!state.demo) return state;
  const active = getLanguage();
  const sources = from
    ? from === active
      ? []
      : [from]
    : LANGUAGES.filter((lang) => lang !== active);
  if (!sources.length) return state;
  const next = {
    ...state,
    categories: relabel(state.categories, "name", categoryKeys, sources),
    accounts: relabel(state.accounts, "name", accountKeys, sources),
    goals: relabel(state.goals, "name", goalKeys, sources),
    transactions: relabel(
      state.transactions,
      "title",
      transactionKeys,
      sources,
    ),
  };
  return (Object.keys(next) as (keyof FinanceState)[]).every(
    (key) => next[key] === state[key],
  )
    ? state
    : next;
}
const isStarter = (c: Category) =>
  defaultCategories.some((d) => d.id === c.id) && isSeedName(c);
// Starter categories are demo-only. Drop the ones a real user never touched.
export function withoutUnusedDefaults(state: FinanceState): FinanceState {
  if (state.demo) return state;
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
// "Start fresh" keeps only the user's own (created or renamed) categories.
export function withoutStarterCategories(categories: Category[]): Category[] {
  return categories.filter((c) => !isStarter(c));
}
// One-time cleanup for data saved before starter categories became demo-only.
// The persisted marker makes it run once, so later launches never remove
// anything (the user may have recreated a category with a starter name).
export function pruneStarterCategoriesOnce(state: FinanceState): FinanceState {
  if (state.starterPruned) return state;
  return { ...withoutUnusedDefaults(state), starterPruned: true };
}
export function emptyState(): FinanceState {
  return {
    version: 2,
    demo: false,
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
export function demoState(): FinanceState {
  const state = emptyState();
  const month = monthKey();
  const day = Number(today().slice(-2));
  state.demo = true;
  // Choosing the demo is an onboarding answer; it never shows onboarding.
  state.settings.onboarded = true;
  state.categories = defaultCategories.map((c) => ({
    ...c,
    name: tr(categoryKeys[c.id]),
  }));
  state.accounts = [
    {
      id: "popular",
      name: "Everyday account",
      type: "bank",
      currency: "DOP",
      opening: 3650000,
      color: "#356C56",
    },
    {
      id: "cash",
      name: "Cash wallet",
      type: "cash",
      currency: "DOP",
      opening: 850000,
      color: "#BA965C",
    },
    {
      id: "visa",
      name: "Visa Platinum",
      type: "credit",
      currency: "DOP",
      opening: -245000,
      limit: 10000000,
      dueDay: 28,
      color: "#7C78A5",
    },
    {
      id: "usd",
      name: "Dollar savings",
      type: "bank",
      currency: "USD",
      opening: 245000,
      color: "#6F97B2",
    },
  ];
  state.transactions = samples.map(
    ([title, categoryId, amount, d, accountId, kind], i) => ({
      id: `demo-${i}`,
      title: titleKeys[title] ? tr(titleKeys[title]) : title,
      categoryId,
      amount: amount * 100,
      date: `${month}-${String(Math.min(d, day)).padStart(2, "0")}`,
      accountId,
      kind,
      note: "",
      tags: [],
    }),
  );
  state.budgets = [
    ["food", 18000],
    ["shopping", 10000],
    ["transport", 7000],
    ["home", 32000],
  ].map(([categoryId, limit]) => ({
    id: `budget-${categoryId}`,
    categoryId: String(categoryId),
    limit: Number(limit) * 100,
    month,
    currency: "DOP",
    rollover: false,
  }));
  state.recurring = [
    {
      id: "netflix",
      title: "Netflix",
      amount: 69900,
      accountId: "visa",
      categoryId: "fun",
      kind: "expense",
      note: "",
      tags: [tr("demo.tag.subscription")],
      nextDate: nextDate(today(), "monthly", day),
      anchorDay: day,
      frequency: "monthly",
      active: true,
      subscription: true,
    },
  ];
  state.goals = [
    {
      id: "travel",
      name: "A little time away",
      currency: "DOP",
      target: 15000000,
      saved: 6200000,
    },
  ];
  for (const a of state.accounts) a.name = tr(accountKeys[a.id]);
  for (const g of state.goals) g.name = tr(goalKeys[g.id]);
  return state;
}
