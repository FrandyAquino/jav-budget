import { t as tr } from "../../shared/i18n/core.ts";
import { shiftMonth, validMonth } from "./dates.ts";
import { monthTransactions } from "./reports.ts";
import { categoryAmount, id } from "./transactions.ts";
import type { Budget, Currency, FinanceState, MonthlyBudget } from "./types.ts";

export function spent(
  state: FinanceState,
  budget: Pick<Budget, "categoryId" | "currency" | "month">,
) {
  return monthTransactions(state, budget.month, budget.currency)
    .filter((t) => t.kind === "expense")
    .reduce((v, t) => v + categoryAmount(t, budget.categoryId), 0);
}
export function monthSpent(
  state: FinanceState,
  month: string,
  currency: Currency,
) {
  return monthTransactions(state, month, currency)
    .filter((t) => t.kind === "expense")
    .reduce((v, t) => v + t.amount, 0);
}
export type BudgetStatus = {
  limit: number;
  spent: number;
  // Previous month's remaining (limit - spent, may be negative); one month back, never chained.
  carried: number;
  available: number;
  // spent / (limit + carried); can exceed 1. 1 when nothing is available but something was spent.
  progress: number;
  over: boolean;
};
function status(limit: number, used: number, carried: number): BudgetStatus {
  const base = limit + carried;
  return {
    limit,
    spent: used,
    carried,
    available: base - used,
    progress: base > 0 ? used / base : used > 0 ? 1 : 0,
    over: used > base,
  };
}
export function previousBudget(state: FinanceState, budget: Budget) {
  const month = shiftMonth(budget.month, -1);
  return state.budgets.find(
    (b) =>
      b.month === month &&
      b.categoryId === budget.categoryId &&
      b.currency === budget.currency,
  );
}
export function budgetStatus(
  state: FinanceState,
  budget: Budget,
): BudgetStatus {
  const previous = budget.rollover ? previousBudget(state, budget) : undefined;
  return status(
    budget.limit,
    spent(state, budget),
    previous ? previous.limit - spent(state, previous) : 0,
  );
}
export function monthlyBudget(
  state: FinanceState,
  month: string,
  currency: Currency,
) {
  return state.monthlyBudgets.find(
    (b) => b.month === month && b.currency === currency,
  );
}
export type MonthlyBudgetStatus = BudgetStatus & {
  // Sum of category budget limits in the same month and currency.
  allocated: number;
  unallocated: number;
};
export function monthlyBudgetStatus(
  state: FinanceState,
  budget: MonthlyBudget,
): MonthlyBudgetStatus {
  const allocated = state.budgets
    .filter((b) => b.month === budget.month && b.currency === budget.currency)
    .reduce((v, b) => v + b.limit, 0);
  return {
    ...status(
      budget.limit,
      monthSpent(state, budget.month, budget.currency),
      0,
    ),
    allocated,
    unallocated: budget.limit - allocated,
  };
}
// Sets or (with limit null) clears the overall budget for a month and currency.
export function setMonthlyBudget(
  state: FinanceState,
  month: string,
  currency: Currency,
  limit: number | null,
): FinanceState {
  if (!validMonth(month)) throw new Error(tr("errors.monthInvalid"));
  const existing = monthlyBudget(state, month, currency);
  const rest = state.monthlyBudgets.filter((b) => b !== existing);
  if (limit === null) return { ...state, monthlyBudgets: rest };
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new Error(tr("errors.budgetLimit"));
  return {
    ...state,
    monthlyBudgets: [
      ...rest,
      { id: existing?.id ?? id(), month, currency, limit },
    ],
  };
}
// Copies category and overall budgets that the target month does not have yet.
export function copyBudgets(
  state: FinanceState,
  fromMonth: string,
  toMonth: string,
): { state: FinanceState; copied: number } {
  if (!validMonth(fromMonth) || !validMonth(toMonth))
    throw new Error(tr("errors.monthInvalid"));
  if (fromMonth === toMonth) return { state, copied: 0 };
  const budgets = state.budgets
    .filter(
      (b) =>
        b.month === fromMonth &&
        !state.budgets.some(
          (t) =>
            t.month === toMonth &&
            t.categoryId === b.categoryId &&
            t.currency === b.currency,
        ),
    )
    .map((b) => ({ ...b, id: id(), month: toMonth }));
  const monthlyBudgets = state.monthlyBudgets
    .filter(
      (b) =>
        b.month === fromMonth && !monthlyBudget(state, toMonth, b.currency),
    )
    .map((b) => ({ ...b, id: id(), month: toMonth }));
  const copied = budgets.length + monthlyBudgets.length;
  return copied
    ? {
        state: {
          ...state,
          budgets: [...state.budgets, ...budgets],
          monthlyBudgets: [...state.monthlyBudgets, ...monthlyBudgets],
        },
        copied,
      }
    : { state, copied };
}
