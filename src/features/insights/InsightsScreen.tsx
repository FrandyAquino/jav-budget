import {
  EntryReportControls,
  EntryBreakdown,
  useEntryReport,
} from "@/shared/EntryReport";
import { View } from "react-native";
import { useFinance } from "@/features/finance/store";
import {
  categoryTotals,
  periodKey,
  periodTransactions,
  daysInRange,
} from "@/features/finance/model";
import { useT } from "@/shared/i18n/react";
import {
  Amount,
  Card,
  CurrencySwitch,
  Empty,
  Grid,
  Icon,
  Progress,
  Row,
  Screen,
  Section,
  Txt,
  useTheme,
} from "@/shared/ui";
import { PeriodSelector, usePeriod } from "@/shared/PeriodSelector";
import { SpendingRing, TrendChart } from "./charts";
import { spendingSlices } from "./spending";

export default function InsightsScreen() {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t, money } = useT();
  const period = usePeriod();
  const report = useEntryReport(period.range);
  const month = period.range.to.slice(0, 7);
  const currency = state.settings.currency;
  const summary = { income: report.income, expense: report.expense };
  const net = summary.income - summary.expense;
  const categories = spendingSlices(state, report.rows);
  const days = daysInRange(report.scope);
  const thisMonth = periodKey(state.settings.budgetPeriod);
  const budgets = state.budgets.filter(
    (b) => b.month === thisMonth && b.currency === currency,
  );
  // One split-aware pass over the budget period instead of a full scan per budget.
  const spentBy = new Map(
    categoryTotals(
      periodTransactions(state, thisMonth, currency),
      "expense",
    ).map((c) => [c.categoryId, c.amount]),
  );
  const names = new Map(state.categories.map((c) => [c.id, c.name]));
  return (
    <Screen title={t("insights.title")} subtitle={t("insights.subtitle")}>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <PeriodSelector period={period} />
        <EntryReportControls report={report} />
        <CurrencySwitch />
      </Row>
      <EntryBreakdown report={report} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {[
          {
            label: t("kindPlural.income"),
            value: summary.income,
            icon: "arrow-down-left",
          },
          {
            label: t("kindPlural.expense"),
            value: summary.expense,
            icon: "arrow-up-right",
          },
          { label: t("insights.net"), value: net, icon: "activity" },
        ].map((item) => (
          <Card key={item.label} style={{ flex: 1, flexBasis: 180, gap: 14 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt color={colors.muted} size={12}>
                {item.label}
              </Txt>
              <Icon name={item.icon} size={17} color={colors.accent} />
            </Row>
            <Amount value={item.value} currency={currency} size={28} />
          </Card>
        ))}
      </View>
      <Grid>
        {[
          <Card key="trend">
            <Section
              title={t("insights.trendTitle")}
              subtitle={t("insights.trendSubtitle")}
            />
            {report.mode === "upcoming" ? (
              <Txt>{t("insights.upcomingHint")}</Txt>
            ) : (
              <TrendChart
                state={state}
                currency={currency}
                month={month}
                category={report.category}
                recurringOnly={report.mode === "recurring"}
              />
            )}
          </Card>,
          <Card key="categories">
            <Section
              title={t("insights.categoriesTitle")}
              subtitle={t("insights.categoriesSubtitle")}
            />
            {categories.length ? (
              <SpendingRing
                values={categories}
                total={summary.expense}
                currency={currency}
              />
            ) : (
              <Empty
                title={t("insights.emptyTitle")}
                description={t("insights.emptyBody")}
              />
            )}
          </Card>,
        ]}
      </Grid>
      <Card>
        <Section
          title={t("insights.budgetTitle")}
          subtitle={t("insights.budgetSubtitle")}
        />
        {budgets.length ? (
          budgets.map((b) => {
            const used = spentBy.get(b.categoryId) ?? 0;
            return (
              <View key={b.id} style={{ gap: 9, marginBottom: 20 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt size={13}>{names.get(b.categoryId)}</Txt>
                  <Txt
                    size={12}
                    color={used > b.limit ? colors.danger : colors.muted}
                  >
                    {Math.round((used / b.limit) * 100)}% ·{" "}
                    {money(used, currency, true)} /{" "}
                    {money(b.limit, currency, true)}
                  </Txt>
                </Row>
                <Progress
                  value={used / b.limit}
                  color={used > b.limit ? colors.danger : colors.accent}
                />
              </View>
            );
          })
        ) : (
          <Txt size={13} color={colors.muted}>
            {t("insights.budgetEmpty")}
          </Txt>
        )}
      </Card>
      <Card style={{ backgroundColor: colors.soft, borderColor: colors.soft }}>
        <Row style={{ alignItems: "flex-start" }}>
          <View
            style={{
              padding: 12,
              borderRadius: 15,
              backgroundColor: colors.surface,
            }}
          >
            <Icon name="sun" color={colors.accent} size={23} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt size={16} weight="600">
              {t("insights.perspectiveTitle")}
            </Txt>
            <Txt size={13} color={colors.muted}>
              {summary.income
                ? t("insights.kept", {
                    percent: Math.round((net / summary.income) * 100),
                  })
                : t("insights.addIncome")}{" "}
              {categories[0]
                ? t("insights.biggest", {
                    name: categories[0].label,
                    amount: money(categories[0].value, currency),
                    daily: money(Math.round(summary.expense / days), currency),
                  })
                : t("insights.grow")}
            </Txt>
            <Txt size={11} color={colors.muted}>
              {t("insights.footnote")}
            </Txt>
          </View>
        </Row>
      </Card>
    </Screen>
  );
}
