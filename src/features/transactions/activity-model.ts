import {
  allocations,
  categoryAmount,
  dateString,
  entryAmount,
  hasCategory,
  monthKey,
  today,
  weekStart,
  type Currency,
  type FinanceState,
  type Transaction,
} from "@/features/finance/model";
import { getLanguage, translate, type Language } from "@/shared/i18n/core";
import {
  dayLabel,
  foldText,
  monthLabel,
  shortDate,
} from "@/shared/i18n/format";

export type Filters = {
  account: string;
  category: string;
  from: string;
  to: string;
  min: string;
  max: string;
  sort: "newest" | "oldest" | "amount";
};
export const defaultFilters: Filters = {
  account: "",
  category: "",
  from: "",
  to: "",
  min: "",
  max: "",
  sort: "newest",
};
export type GroupBy =
  | "all"
  | "day"
  | "week"
  | "month"
  | "recurring"
  | "upcoming"
  | "category"
  | "account"
  | "type";
export const dateGroups: GroupBy[] = ["day", "all", "recurring", "upcoming"];

export type ActivityItem =
  | {
      type: "header";
      key: string;
      title: string;
      count: number;
      // Category share for "By category" (split-aware); undefined elsewhere.
      total?: number;
    }
  | { type: "row"; key: string; transaction: Transaction };

export function filtersApplied(filters: Filters) {
  return Object.entries(filters).some(
    ([key, value]) => value !== defaultFilters[key as keyof Filters],
  );
}

function categoryNames(state: FinanceState, t: Transaction) {
  return allocations(t)
    .map((a) => state.categories.find((c) => c.id === a.categoryId)?.name ?? "")
    .join(" ");
}

export function filterTransactions(
  state: FinanceState,
  source: Transaction[],
  {
    kind,
    currency,
    groupBy,
    search,
    filters,
  }: {
    kind: string;
    currency: Currency;
    groupBy: GroupBy;
    search: string;
    filters: Filters;
  },
) {
  const query = foldText(search.trim());
  // Same "digits as cents" interpretation as every other amount input.
  const mode = state.settings.numberEntry;
  // Text saved under the other mode may no longer parse; ignore it then.
  const bound = (text: string) => {
    if (!text) return undefined;
    try {
      return entryAmount(text, mode, true);
    } catch {
      return undefined;
    }
  };
  const min = bound(filters.min);
  const max = bound(filters.max);
  return source
    .filter((t) => {
      const account = state.accounts.find((a) => a.id === t.accountId);
      return (
        (kind === "all" || t.kind === kind) &&
        account?.currency === currency &&
        (groupBy !== "recurring" || !!t.recurringId) &&
        (!query ||
          foldText(
            `${t.title} ${t.note} ${categoryNames(state, t)} ${(t.tags ?? []).map((tag) => `#${tag}`).join(" ")}`,
          ).includes(query)) &&
        (!filters.account ||
          t.accountId === filters.account ||
          t.toAccountId === filters.account) &&
        (!filters.category || hasCategory(t, filters.category)) &&
        (!filters.from || t.date >= filters.from) &&
        (!filters.to || t.date <= filters.to) &&
        (min === undefined || t.amount >= min) &&
        (max === undefined || t.amount <= max)
      );
    })
    .sort((a, b) =>
      filters.sort === "amount"
        ? b.amount - a.amount
        : filters.sort === "oldest"
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date) ||
            (b.time ?? "").localeCompare(a.time ?? "") ||
            b.id.localeCompare(a.id),
    );
}

// Net of income minus expenses. With a category filter, only that category's share counts.
export function netTotal(rows: Transaction[], category = "") {
  return rows.reduce((sum, t) => {
    const value = category ? categoryAmount(t, category) : t.amount;
    return (
      sum +
      (t.kind === "income" ? value : t.kind === "expense" ? -value : 0)
    );
  }, 0);
}

// Group keys are stable (ids, ISO dates, kinds); titles are localized.
function groupTitle(
  state: FinanceState,
  key: string,
  groupBy: GroupBy,
  lang: Language,
) {
  if (key === TRANSFERS) return translate(lang, "kindPlural.transfer");
  if (key === UNCATEGORIZED) return translate(lang, "common.uncategorized");
  switch (groupBy) {
    case "category":
      return state.categories.find((c) => c.id === key)?.name ?? key;
    case "account":
      return (
        state.accounts.find((a) => a.id === key)?.name ??
        translate(lang, "common.account")
      );
    case "type":
      return translate(lang, `kindPlural.${key as Transaction["kind"]}`);
    case "week":
      return translate(lang, "dates.weekOf", { date: shortDate(key, lang) });
    case "month":
      return monthLabel(key, lang);
    default: {
      const now = today();
      return dayLabel(key, now, shiftDay(now, -1), lang);
    }
  }
}
const TRANSFERS = "\u0000transfers";
const UNCATEGORIZED = "\u0000uncategorized";
function shiftDay(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateString(d);
}

// Flattens grouped rows into one array of headers and rows for a virtualized list.
export function activityItems(
  state: FinanceState,
  rows: Transaction[],
  groupBy: GroupBy,
  categoryFilter = "",
  lang: Language = getLanguage(),
): ActivityItem[] {
  const groups = new Map<
    string,
    { transactions: Transaction[]; total?: number }
  >();
  const add = (key: string, t: Transaction, share?: number) => {
    const group = groups.get(key);
    if (group) {
      group.transactions.push(t);
      if (share !== undefined) group.total = (group.total ?? 0) + share;
    } else groups.set(key, { transactions: [t], total: share });
  };
  for (const t of rows) {
    if (groupBy === "category") {
      const parts = allocations(t).filter(
        (a) => !categoryFilter || a.categoryId === categoryFilter,
      );
      if (!parts.length) add(TRANSFERS, t);
      // A split entry appears under each of its categories, with that part's share.
      for (const categoryId of new Set(parts.map((p) => p.categoryId)))
        add(
          state.categories.some((c) => c.id === categoryId)
            ? categoryId
            : UNCATEGORIZED,
          t,
          categoryAmount(t, categoryId),
        );
      continue;
    }
    add(
      groupBy === "week"
        ? weekStart(t.date)
        : groupBy === "month"
          ? monthKey(t.date)
          : dateGroups.includes(groupBy)
            ? t.date
            : groupBy === "account"
              ? t.accountId
              : t.kind,
      t,
    );
  }
  const items: ActivityItem[] = [];
  for (const [key, group] of groups) {
    items.push({
      type: "header",
      key: `header:${key}`,
      title: groupTitle(state, key, groupBy, lang),
      count: group.transactions.length,
      total: group.total,
    });
    for (const t of group.transactions)
      items.push({ type: "row", key: `${key}:${t.id}`, transaction: t });
  }
  return items;
}
