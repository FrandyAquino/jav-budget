import type { BudgetStatus, Currency } from "@/features/finance/model";
import type { I18n } from "@/shared/i18n/react";

// Accent below 80%, orange when close, danger once over.
export function statusColor(
  status: Pick<BudgetStatus, "progress" | "over">,
  colors: { accent: string; orange: string; danger: string },
) {
  return status.over
    ? colors.danger
    : status.progress > 0.8
      ? colors.orange
      : colors.accent;
}
export function carriedLabel(
  { t, money, monthName }: Pick<I18n, "t" | "money" | "monthName">,
  carried: number,
  currency: Currency,
  fromMonth: string,
) {
  const month = monthName(fromMonth);
  return carried >= 0
    ? t("budgets.carried", { amount: money(carried, currency, true), month })
    : t("budgets.overspent", { amount: money(-carried, currency, true), month });
}
