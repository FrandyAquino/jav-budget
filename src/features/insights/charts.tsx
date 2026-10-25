import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
  Line,
} from "react-native-svg";
import {
  balanceSeries,
  categoryAmount,
  currentRange,
  shiftMonth,
  today,
  type Currency,
  type FinanceState,
  type DateRange,
} from "@/features/finance/model";
import { Row, Txt, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

export function BalanceChart({
  state,
  currency,
  range = currentRange("month"),
}: {
  state: FinanceState;
  currency: Currency;
  range?: DateRange;
}) {
  const { colors } = useTheme();
  const { t, money, shortDate, mediumDate } = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const daily = balanceSeries(state, currency, range);
  const data = daily.filter(
    (_, i) =>
      i % Math.max(1, Math.ceil(daily.length / 28)) === 0 ||
      i === daily.length - 1,
  );
  const values = data.map((point) => point.value);
  const end = values.length;
  const active = selected !== null && selected < end ? selected : null;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = max - min || 1;
  const points = values.map((v, i) => [
    10 + (i / Math.max(1, end - 1)) * 580,
    136 - ((v - min) / span) * 112,
  ]);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ height: 18 }}>
        <Txt size={11} color={colors.accent}>
          {active !== null
            ? `${shortDate(data[active].date)} · ${money(values[active], currency)}`
            : t("charts.balanceHint")}
        </Txt>
      </View>
      <View style={{ height: 150 }}>
        <Svg
          width="100%"
          height="150"
          viewBox="0 0 600 150"
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.18} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[40, 85, 135].map((y) => (
            <Line
              key={y}
              x1="0"
              y1={y}
              x2="600"
              y2={y}
              stroke={colors.accent}
              strokeOpacity={0.1}
              strokeDasharray="3,6"
            />
          ))}
          <Path d={`${line} L590,150 L10,150 Z`} fill="url(#balance-fill)" />
          <Path
            d={line}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {active !== null && (
            <Circle
              cx={points[active][0]}
              cy={points[active][1]}
              r="5"
              fill={colors.accent}
              stroke={colors.hero}
              strokeWidth={3}
            />
          )}
        </Svg>
        <View style={{ position: "absolute", inset: 0, flexDirection: "row" }}>
          {values.map((value, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`${mediumDate(data[i].date)}: ${money(value, currency)}`}
              onPress={() => setSelected(i)}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </View>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt size={10} color={colors.muted}>
          {shortDate(range.from)}
        </Txt>
        <Txt size={10} color={colors.muted}>
          {shortDate(range.to)}
        </Txt>
      </Row>
    </View>
  );
}
export function SpendingRing({
  values,
  total,
  currency,
}: {
  values: { id: string; label: string; value: number; color: string }[];
  total: number;
  currency: Currency;
}) {
  const { colors } = useTheme();
  const { t, money } = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const active = values.find((v) => v.id === selected);
  const circumference = 2 * Math.PI * 71;
  return (
    <>
      <View style={{ alignItems: "center", marginVertical: 6 }}>
        <Svg width={190} height={190} viewBox="0 0 190 190">
          <Circle
            cx={95}
            cy={95}
            r={71}
            fill="none"
            stroke={colors.line}
            strokeWidth={20}
          />
          {values.map((item, index) => {
            const length = total ? (item.value / total) * circumference : 0;
            const start = total
              ? (values
                  .slice(0, index)
                  .reduce((sum, value) => sum + value.value, 0) /
                  total) *
                circumference
              : 0;
            return (
              <Circle
                key={item.id}
                cx={95}
                cy={95}
                r={71}
                fill="none"
                stroke={item.color}
                strokeWidth={selected === item.id ? 24 : 20}
                strokeDasharray={`${Math.max(0, length - 4)} ${circumference}`}
                strokeDashoffset={-start}
                transform="rotate(-90 95 95)"
              />
            );
          })}
        </Svg>
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 67, alignItems: "center" }}
        >
          <Txt size={11} color={colors.muted}>
            {active?.label ?? t("charts.totalSpending")}
          </Txt>
          <Txt size={21} weight="600" style={{ letterSpacing: -0.8 }}>
            {money(active?.value ?? total, currency, true)}
          </Txt>
        </View>
      </View>
      {values.slice(0, 6).map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === item.id }}
          onPress={() => setSelected(selected === item.id ? null : item.id)}
          style={{ paddingVertical: 9 }}
        >
          <Row>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: item.color,
              }}
            />
            <Txt size={12} style={{ flex: 1 }}>
              {item.label}
            </Txt>
            <Txt size={12} weight="500">
              {total ? Math.round((item.value / total) * 100) : 0}%
            </Txt>
          </Row>
        </Pressable>
      ))}
    </>
  );
}
// Six months of income/expense ending at `month`, bucketed in a single pass.
// With `category`, only that category's share of each (split) entry counts.
export function monthlyTrend(
  state: FinanceState,
  currency: Currency,
  month: string,
  { category = "", recurringOnly = false } = {},
) {
  const data = Array.from({ length: 6 }, (_, i) => ({
    month: shiftMonth(month, i - 5),
    income: 0,
    expense: 0,
  }));
  const index = new Map(data.map((d, i) => [d.month, i]));
  const ids = new Set(
    state.accounts.filter((a) => a.currency === currency).map((a) => a.id),
  );
  const now = today();
  for (const t of state.transactions) {
    if (t.kind === "transfer" || t.date > now || !ids.has(t.accountId))
      continue;
    if (recurringOnly && !t.recurringId) continue;
    const i = index.get(t.date.slice(0, 7));
    if (i === undefined) continue;
    data[i][t.kind] += category ? categoryAmount(t, category) : t.amount;
  }
  return data;
}
export function TrendChart({
  state,
  currency,
  month,
  category,
  recurringOnly,
}: {
  state: FinanceState;
  currency: Currency;
  month: string;
  category?: string;
  recurringOnly?: boolean;
}) {
  const { colors } = useTheme();
  const { t, money, monthName, monthLabel } = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const data = monthlyTrend(state, currency, month, {
    category,
    recurringOnly,
  });
  const maximum = Math.max(...data.flatMap((d) => [d.income, d.expense]), 100);
  const active = data.find((d) => d.month === selected) ?? data[5];
  return (
    <>
      <Row style={{ gap: 22, marginBottom: 22 }}>
        <Row style={{ gap: 6 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: colors.accent,
            }}
          />
          <Txt size={11} color={colors.muted}>
            {t("kindPlural.income")}
          </Txt>
        </Row>
        <Row style={{ gap: 6 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: "#C5D2C8",
            }}
          />
          <Txt size={11} color={colors.muted}>
            {t("kindPlural.expense")}
          </Txt>
        </Row>
      </Row>
      <View
        style={{
          flexDirection: "row",
          height: 160,
          alignItems: "flex-end",
          gap: 12,
        }}
      >
        {data.map((d) => (
          <Pressable
            key={d.month}
            accessibilityRole="button"
            accessibilityLabel={t("charts.monthA11y", {
              month: monthLabel(d.month),
              income: money(d.income, currency),
              expense: money(d.expense, currency),
            })}
            onPress={() => setSelected(d.month)}
            style={{
              flex: 1,
              height: 160,
              justifyContent: "flex-end",
              opacity: selected && selected !== d.month ? 0.5 : 1,
            }}
          >
            <View
              style={{
                height: 135,
                flexDirection: "row",
                gap: 5,
                alignItems: "flex-end",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: "30%",
                  height: Math.max(3, (d.income / maximum) * 130),
                  backgroundColor: colors.accent,
                  borderTopLeftRadius: 5,
                  borderTopRightRadius: 5,
                }}
              />
              <View
                style={{
                  width: "30%",
                  height: Math.max(3, (d.expense / maximum) * 130),
                  backgroundColor: "#C5D2C8",
                  borderTopLeftRadius: 5,
                  borderTopRightRadius: 5,
                }}
              />
            </View>
            <Txt
              size={10}
              color={colors.muted}
              style={{ textAlign: "center", marginTop: 10 }}
            >
              {monthName(d.month, "short", true)}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Txt size={12} color={colors.muted} style={{ marginTop: 22 }}>
        {t("charts.netFor", { month: monthName(active.month, "long", true) })}{" "}
        <Txt
          size={12}
          weight="600"
          color={
            active.income - active.expense >= 0 ? colors.accent : colors.danger
          }
        >
          {money(active.income - active.expense, currency)}
        </Txt>
      </Txt>
    </>
  );
}
