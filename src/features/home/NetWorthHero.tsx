import { View, Pressable, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  currencySymbol,
  type Currency,
  type DateRange,
  type FinanceState,
  type NetWorth,
} from "@/features/finance/model";
import { Amount, Icon, Row, Txt, useTheme } from "@/shared/ui";
import { BalanceChart } from "@/features/insights/charts";
import { useT } from "@/shared/i18n/react";

const currencies: Currency[] = ["DOP", "USD"];

// Hero card: combined net worth when a rate allows it, otherwise the
// default-currency balance with a gentle prompt to set a rate.
export function NetWorthHero({
  state,
  worth,
  range,
  income,
  expense,
  upcoming,
}: {
  state: FinanceState;
  worth: NetWorth;
  range: DateRange;
  income: number;
  expense: number;
  upcoming: boolean;
}) {
  const { colors } = useTheme();
  const { t, lang, money, number, smartDate } = useT();
  const wide = useWindowDimensions().width > 700;
  const rateLabel = (dopPerUsd: number) =>
    `${currencySymbol("DOP", lang)}${number(dopPerUsd, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })}`;
  const updatedLabel = (iso: string) =>
    Number.isNaN(Date.parse(iso)) ? "" : smartDate(new Date(iso));
  const currency = worth.currency;
  const held = currencies.filter((c) =>
    state.accounts.some((a) => a.currency === c),
  );
  const multi = held.length > 1 || (held.length === 1 && held[0] !== currency);
  const combined = multi && worth.total !== undefined;
  const updated = worth.rate ? updatedLabel(worth.rate.updatedAt) : "";
  const divider = `${colors.accent}22`;
  return (
    <View
      style={{
        backgroundColor: colors.hero,
        borderRadius: 16,
        padding: wide ? 28 : 23,
        overflow: "hidden",
      }}
    >
      <Row style={{ justifyContent: "space-between" }}>
        <Row style={{ gap: 7 }}>
          <Txt size={12} color={colors.accent}>
            {t(combined ? "home.hero.netWorth" : "home.hero.totalBalance")}
          </Txt>
          <Icon name="layers" size={13} color={colors.accent} />
        </Row>
        <Txt size={11} color={colors.accent}>
          {t(combined ? "home.hero.allIn" : "home.hero.currencyAccounts", {
            currency,
          })}
        </Txt>
      </Row>
      <Amount
        value={combined ? worth.total! : worth.byCurrency[currency]}
        currency={currency}
        size={wide ? 45 : 36}
      />
      {multi && (
        <View style={{ marginTop: 4, gap: 2 }}>
          <Row style={{ gap: 6, flexWrap: "wrap" }}>
            {held.map((c, i) => (
              <Txt key={c} size={11} color={colors.muted}>
                {i ? "· " : ""}
                {t("home.hero.inCurrency", {
                  amount: money(worth.byCurrency[c], c, true),
                  currency: c,
                })}
              </Txt>
            ))}
          </Row>
          {combined && worth.rate && (
            <Txt size={11} color={colors.muted}>
              {t("home.hero.atRate", {
                rate: rateLabel(worth.rate.dopPerUsd),
              })}
              {updated ? ` · ${t("home.hero.updated", { date: updated })}` : ""}
            </Txt>
          )}
        </View>
      )}
      {multi && worth.needsRate && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("home.hero.setRateA11y")}
          onPress={() => router.push("/settings")}
          style={{
            marginTop: 10,
            backgroundColor: colors.soft,
            borderRadius: 12,
            paddingVertical: 9,
            paddingHorizontal: 12,
          }}
        >
          <Row style={{ justifyContent: "space-between", gap: 8 }}>
            <Row style={{ gap: 8, flex: 1 }}>
              <Icon name="refresh-cw" size={13} color={colors.accent} />
              <Txt size={11} color={colors.accent} style={{ flex: 1 }}>
                {t("home.hero.setRateBody")}
              </Txt>
            </Row>
            <Txt size={11} weight="600" color={colors.accent}>
              {t("home.hero.setRate")}
            </Txt>
          </Row>
        </Pressable>
      )}
      <Row style={{ marginTop: 6, gap: 6 }}>
        <Icon
          name={income - expense >= 0 ? "trending-up" : "trending-down"}
          size={14}
          color={colors.accent}
        />
        <Txt size={12} color={colors.accent}>
          {t(upcoming ? "home.hero.netProjected" : "home.hero.netPeriod", {
            amount: money(income - expense, currency, true),
          })}
        </Txt>
      </Row>
      <BalanceChart
        key={`${range.from}:${range.to}:${currency}`}
        state={state}
        currency={currency}
        range={range}
      />
      <View
        style={{ height: 1, backgroundColor: divider, marginVertical: 19 }}
      />
      <Row>
        <View style={{ flex: 1 }}>
          <Row style={{ gap: 7 }}>
            <Icon name="arrow-down-left" color={colors.accent} size={17} />
            <Txt size={12} color={colors.muted}>
              {t("kindPlural.income")}
            </Txt>
          </Row>
          <Amount value={income} currency={currency} size={23} />
        </View>
        <View style={{ height: 36, width: 1, backgroundColor: divider }} />
        <View style={{ flex: 1, paddingLeft: 12 }}>
          <Row style={{ gap: 7 }}>
            <Icon name="arrow-up-right" color={colors.accent} size={17} />
            <Txt size={12} color={colors.muted}>
              {t("kindPlural.expense")}
            </Txt>
          </Row>
          <Amount value={expense} currency={currency} size={23} />
        </View>
      </Row>
    </View>
  );
}
