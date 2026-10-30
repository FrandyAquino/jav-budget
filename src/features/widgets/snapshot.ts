import {
  availableState,
  isHalfPeriod,
  money,
  monthSpent,
  monthlyBudget,
  monthlyBudgetStatus,
  netWorth,
  periodKey,
  periodRange,
  shiftPeriod,
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
  month = periodKey(state.settings.budgetPeriod),
): BudgetWidgetProps {
  const title = isHalfPeriod(month)
    ? state.demo
      ? "widget.thisPeriodDemo"
      : "widget.thisPeriod"
    : state.demo
      ? "widget.thisMonthDemo"
      : "widget.thisMonth";
  // With the app lock on, the home screen must not reveal amounts.
  if (state.settings.biometrics)
    return {
      title: t(title),
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
  const worth = netWorth(availableState(state), currency);
  const other = currency === "DOP" ? "USD" : "DOP";
  return {
    title: t(title),
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

// Current budget period now, plus the next period's figures from its first
// day so the widget rolls over even if the app isn't opened.
export function widgetTimeline(state: FinanceState, now = new Date()) {
  const period = periodKey(state.settings.budgetPeriod);
  const following = shiftPeriod(period, 1);
  const next = new Date(`${periodRange(following).from}T00:00:00`);
  return [
    { date: now, props: widgetSnapshot(state, period) },
    { date: next, props: widgetSnapshot(state, following) },
  ];
}
