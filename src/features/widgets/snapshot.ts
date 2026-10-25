import {
  money,
  monthKey,
  monthSpent,
  monthlyBudget,
  monthlyBudgetStatus,
  netWorth,
  shiftMonth,
  type FinanceState,
} from "@/features/finance/model";
import { t } from "@/shared/i18n/core";

// Everything is pre-formatted and pre-translated (active app language): the
// widget runtime can't import app helpers or dictionaries.
export type BudgetWidgetProps = {
  title: string;
  noBudgetLabel: string;
  netWorthLabel: string;
  spent: string;
  hasBudget: boolean;
  budget: string;
  budgetOver: boolean;
  netWorth: string;
  // Second currency line when no exchange rate lets us combine balances.
  netWorthAlt: string;
  demo: boolean;
};

export function widgetSnapshot(
  state: FinanceState,
  month = monthKey(),
): BudgetWidgetProps {
  // With the app lock on, the home screen must not reveal amounts.
  if (state.settings.biometrics)
    return {
      title: t(state.demo ? "widget.thisMonthDemo" : "widget.thisMonth"),
      noBudgetLabel: t("widget.locked"),
      netWorthLabel: t("widget.netWorth"),
      spent: "—",
      hasBudget: false,
      budget: "",
      budgetOver: false,
      netWorth: "—",
      netWorthAlt: "",
      demo: state.demo,
    };
  const currency = state.settings.currency;
  const cap = monthlyBudget(state, month, currency);
  const status = cap ? monthlyBudgetStatus(state, cap) : undefined;
  const worth = netWorth(state, currency);
  const other = currency === "DOP" ? "USD" : "DOP";
  return {
    title: t(state.demo ? "widget.thisMonthDemo" : "widget.thisMonth"),
    noBudgetLabel: t("widget.noBudget"),
    netWorthLabel: t("widget.netWorth"),
    spent: money(monthSpent(state, month, currency), currency, true),
    hasBudget: !!status,
    budget: !status
      ? ""
      : status.over
        ? t("widget.over", { amount: money(-status.available, currency, true) })
        : t("widget.left", { amount: money(status.available, currency, true) }),
    budgetOver: !!status?.over,
    netWorth: money(
      worth.total ?? worth.byCurrency[currency],
      currency,
      true,
    ),
    netWorthAlt:
      worth.total === undefined
        ? money(worth.byCurrency[other], other, true)
        : "",
    demo: state.demo,
  };
}

// Current month now, plus next month's figures from its first day so the
// widget rolls over even if the app isn't opened.
export function widgetTimeline(state: FinanceState, now = new Date()) {
  const month = monthKey();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return [
    { date: now, props: widgetSnapshot(state, month) },
    { date: next, props: widgetSnapshot(state, shiftMonth(month, 1)) },
  ];
}
