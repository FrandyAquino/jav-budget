import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useFinance } from "@/features/finance/store";
import {
  amountText,
  balancesByAccount,
  entryAmount,
  id,
  removeAccount,
  type Account,
  type Currency,
} from "@/features/finance/model";
import {
  Action,
  Amount,
  Card,
  Choice,
  Empty,
  AmountField,
  Field,
  FormError,
  Icon,
  IconButton,
  Progress,
  Row,
  Screen,
  Sheet,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { TransactionForm } from "@/features/transactions/components";
import { useT } from "@/shared/i18n/react";

export default function AccountsScreen() {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t, money } = useT();
  const [editing, setEditing] = useState<Account | "new">();
  const [transfer, setTransfer] = useState(false);
  const balances = balancesByAccount(state);
  return (
    <Screen
      title={t("accounts.title")}
      subtitle={t("accounts.subtitle")}
      right={
        <IconButton
          icon="x"
          label={t("common.backHome")}
          onPress={() => router.back()}
        />
      }
    >
      <Row>
        <View style={{ flex: 1 }}>
          <Action onPress={() => setEditing("new")}>
            {t("home.accounts.add")}
          </Action>
        </View>
        {state.accounts.length > 1 && (
          <View style={{ flex: 1 }}>
            <Action secondary onPress={() => setTransfer(true)}>
              {t("accounts.transfer")}
            </Action>
          </View>
        )}
      </Row>
      {!state.accounts.length && (
        <Empty
          icon="credit-card"
          title={t("accounts.emptyTitle")}
          description={t("accounts.emptyBody")}
        />
      )}
      {(["DOP", "USD"] as Currency[]).map((currency) => {
        const accounts = state.accounts.filter((a) => a.currency === currency);
        return accounts.length ? (
          <View key={currency} style={{ gap: 15 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt size={12} color={colors.muted}>
                {t("accounts.groupTitle", { currency })}
              </Txt>
              <Amount
                value={accounts.reduce(
                  (sum, a) => sum + (balances.get(a.id) ?? 0),
                  0,
                )}
                currency={currency}
                size={22}
              />
            </Row>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
              {accounts.map((a) => {
                const balance = balances.get(a.id) ?? 0;
                const debt = Math.max(0, -balance);
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityLabel={t("accounts.manageA11y", {
                      name: a.name,
                    })}
                    onPress={() => setEditing(a)}
                    style={{ flex: 1, flexBasis: 280 }}
                  >
                    <Card style={{ gap: 24 }}>
                      <Row>
                        <View
                          style={{
                            padding: 13,
                            borderRadius: 15,
                            backgroundColor: colors.input,
                          }}
                        >
                          <Icon
                            name={
                              a.type === "credit"
                                ? "credit-card"
                                : a.type === "cash"
                                  ? "pocket"
                                  : "grid"
                            }
                            color={colors.text}
                            size={22}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Txt size={17} weight="600">
                            {a.name}
                          </Txt>
                          <Txt size={11} color={colors.muted}>
                            {t(`accountType.${a.type}`)} · {a.currency}
                          </Txt>
                        </View>
                        <Icon name="more-horizontal" color={colors.muted} />
                      </Row>
                      <View>
                        <Txt size={11} color={colors.muted}>
                          {t(
                            a.type === "credit" && balance < 0
                              ? "accounts.outstanding"
                              : "accounts.current",
                          )}
                        </Txt>
                        <Amount
                          value={
                            a.type === "credit" && balance < 0 ? debt : balance
                          }
                          currency={a.currency}
                          size={32}
                        />
                      </View>
                      {a.type === "credit" && (
                        <View style={{ gap: 10 }}>
                          {a.limit && (
                            <>
                              <Progress
                                value={debt / a.limit}
                                color={
                                  debt > a.limit ? colors.danger : colors.accent
                                }
                              />
                              <Txt size={11} color={colors.muted}>
                                {t("accounts.available", {
                                  amount: money(
                                    Math.max(0, a.limit - debt),
                                    currency,
                                    true,
                                  ),
                                  limit: money(a.limit, currency, true),
                                })}
                              </Txt>
                            </>
                          )}
                          {a.dueDay && (
                            <Row>
                              <Icon
                                name="calendar"
                                size={14}
                                color={colors.muted}
                              />
                              <Txt size={12} color={colors.muted}>
                                {t("accounts.dueDay", { day: a.dueDay })}
                              </Txt>
                            </Row>
                          )}
                          <Txt size={11} color={colors.muted}>
                            {t("accounts.cardHint")}
                          </Txt>
                        </View>
                      )}
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null;
      })}
      {editing && (
        <AccountForm
          account={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {transfer && (
        <TransactionForm
          initialKind="transfer"
          onClose={() => setTransfer(false)}
        />
      )}
    </Screen>
  );
}
function AccountForm({
  account,
  onClose,
}: {
  account?: Account;
  onClose: () => void;
}) {
  const { update, state, setNotice } = useFinance();
  const { t } = useT();
  const form = useFormAction();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<Account["type"]>(account?.type ?? "bank");
  const [currency, setCurrency] = useState<Currency>(
    account?.currency ?? state.settings.currency,
  );
  const mode = state.settings.numberEntry;
  const [opening, setOpening] = useState(
    account ? amountText(Math.abs(account.opening), mode) : "",
  );
  const [negative, setNegative] = useState(
    account ? account.opening < 0 : false,
  );
  const [limit, setLimit] = useState(
    account?.limit ? amountText(account.limit, mode) : "",
  );
  const [dueDay, setDueDay] = useState(
    account?.dueDay ? String(account.dueDay) : "",
  );
  const [counted, setCounted] = useState(!account?.excludeFromTotal);
  const [deleting, setDeleting] = useState(false);
  const hasHistory =
    account &&
    (state.transactions.some(
      (x) => x.accountId === account.id || x.toAccountId === account.id,
    ) ||
      state.recurring.some(
        (x) => x.accountId === account.id || x.toAccountId === account.id,
      ));
  return (
    <Sheet
      title={t(
        deleting
          ? "accountForm.removeTitle"
          : account
            ? "accountForm.editTitle"
            : "accountForm.newTitle",
      )}
      subtitle={t("accountForm.subtitle")}
      onClose={onClose}
    >
      {deleting ? (
        <>
          <Txt>
            {t("accountForm.removeBody")}
          </Txt>
          <Action
            danger
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                await update((s) => removeAccount(s, account!.id));
                onClose();
              })
            }
          >
            {t("accountForm.remove")}
          </Action>
          <Action secondary onPress={() => setDeleting(false)}>
            {t("accountForm.keep")}
          </Action>
        </>
      ) : (
        <>
          <Field
            label={t("accountForm.name")}
            accessibilityLabel={t("accountForm.name")}
            placeholder={t("common.example", { value: "Banco Popular" })}
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
          <Choice
            value={type}
            items={[
              { value: "bank", label: t("accountForm.bank") },
              { value: "cash", label: t("accountType.cash") },
              { value: "credit", label: t("accountType.credit") },
            ]}
            onChange={(value) => {
              setType(value);
              if (!account) setNegative(value === "credit");
            }}
          />
          {hasHistory ? (
            <Txt size={12}>
              {t("accountForm.currencyLocked", { currency })}
            </Txt>
          ) : (
            <Choice
              value={currency}
              items={[
                { value: "DOP", label: t("currency.DOP") },
                { value: "USD", label: t("currency.USD") },
              ]}
              onChange={setCurrency}
            />
          )}
          <AmountField
            mode={mode}
            label={t("accountForm.openingLabel", { currency })}
            accessibilityLabel={t("accountForm.opening")}
            placeholder={mode === "cents" ? "0" : "0.00"}
            value={opening}
            onChangeText={setOpening}
          />
          <Choice
            value={negative ? "negative" : "positive"}
            items={[
              { value: "positive", label: t("accountForm.positive") },
              { value: "negative", label: t("accountForm.negative") },
            ]}
            onChange={(value) => setNegative(value === "negative")}
          />
          <Txt size={11}>
            {t("accountForm.openingHint")}
          </Txt>
          {type === "credit" && (
            <>
              <AmountField
                mode={mode}
                label={t("accountForm.limitLabel")}
                accessibilityLabel={t("accountForm.limit")}
                value={limit}
                onChangeText={setLimit}
              />
              <Field
                label={t("accountForm.dueLabel")}
                accessibilityLabel={t("accountForm.due")}
                value={dueDay}
                onChangeText={setDueDay}
                keyboardType="number-pad"
              />
            </>
          )}
          <View style={{ gap: 8 }}>
            <Txt size={12} weight="500">
              {t("accountForm.availableLabel")}
            </Txt>
            <Choice
              value={counted ? "yes" : "no"}
              items={[
                { value: "yes", label: t("accountForm.availableYes") },
                { value: "no", label: t("accountForm.availableNo") },
              ]}
              onChange={(value) => setCounted(value === "yes")}
            />
            <Txt size={11}>{t("accountForm.availableHint")}</Txt>
          </View>
          <Action
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                if (!name.trim()) throw new Error(t("accountForm.nameRequired"));
                if (
                  type === "credit" &&
                  dueDay &&
                  (!/^\d+$/.test(dueDay) ||
                    Number(dueDay) < 1 ||
                    Number(dueDay) > 28)
                )
                  throw new Error(t("accountForm.dueInvalid"));
                if (type === "credit" && limit && entryAmount(limit, mode) <= 0)
                  throw new Error(t("accountForm.limitPositive"));
                const entry: Account = {
                  id: account?.id ?? id(),
                  name: name.trim(),
                  currency,
                  type,
                  opening:
                    entryAmount(opening || "0", mode, true) *
                    (negative ? -1 : 1),
                  color:
                    account?.color ??
                    (type === "credit"
                      ? "#7C78A5"
                      : type === "cash"
                        ? "#BA965C"
                        : "#356C56"),
                  ...(type === "credit" && limit
                    ? { limit: entryAmount(limit, mode) }
                    : {}),
                  ...(type === "credit" && dueDay
                    ? { dueDay: Number(dueDay) }
                    : {}),
                  ...(counted ? {} : { excludeFromTotal: true }),
                };
                await update((s) => ({
                  ...s,
                  accounts: [
                    ...s.accounts.filter((a) => a.id !== entry.id),
                    entry,
                  ],
                }));
                setNotice(t("accountForm.saved"));
                onClose();
              })
            }
          >
            {t("accountForm.save")}
          </Action>
          {account && (
            <Action secondary onPress={() => setDeleting(true)}>
              {t("accountForm.remove")}
            </Action>
          )}
        </>
      )}
      <FormError message={form.error} />
    </Sheet>
  );
}
