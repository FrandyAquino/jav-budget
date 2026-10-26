import { Pressable, View } from "react-native";
import { useFinance } from "@/features/finance/store";
import {
  budgetStatus,
  previousBudget,
  shiftMonth,
  type Budget,
} from "@/features/finance/model";
import { Amount, Card, Icon, Progress, Row, Txt, useTheme } from "@/shared/ui";
import { carriedLabel, statusColor } from "./format";
import { useT } from "@/shared/i18n/react";

export function BudgetRow({
  budget,
  onPress,
}: {
  budget: Budget;
  onPress: () => void;
}) {
  const { state } = useFinance();
  const { colors } = useTheme();
  const i18n = useT();
  const { t, money, monthName } = i18n;
  const category = state.categories.find((c) => c.id === budget.categoryId);
  const status = budgetStatus(state, budget);
  const { currency } = budget;
  const color = statusColor(status, colors);
  const base = status.limit + status.carried;
  const hasCarry = budget.rollover && !!previousBudget(state, budget);
  const fromMonth = shiftMonth(budget.month, -1);
  return (
    <Pressable
      accessibilityRole="button"
      // The card's texts aren't read on their own: say what kind of budget it is.
      accessibilityLabel={`${t("budgets.editA11y", {
        name: category?.name ?? t("budgets.categoryFallback"),
      })}, ${t(budget.rollover ? "budgets.rollsOver" : "budgets.monthlyLimit")}`}
      accessibilityHint={
        status.over
          ? t("budgets.overAmount", {
              amount: money(-status.available, currency, true),
            })
          : t("budgets.availableAmount", {
              amount: money(status.available, currency, true),
            })
      }
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: 300,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Card style={{ gap: 22 }}>
        <Row>
          <View
            style={{
              padding: 13,
              borderRadius: 15,
              backgroundColor: colors.input,
            }}
          >
            <Icon name={category?.icon ?? "grid"} color={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt size={16} weight="600">
              {category?.name}
            </Txt>
            <Txt size={11} color={colors.muted}>
              {t(budget.rollover ? "budgets.rollsOver" : "budgets.monthlyLimit")}
            </Txt>
          </View>
          <Icon name="more-horizontal" color={colors.muted} />
        </Row>
        <View>
          <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <Amount value={status.spent} currency={currency} size={24} />
            <Txt size={12} color={colors.muted}>
              {t("home.budget.of", { amount: money(base, currency, true) })}
            </Txt>
          </Row>
          <Progress value={status.progress} color={color} />
          <Row style={{ justifyContent: "space-between", marginTop: 12 }}>
            <Txt size={12} color={color}>
              {status.over
                ? t("budgets.overAmount", {
                    amount: money(-status.available, currency, true),
                  })
                : t("budgets.leftAmount", {
                    amount: money(status.available, currency, true),
                  })}
            </Txt>
            <Txt size={11} color={colors.muted}>
              {Math.round(status.progress * 100)}%
            </Txt>
          </Row>
        </View>
        {hasCarry ? (
          <Row style={{ gap: 6 }}>
            <Icon
              name="corner-down-right"
              size={14}
              color={status.carried < 0 ? colors.danger : colors.muted}
            />
            <Txt
              size={11}
              color={status.carried < 0 ? colors.danger : colors.muted}
              style={{ flex: 1 }}
            >
              {`${carriedLabel(i18n, status.carried, currency, fromMonth)} · ${t(
                "budgets.limitAmount",
                { amount: money(status.limit, currency, true) },
              )}`}
            </Txt>
          </Row>
        ) : budget.rollover ? (
          <Row style={{ gap: 6 }}>
            <Icon name="corner-down-right" size={14} color={colors.muted} />
            <Txt size={11} color={colors.muted} style={{ flex: 1 }}>
              {t("budgets.noCarry", { month: monthName(fromMonth) })}
            </Txt>
          </Row>
        ) : null}
        {status.progress >= 0.8 && (
          <Row style={{ gap: 6 }}>
            <Icon
              name={status.over ? "alert-circle" : "info"}
              color={color}
              size={14}
            />
            <Txt size={11} color={color} style={{ flex: 1 }}>
              {t(status.over ? "budgets.overHint" : "budgets.closeHint")}
            </Txt>
          </Row>
        )}
      </Card>
    </Pressable>
  );
}
