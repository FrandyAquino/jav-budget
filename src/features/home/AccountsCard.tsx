import { Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  balancesByAccount,
  type Account,
  type Currency,
  type FinanceState,
} from "@/features/finance/model";
import {
  Card,
  Empty,
  Icon,
  Row,
  Section,
  Txt,
  useTheme,
  type ThemeColors,
} from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

const icons = { cash: "pocket", credit: "credit-card", bank: "grid" } as const;

export function AccountsCard({
  state,
  currency,
}: {
  state: FinanceState;
  currency: Currency;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const accounts = state.accounts.filter((a) => a.currency === currency);
  const balances = balancesByAccount(state);
  return (
    <Card>
      <Section
        title={t("home.accounts.title")}
        action={t("common.manage")}
        onPress={() => router.push("/accounts")}
      />
      {accounts.length ? (
        accounts
          .slice(0, 3)
          .map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              balance={balances.get(a.id) ?? 0}
              colors={colors}
            />
          ))
      ) : (
        <Empty
          title={t("home.accounts.emptyTitle")}
          description={t("home.accounts.emptyBody", { currency })}
          action={t("home.accounts.add")}
          onPress={() => router.push("/accounts")}
        />
      )}
    </Card>
  );
}
function AccountRow({
  account,
  balance,
  colors,
}: {
  account: Account;
  balance: number;
  colors: ThemeColors;
}) {
  const { t, money } = useT();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/accounts")}
      style={{ marginVertical: 10 }}
    >
      <Row>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            backgroundColor: colors.input,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icons[account.type]} color={colors.text} size={18} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt size={13} weight="500">
            {account.name}
          </Txt>
          <Txt size={10} color={colors.muted}>
            {t(`accountType.${account.type}`)}
          </Txt>
        </View>
        <Txt size={13} weight="600">
          {money(balance, account.currency, true)}
        </Txt>
      </Row>
    </Pressable>
  );
}
