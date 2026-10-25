import { router } from "expo-router";
import type {
  Currency,
  FinanceState,
  Transaction,
} from "@/features/finance/model";
import { Card, Empty, Section, Txt, useTheme } from "@/shared/ui";
import { SpendingRing, TrendChart } from "@/features/insights/charts";
import { spendingSlices } from "@/features/insights/spending";
import { TransactionRow } from "@/features/transactions/components";
import type { useEntryReport } from "@/shared/EntryReport";
import { useT } from "@/shared/i18n/react";

type Report = ReturnType<typeof useEntryReport>;

export function CashFlowCard({
  state,
  currency,
  report,
  month,
}: {
  state: FinanceState;
  currency: Currency;
  report: Report;
  month: string;
}) {
  const { t } = useT();
  return (
    <Card>
      <Section
        title={t("home.cashFlow.title")}
        subtitle={t("home.cashFlow.subtitle")}
      />
      {report.mode === "upcoming" ? (
        <Txt>{t("home.cashFlow.forecast")}</Txt>
      ) : (
        <TrendChart
          state={state}
          currency={currency}
          month={month}
          category={report.category}
          recurringOnly={report.mode === "recurring"}
        />
      )}
    </Card>
  );
}
export function RecentActivityCard({
  report,
  onEdit,
}: {
  report: Report;
  onEdit: (t: Transaction) => void;
}) {
  const { t } = useT();
  const recent = [...report.rows]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.time ?? "").localeCompare(a.time ?? ""),
    )
    .slice(0, 5);
  return (
    <Card>
      <Section
        title={t("home.recent.title")}
        action={t("common.viewAll")}
        onPress={() => router.push("/activity")}
      />
      {recent.length ? (
        recent.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            onPress={() =>
              report.mode === "upcoming" ? router.push("/recurring") : onEdit(tx)
            }
          />
        ))
      ) : (
        <Empty
          title={t("home.recent.emptyTitle")}
          description={t("home.recent.emptyBody")}
          action={t("home.recent.add")}
          onPress={() => router.push("/add")}
        />
      )}
    </Card>
  );
}
export function SpendingCard({
  state,
  currency,
  report,
}: {
  state: FinanceState;
  currency: Currency;
  report: Report;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const slices = spendingSlices(state, report.rows);
  return (
    <Card>
      <Section
        title={t("home.spending.title")}
        subtitle={t("home.spending.subtitle")}
      />
      {slices.length ? (
        <SpendingRing
          values={slices}
          total={report.expense}
          currency={currency}
        />
      ) : (
        <Txt color={colors.muted}>
          {t("home.spending.empty")}
        </Txt>
      )}
    </Card>
  );
}
