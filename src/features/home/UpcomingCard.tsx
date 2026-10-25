import { Pressable, View } from "react-native";
import { router } from "expo-router";
import type { Currency, FinanceState } from "@/features/finance/model";
import { useT } from "@/shared/i18n/react";
import { frequencyLabel } from "@/shared/i18n/labels";
import { Card, Icon, Row, Section, Txt, useTheme } from "@/shared/ui";

export function UpcomingCard({
  state,
  currency,
}: {
  state: FinanceState;
  currency: Currency;
}) {
  const { colors } = useTheme();
  const { t, money, shortDate } = useT();
  const ids = new Set(
    state.accounts.filter((a) => a.currency === currency).map((a) => a.id),
  );
  const scheduled = state.recurring
    .filter((r) => r.active && ids.has(r.accountId))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  return (
    <Card>
      <Section
        title={t("home.upcoming.title")}
        action={t("common.manage")}
        onPress={() => router.push("/recurring")}
      />
      {scheduled.slice(0, 4).map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          onPress={() => router.push("/recurring")}
          style={{ paddingVertical: 12 }}
        >
          <Row>
            <View
              style={{
                padding: 11,
                backgroundColor: colors.soft,
                borderRadius: 12,
              }}
            >
              <Icon
                name={r.kind === "income" ? "arrow-down-left" : "repeat"}
                size={17}
                color={colors.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Txt size={13} weight="500">
                {r.title}
              </Txt>
              <Txt size={11} color={colors.muted}>
                {shortDate(r.nextDate)} ·{" "}
                {frequencyLabel(t, r)}
              </Txt>
            </View>
            <Txt
              size={13}
              weight="500"
              color={r.kind === "income" ? colors.accent : colors.text}
            >
              {r.kind === "income" ? "+" : "−"}
              {money(r.amount, currency, true)}
            </Txt>
          </Row>
        </Pressable>
      ))}
      {!scheduled.length && (
        <Txt size={12} color={colors.muted}>
          {t("home.upcoming.empty")}
        </Txt>
      )}
    </Card>
  );
}
