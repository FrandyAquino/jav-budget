import { Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  categoryTotals,
  periodKey,
  periodTransactions,
  type Currency,
  type FinanceState,
} from "@/features/finance/model";
import {
  Amount,
  Card,
  Empty,
  Icon,
  Progress,
  Row,
  Section,
  Txt,
  useTheme,
} from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

export function BudgetCard({
  state,
  currency,
}: {
  state: FinanceState;
  currency: Currency;
}) {
  const { colors } = useTheme();
  const { t, money } = useT();
  const month = periodKey(state.settings.budgetPeriod);
  const budgets = state.budgets.filter(
    (b) => b.month === month && b.currency === currency,
  );
  // One split-aware pass over the budget period instead of a full scan per budget.
  const spentBy = new Map(
    categoryTotals(periodTransactions(state, month, currency), "expense").map(
      (c) => [c.categoryId, c.amount],
    ),
  );
  const names = new Map(state.categories.map((c) => [c.id, c.name]));
  const limit = budgets.reduce((v, b) => v + b.limit, 0);
  const used = budgets.reduce(
    (v, b) => v + (spentBy.get(b.categoryId) ?? 0),
    0,
  );
  const over = used > limit;
  return (
    <Card>
      <Section
        title={t("home.budget.title")}
        action={t("common.details")}
        onPress={() => router.push("/budgets")}
      />
      {limit ? (
        <>
          <Row style={{ justifyContent: "space-between", marginBottom: 15 }}>
            <View>
              <Txt size={11} color={colors.muted}>
                {limit - used >= 0
                  ? t("home.budget.leftToSpend")
                  : t("home.budget.overBudget")}
              </Txt>
              <Amount
                value={Math.abs(limit - used)}
                currency={currency}
                size={28}
              />
            </View>
            <View
              style={{
                backgroundColor: over ? `${colors.danger}15` : colors.soft,
                padding: 9,
                borderRadius: 12,
              }}
            >
              <Icon
                name={over ? "alert-triangle" : "pie-chart"}
                color={over ? colors.danger : colors.accent}
              />
            </View>
          </Row>
          <Progress
            value={used / limit}
            color={over ? colors.danger : colors.accent}
          />
          <Row style={{ justifyContent: "space-between", marginTop: 10 }}>
            <Txt size={10} color={colors.muted}>
              {t("home.budget.used", {
                percent: Math.round((used / limit) * 100),
              })}
            </Txt>
            <Txt size={10} color={colors.muted}>
              {t("home.budget.of", { amount: money(limit, currency, true) })}
            </Txt>
          </Row>
          <View style={{ marginTop: 22, gap: 17 }}>
            {budgets.slice(0, 4).map((b) => {
              const amount = spentBy.get(b.categoryId) ?? 0;
              const exceeded = amount > b.limit;
              return (
                <Pressable
                  key={b.id}
                  accessibilityRole="button"
                  onPress={() => router.push("/budgets")}
                  style={{ gap: 7 }}
                >
                  <Row style={{ justifyContent: "space-between" }}>
                    <Txt size={12} weight="500">
                      {names.get(b.categoryId)}
                    </Txt>
                    <Txt
                      size={11}
                      color={exceeded ? colors.danger : colors.muted}
                    >
                      {Math.round((amount / b.limit) * 100)}%
                    </Txt>
                  </Row>
                  <Progress
                    value={amount / b.limit}
                    color={exceeded ? colors.danger : colors.accent}
                  />
                  <Txt size={10} color={colors.muted}>
                    {t(
                      exceeded
                        ? "home.budget.rowOver"
                        : "home.budget.rowLeft",
                      {
                        spent: money(amount, currency, true),
                        amount: money(
                          Math.abs(b.limit - amount),
                          currency,
                          true,
                        ),
                      },
                    )}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <Empty
          title={t("home.budget.emptyTitle")}
          description={t("home.budget.emptyBody")}
          action={t("home.budget.create")}
          onPress={() => router.push("/budgets")}
        />
      )}
    </Card>
  );
}
