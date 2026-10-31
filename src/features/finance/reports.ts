import { dateString, daysInRange, periodRange, today } from "./dates.ts";
import { convert } from "./money.ts";
import { nextDate, recurringTemplate } from "./recurrence.ts";
import { allocations, balancesByAccount, hasCategory } from "./transactions.ts";
import type {
  Currency,
  DateRange,
  ExchangeRate,
  FinanceState,
  Transaction,
} from "./types.ts";

function currencyAccounts(state: FinanceState, currency: Currency) {
  return new Set(
    state.accounts.filter((a) => a.currency === currency).map((a) => a.id),
  );
}
export function rangeTransactions(
  state: FinanceState,
  range: DateRange,
  currency: Currency,
) {
  const ids = currencyAccounts(state, currency);
  const now = today();
  const end = range.to < now ? range.to : now;
  return state.transactions.filter(
    (t) => ids.has(t.accountId) && t.date >= range.from && t.date <= end,
  );
}
function cashFlow(state: FinanceState, tx: Transaction[], currency: Currency) {
  return {
    income: tx
      .filter((t) => t.kind === "income")
      .reduce((v, t) => v + t.amount, 0),
    expense: tx
      .filter((t) => t.kind === "expense")
      .reduce((v, t) => v + t.amount, 0),
    balance: currencyBalance(state, currency),
  };
}
export function currencyBalance(state: FinanceState, currency: Currency) {
  const balances = balancesByAccount(state);
  return state.accounts
    .filter((a) => a.currency === currency)
    .reduce((v, a) => v + (balances.get(a.id) ?? 0), 0);
}
export function rangeTotals(
  state: FinanceState,
  range: DateRange,
  currency: Currency,
) {
  return cashFlow(state, rangeTransactions(state, range, currency), currency);
}
export function monthTransactions(
  state: FinanceState,
  month: string,
  currency: Currency,
) {
  const ids = currencyAccounts(state, currency);
  const now = today();
  return state.transactions.filter(
    (t) => t.date.startsWith(month) && t.date <= now && ids.has(t.accountId),
  );
}
export function periodTransactions(
  state: FinanceState,
  period: string,
  currency: Currency,
) {
  const ids = currencyAccounts(state, currency);
  const { from, to } = periodRange(period);
  const now = today();
  const end = to < now ? to : now;
  return state.transactions.filter(
    (t) => t.date >= from && t.date <= end && ids.has(t.accountId),
  );
}
export function totals(state: FinanceState, month: string, currency: Currency) {
  return cashFlow(state, monthTransactions(state, month, currency), currency);
}
// Per-category totals honoring splits, largest first.
export function categoryTotals(
  transactions: readonly Transaction[],
  kind: "expense" | "income" = "expense",
) {
  const sums = new Map<string, number>();
  for (const t of transactions)
    if (t.kind === kind)
      for (const a of allocations(t))
        sums.set(a.categoryId, (sums.get(a.categoryId) ?? 0) + a.amount);
  return [...sums]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
}
export function categoryBreakdown(
  state: FinanceState,
  range: DateRange,
  currency: Currency,
  kind: "expense" | "income" = "expense",
) {
  return categoryTotals(rangeTransactions(state, range, currency), kind);
}
export function balanceSeries(
  state: FinanceState,
  currency: Currency,
  range: DateRange,
) {
  const accounts = state.accounts.filter((a) => a.currency === currency);
  const ids = new Set(accounts.map((a) => a.id));
  let balance = accounts.reduce((sum, a) => sum + a.opening, 0);
  const changes = new Map<string, number>();
  const now = today();
  for (const t of state.transactions) {
    if (t.date > range.to || t.date > now) continue;
    const delta =
      (ids.has(t.accountId)
        ? t.kind === "income"
          ? t.amount
          : -t.amount
        : 0) +
      (t.kind === "transfer" && t.toAccountId && ids.has(t.toAccountId)
        ? (t.received ?? t.amount)
        : 0);
    if (t.date < range.from) balance += delta;
    else changes.set(t.date, (changes.get(t.date) ?? 0) + delta);
  }
  const cursor = new Date(`${range.from}T12:00:00`);
  return Array.from(
    { length: Math.max(1, Math.min(366, daysInRange(range))) },
    () => {
      const date = dateString(cursor);
      balance += changes.get(date) ?? 0;
      cursor.setDate(cursor.getDate() + 1);
      return { date, value: balance };
    },
  );
}
export type NetWorth = {
  currency: Currency;
  // Undefined when another currency holds money and no exchange rate is set.
  total: number | undefined;
  needsRate: boolean;
  byCurrency: Record<Currency, number>;
  rate?: ExchangeRate;
};
// Only the accounts counted as available money (excludeFromTotal unset).
export function availableState(state: FinanceState): FinanceState {
  return state.accounts.some((a) => a.excludeFromTotal)
    ? { ...state, accounts: state.accounts.filter((a) => !a.excludeFromTotal) }
    : state;
}
export function netWorth(state: FinanceState, currency: Currency): NetWorth {
  const byCurrency: Record<Currency, number> = {
    DOP: currencyBalance(state, "DOP"),
    USD: currencyBalance(state, "USD"),
  };
  const rate = state.settings.exchangeRate;
  let total: number | undefined = 0;
  for (const c of ["DOP", "USD"] as const) {
    const has = state.accounts.some((a) => a.currency === c);
    if (!has) continue;
    const value = convert(byCurrency[c], c, currency, rate);
    if (value === undefined) {
      total = undefined;
      break;
    }
    total += value;
  }
  return { currency, total, needsRate: total === undefined, byCurrency, rate };
}
export type EntryView =
  "all" | "category" | "day" | "week" | "month" | "recurring" | "upcoming";
// Category filters match any split part; entries keep their full amount (see categoryAmount).
export function reportEntries(
  state: FinanceState,
  currency: Currency,
  range: DateRange,
  mode: EntryView,
  category = "",
): Transaction[] {
  if (mode === "upcoming") {
    const now = today();
    const result: Transaction[] = [];
    for (const r of state.recurring) {
      if (
        !r.active ||
        !state.accounts.some(
          (a) => a.id === r.accountId && a.currency === currency,
        )
      )
        continue;
      let date = r.nextDate;
      for (let i = 0; i < 600 && date <= range.to; i++) {
        if (
          date >= range.from &&
          date > now &&
          (!category || hasCategory(r, category))
        )
          result.push(recurringTemplate(r, date, `forecast:${r.id}:${date}`));
        date = nextDate(date, r.frequency, r.anchorDay, r.intervalDays);
      }
    }
    return result;
  }
  return rangeTransactions(state, range, currency).filter(
    (t) =>
      (!category || hasCategory(t, category)) &&
      (mode !== "recurring" || !!t.recurringId),
  );
}
