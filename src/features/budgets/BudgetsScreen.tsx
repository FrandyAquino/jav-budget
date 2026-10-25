import { useState } from "react";
import { Pressable, View } from "react-native";
import { useFinance } from "@/features/finance/store";
import {
  copyBudgets,
  monthKey,
  monthlyBudget,
  shiftMonth,
  type Budget,
} from "@/features/finance/model";
import {
  Action,
  Card,
  CurrencySwitch,
  Empty,
  FormError,
  Icon,
  IconButton,
  Row,
  Screen,
  Txt,
  tap,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { BudgetForm } from "./BudgetForm";
import { BudgetRow } from "./BudgetRow";
import { MonthlyBudgetCard } from "./MonthlyBudgetCard";
import { MonthlyBudgetForm } from "./MonthlyBudgetForm";
import { MonthPicker } from "./MonthPicker";
import { useT } from "@/shared/i18n/react";

export { MonthPicker } from "./MonthPicker";

export default function BudgetsScreen() {
  const { state, update, setNotice } = useFinance();
  const { colors } = useTheme();
  const { t, monthName } = useT();
  const [month, setMonth] = useState(monthKey());
  const [editing, setEditing] = useState<Budget | "new">();
  const [editingMonthly, setEditingMonthly] = useState(false);
  const copying = useFormAction();
  const currency = state.settings.currency;
  const previous = shiftMonth(month, -1);
  const budgets = state.budgets.filter(
    (b) => b.month === month && b.currency === currency,
  );
  const copyLastMonth = () =>
    void copying.run(async () => {
      let copied = 0;
      await update((s) => {
        const result = copyBudgets(s, previous, month);
        copied = result.copied;
        return result.state;
      });
      setNotice(
        copied
          ? t("budgets.copied", { count: copied, month: monthName(previous) })
          : t("budgets.nothingToCopy", { month: monthName(previous) }),
      );
    });
  return (
    <Screen
      title={t("budgets.title")}
      subtitle={t("budgets.subtitle")}
      right={
        <IconButton
          icon="plus"
          label={t("budgets.create")}
          onPress={() => setEditing("new")}
        />
      }
    >
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <MonthPicker month={month} onChange={setMonth} />
        <CurrencySwitch />
      </Row>
      <MonthlyBudgetCard
        month={month}
        currency={currency}
        budgets={budgets}
        onEdit={() => setEditingMonthly(true)}
      />
      {!budgets.length ? (
        <Card>
          <Empty
            icon="pie-chart"
            title={t("budgets.emptyTitle")}
            description={t("budgets.emptyBody")}
            action={t("budgets.createFirst")}
            onPress={() => setEditing("new")}
          />
          <View style={{ paddingHorizontal: 28, paddingBottom: 12 }}>
            <Action loading={copying.busy} onPress={copyLastMonth}>
              {t("budgets.copyFrom", { month: monthName(previous) })}
            </Action>
          </View>
        </Card>
      ) : (
        <View style={{ gap: 16 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Txt size={19} weight="600" style={{ letterSpacing: -0.5 }}>
                {t("budgets.categoryTitle")}
              </Txt>
              <Txt size={12} color={colors.muted} style={{ marginTop: 4 }}>
                {t("budgets.tapToAdjust")}
              </Txt>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("budgets.copyMissingA11y", {
                month: monthName(previous),
              })}
              accessibilityState={{ busy: copying.busy }}
              disabled={copying.busy}
              onPress={() => {
                tap();
                copyLastMonth();
              }}
              style={({ pressed }) => ({
                paddingVertical: 10,
                paddingLeft: 10,
                opacity: pressed || copying.busy ? 0.6 : 1,
              })}
            >
              <Row style={{ gap: 5 }}>
                <Icon name="copy" size={14} color={colors.accent} />
                <Txt size={12} color={colors.accent} weight="600">
                  {t("budgets.copyLast")}
                </Txt>
              </Row>
            </Pressable>
          </Row>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
            {budgets.map((b) => (
              <BudgetRow key={b.id} budget={b} onPress={() => setEditing(b)} />
            ))}
          </View>
        </View>
      )}
      <FormError message={copying.error} />
      {editing && (
        <BudgetForm
          budget={editing === "new" ? undefined : editing}
          month={month}
          onClose={() => setEditing(undefined)}
        />
      )}
      {editingMonthly && (
        <MonthlyBudgetForm
          budget={monthlyBudget(state, month, currency)}
          month={month}
          currency={currency}
          allocated={budgets.reduce((s, b) => s + b.limit, 0)}
          onClose={() => setEditingMonthly(false)}
        />
      )}
    </Screen>
  );
}
