import { Pressable, View } from "react-native";
import { useFinance } from "@/features/finance/store";
import {
  budgetStatus,
  monthlyBudget,
  monthlyBudgetStatus,
  type Budget,
  type Currency,
} from "@/features/finance/model";
import {
  Amount,
  Card,
  Icon,
  IconButton,
  Progress,
  Row,
  Txt,
  tap,
  useTheme,
} from "@/shared/ui";
import { statusColor } from "./format";
import { useT } from "@/shared/i18n/react";

// Hero summary: the overall monthly cap when one is set, otherwise the sum of category budgets.
export function MonthlyBudgetCard({
  month,
  currency,
  budgets,
  onEdit,
}: {
  month: string;
  currency: Currency;
  budgets: Budget[];
  onEdit: () => void;
}) {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t, money } = useT();
  const cap = monthlyBudget(state, month, currency);
  const heroStyle = {
    backgroundColor: colors.hero,
    borderColor: colors.hero,
    padding: 28,
  };
  if (cap) {
    const status = monthlyBudgetStatus(state, cap);
    const color = statusColor(status, colors);
    return (
      <Card style={heroStyle}>
        <Row
          style={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <View style={{ flex: 1 }}>
            <Txt size={12} color={status.over ? colors.danger : colors.accent}>
              {t(status.over ? "monthlyCard.over" : "monthlyCard.left")}
            </Txt>
            <Amount
              value={Math.abs(status.available)}
              currency={currency}
              size={38}
              color={status.over ? colors.danger : undefined}
            />
          </View>
          <IconButton
            icon="edit-2"
            label={t("monthlyCard.edit")}
            background={colors.input}
            onPress={onEdit}
          />
        </Row>
        <View style={{ marginTop: 24, marginBottom: 12 }}>
          <Progress value={status.progress} color={color} />
        </View>
        <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Txt size={12} color={colors.muted}>
            {t("monthlyCard.spentTotal", {
              amount: money(status.spent, currency),
            })}
          </Txt>
          <Txt size={12} color={colors.muted}>
            {t("home.budget.of", { amount: money(status.limit, currency, true) })}
          </Txt>
        </Row>
        <View
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            flexDirection: "row",
            gap: 16,
          }}
        >
          <Stat
            label={t("monthlyCard.allocated")}
            value={money(status.allocated, currency, true)}
          />
          <Stat
            label={t(
              status.unallocated < 0
                ? "monthlyCard.overAllocated"
                : "monthlyCard.unallocated",
            )}
            value={money(Math.abs(status.unallocated), currency, true)}
            color={status.unallocated < 0 ? colors.orange : undefined}
          />
        </View>
        {status.unallocated < 0 && (
          <Row style={{ gap: 6, marginTop: 12 }}>
            <Icon name="info" size={14} color={colors.orange} />
            <Txt size={11} color={colors.orange} style={{ flex: 1 }}>
              {t("monthlyCard.overAllocatedHint")}
            </Txt>
          </Row>
        )}
      </Card>
    );
  }
  const statuses = budgets.map((b) => budgetStatus(state, b));
  const total = statuses.reduce((s, b) => s + b.limit + b.carried, 0);
  const used = statuses.reduce((s, b) => s + b.spent, 0);
  const over = used > total;
  return (
    <Card style={heroStyle}>
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Txt size={12} color={colors.accent}>
            {t(over ? "monthlyCard.overPlan" : "monthlyCard.leftPlan")}
          </Txt>
          <Amount
            value={Math.abs(total - used)}
            currency={currency}
            size={38}
          />
        </View>
        <Icon name="pie-chart" color={colors.accent} size={34} />
      </Row>
      <View style={{ marginTop: 24, marginBottom: 12 }}>
        <Progress
          value={total ? used / total : 0}
          color={over ? colors.danger : colors.accent}
        />
      </View>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <Txt size={12} color={colors.muted}>
          {t("monthlyCard.spentBudgeted", { amount: money(used, currency) })}
        </Txt>
        <Txt size={12} color={colors.muted}>
          {t("home.budget.of", { amount: money(total, currency, true) })}
        </Txt>
      </Row>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("monthlyForm.newTitle")}
        accessibilityHint={t("monthlyCard.setHint")}
        onPress={() => {
          tap();
          onEdit();
        }}
        style={({ pressed }) => ({
          marginTop: 20,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          opacity: pressed ? 0.65 : 1,
        })}
      >
        <Row style={{ gap: 8 }}>
          <Icon name="target" size={15} color={colors.accent} />
          <Txt size={12} weight="600" color={colors.accent} style={{ flex: 1 }}>
            {t("monthlyCard.setAll")}
          </Txt>
          <Icon name="chevron-right" size={15} color={colors.muted} />
        </Row>
      </Pressable>
    </Card>
  );
}
function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt size={11} color={colors.muted}>
        {label}
      </Txt>
      <Txt
        size={15}
        weight="600"
        color={color}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Txt>
    </View>
  );
}
