import { useEffect, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useFinance } from "@/features/finance/store";
import {
  currencySymbol,
  entryAmount,
  validRate,
  type Account,
  type Currency,
} from "@/features/finance/model";
import {
  Action,
  Chip,
  Choice,
  Field,
  FormError,
  Icon,
  IconButton,
  Row,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import {
  completeOnboarding,
  customCategory,
  exploreDemo,
  hasCategory,
  parseRate,
  suggestedCategories,
  type CategoryDraft,
} from "./setup";
import { Group, OptionList, StepHeading, StepProgress } from "./parts";
import { OnboardingSignIn } from "@/features/sync/OnboardingSignIn";

const STEPS = ["welcome", "currency", "account", "categories"] as const;
const SETUP_STEPS = STEPS.length - 1;

// First-run setup. The root Stack only exposes this route while
// settings.onboarded is false; finishing (or choosing the demo) flips it and
// the Stack moves to Home on its own.
export default function OnboardingScreen() {
  const { state, update, setNotice } = useFinance();
  const { colors } = useTheme();
  const { t, lang } = useT();
  const form = useFormAction();
  const mode = state.settings.numberEntry ?? "decimal";

  const [index, setIndex] = useState(0);
  const [forward, setForward] = useState(true);
  const [error, setError] = useState("");
  // Currency step.
  const [currency, setCurrency] = useState<Currency>(state.settings.currency);
  const [rate, setRate] = useState(
    state.settings.exchangeRate ? String(state.settings.exchangeRate.dopPerUsd) : "",
  );
  // Account step; the account currency follows the default until chosen.
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<Account["type"]>("bank");
  const [accountCurrency, setAccountCurrency] = useState<Currency>();
  const [balance, setBalance] = useState("");
  // Categories step.
  const suggestions = suggestedCategories(t);
  const [picked, setPicked] = useState(
    () => new Set(suggestions.filter((s) => s.preselected).map((s) => s.key)),
  );
  const [custom, setCustom] = useState<CategoryDraft[]>([]);
  const [customName, setCustomName] = useState("");
  const [customKind, setCustomKind] = useState<CategoryDraft["kind"]>("expense");

  const step = STEPS[index];
  const goTo = (next: number) => {
    setError("");
    setForward(next > index);
    setIndex(next);
  };
  useEffect(() => {
    if (index === 0) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setError("");
      setForward(false);
      setIndex((i) => Math.max(0, i - 1));
      return true;
    });
    return () => sub.remove();
  }, [index]);

  const owned = state.categories;
  const available = suggestions.filter((s) => !hasCategory(owned, s));
  const chosen: CategoryDraft[] = [
    ...available
      .filter((s) => picked.has(s.key))
      .map(({ name, icon, color, kind }) => ({ name, icon, color, kind })),
    ...custom,
  ];
  const hasExpense = [...owned, ...chosen].some((c) => c.kind === "expense");
  const accountCurrencyValue = accountCurrency ?? currency;
  const credit = accountType === "credit";

  const rateValue = () => {
    if (!rate.trim()) return undefined;
    const value = parseRate(rate);
    if (!validRate(value)) throw new Error(t("errors.rateInvalid"));
    return value;
  };
  const balanceValue = () => entryAmount(balance.trim() || "0", mode, true);
  const next = () => {
    try {
      if (step === "currency") rateValue();
      if (step === "account") {
        if (!accountName.trim()) throw new Error(t("onboarding.error.accountName"));
        balanceValue();
      }
      goTo(index + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.saveError"));
    }
  };
  const finish = () =>
    void form.run(async () => {
      const answers = {
        currency,
        dopPerUsd: rateValue(),
        account: {
          name: accountName,
          type: accountType,
          currency: accountCurrencyValue,
          balance: balanceValue(),
        },
        categories: chosen,
      };
      await update((s) => completeOnboarding(s, answers));
      if (Platform.OS !== "web")
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      setNotice(t("onboarding.done"));
    });
  const addCustom = () => {
    const draft = customCategory(customName, customKind, custom.length);
    if (!draft.name) return setError(t("onboarding.error.categoryName"));
    if (hasCategory([...owned, ...chosen], draft))
      return setError(t("onboarding.error.categoryExists"));
    // Typing a suggestion's name just selects that suggestion.
    const match = available.find((s) => hasCategory([s], draft));
    if (match) setPicked((p) => new Set(p).add(match.key));
    else setCustom((c) => [...c, draft]);
    setCustomName("");
    setError("");
  };
  const toggle = (key: string) =>
    setPicked((p) => {
      const nextSet = new Set(p);
      if (!nextSet.delete(key)) nextSet.add(key);
      return nextSet;
    });

  const languageItems = [
    { value: "system" as const, label: t("preferences.system") },
    // Each language is named in itself so it can always be found.
    { value: "es" as const, label: "Español" },
    { value: "en" as const, label: "English" },
  ];

  const content =
    step === "welcome" ? (
      <View style={{ gap: 36, flex: 1, justifyContent: "center" }}>
        <View style={{ gap: 22 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="feather" size={28} color={colors.accent} />
          </View>
          <StepHeading
            large
            title={t("onboarding.welcome.title")}
            body={t("onboarding.welcome.body")}
          />
        </View>
        <Group label={t("onboarding.language")}>
          <Choice
            value={state.settings.language ?? "system"}
            items={languageItems}
            onChange={(language) =>
              void form.run(() =>
                update((s) => ({ ...s, settings: { ...s.settings, language } })),
              )
            }
          />
        </Group>
      </View>
    ) : step === "currency" ? (
      <>
        <StepHeading
          title={t("onboarding.currency.title")}
          body={t("onboarding.currency.body")}
        />
        <OptionList
          value={currency}
          onChange={setCurrency}
          options={(["DOP", "USD"] as const).map((code) => ({
            value: code,
            label: t(`currency.${code}`),
            badge: currencySymbol(code, lang),
          }))}
        />
        <View style={{ gap: 8 }}>
          <Field
            label={t("onboarding.rate.label")}
            accessibilityLabel={t("onboarding.rate.a11y")}
            value={rate}
            onChangeText={setRate}
            keyboardType="decimal-pad"
            placeholder={t("common.example", { value: "60.25" })}
            maxLength={12}
          />
          <Txt size={12} color={colors.muted}>
            {t("onboarding.rate.hint")}
          </Txt>
        </View>
      </>
    ) : step === "account" ? (
      <>
        <StepHeading
          title={t("onboarding.account.title")}
          body={t("onboarding.account.body")}
        />
        <Field
          label={t("onboarding.account.name")}
          accessibilityLabel={t("onboarding.account.name")}
          placeholder={t("common.example", {
            value:
              accountType === "cash"
                ? t("onboarding.account.cashExample")
                : credit
                  ? "Visa"
                  : "Banco Popular",
          })}
          value={accountName}
          onChangeText={setAccountName}
          maxLength={80}
        />
        <Group label={t("onboarding.account.type")}>
          <Choice
            value={accountType}
            items={[
              { value: "bank", label: t("accountForm.bank") },
              { value: "cash", label: t("accountType.cash") },
              { value: "credit", label: t("accountType.credit") },
            ]}
            onChange={setAccountType}
          />
        </Group>
        <Group label={t("onboarding.account.currency")}>
          <Choice
            value={accountCurrencyValue}
            items={[
              { value: "DOP", label: "DOP" },
              { value: "USD", label: "USD" },
            ]}
            onChange={setAccountCurrency}
          />
        </Group>
        <View style={{ gap: 8 }}>
          <Field
            label={t(credit ? "onboarding.account.owed" : "onboarding.account.balance", {
              currency: accountCurrencyValue,
            })}
            accessibilityLabel={t("onboarding.account.balanceA11y")}
            placeholder={mode === "cents" ? "0" : "0.00"}
            value={balance}
            onChangeText={setBalance}
            keyboardType={mode === "cents" ? "number-pad" : "decimal-pad"}
          />
          <Txt size={12} color={colors.muted}>
            {t("onboarding.account.balanceHint")}
          </Txt>
        </View>
      </>
    ) : (
      <>
        <StepHeading
          title={t("onboarding.categories.title")}
          body={t("onboarding.categories.body")}
        />
        {(["expense", "income"] as const).map((kind) => (
          <Group
            key={kind}
            label={t(
              kind === "expense"
                ? "onboarding.categories.expense"
                : "onboarding.categories.income",
            )}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {available
                .filter((s) => s.kind === kind)
                .map((s) => (
                  <Chip
                    key={s.key}
                    label={s.name}
                    icon={s.icon}
                    active={picked.has(s.key)}
                    onPress={() => toggle(s.key)}
                  />
                ))}
              {custom
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <Chip
                    key={c.name}
                    label={c.name}
                    icon={c.icon}
                    active
                    onPress={() =>
                      setCustom((list) => list.filter((item) => item !== c))
                    }
                  />
                ))}
            </View>
          </Group>
        ))}
        <Group label={t("onboarding.categories.custom")}>
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field
                accessibilityLabel={t("onboarding.categories.customA11y")}
                placeholder={t("onboarding.categories.customPlaceholder")}
                value={customName}
                onChangeText={setCustomName}
                onSubmitEditing={addCustom}
                returnKeyType="done"
                maxLength={60}
              />
            </View>
            <IconButton
              icon="plus"
              label={t("onboarding.categories.add")}
              onPress={addCustom}
            />
          </Row>
          <Choice
            value={customKind}
            items={[
              { value: "expense", label: t("onboarding.categories.expense") },
              { value: "income", label: t("onboarding.categories.income") },
            ]}
            onChange={setCustomKind}
          />
        </Group>
      </>
    );

  return (
    <SafeAreaView
      edges={["top", "bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{ flex: 1, width: "100%", maxWidth: 560, alignSelf: "center" }}
        >
          <Row
            style={{
              minHeight: 52,
              paddingHorizontal: 16,
              justifyContent: "space-between",
            }}
          >
            {index > 0 ? (
              <IconButton
                icon="chevron-left"
                label={t("onboarding.back")}
                background="transparent"
                onPress={() => goTo(index - 1)}
              />
            ) : (
              <View style={{ width: 44 }} />
            )}
            {index > 0 ? (
              <StepProgress
                step={index}
                total={SETUP_STEPS}
                label={t("onboarding.step", { step: index, total: SETUP_STEPS })}
              />
            ) : null}
            {step === "currency" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("onboarding.skipA11y")}
                onPress={() => {
                  setCurrency(state.settings.currency);
                  setRate("");
                  goTo(index + 1);
                }}
                style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
              >
                <Txt size={15} weight="500" color={colors.muted} style={{ textAlign: "right" }}>
                  {t("onboarding.skip")}
                </Txt>
              </Pressable>
            ) : (
              <View style={{ width: 44 }} />
            )}
          </Row>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingTop: 12,
              paddingBottom: 24,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <Animated.View
              key={step}
              entering={(forward ? FadeInRight : FadeInLeft)
                .duration(260)
                .reduceMotion(ReduceMotion.System)}
              style={{ flex: 1, gap: 26 }}
            >
              {content}
            </Animated.View>
          </ScrollView>
          <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, gap: 10 }}>
            <FormError message={error || form.error} />
            {step === "welcome" ? (
              <>
                <Action loading={form.busy} onPress={() => goTo(1)}>
                  {t("onboarding.start")}
                </Action>
                <Action
                  secondary
                  disabled={form.busy}
                  onPress={() => void form.run(() => update(exploreDemo))}
                >
                  {t("onboarding.demo")}
                </Action>
                <Txt size={12} color={colors.muted} style={{ textAlign: "center" }}>
                  {t("onboarding.demoHint")}
                </Txt>
                <OnboardingSignIn />
              </>
            ) : step === "categories" ? (
              <>
                {!hasExpense ? (
                  <Txt size={12} color={colors.muted} style={{ textAlign: "center" }}>
                    {t("onboarding.error.expenseRequired")}
                  </Txt>
                ) : null}
                <Action loading={form.busy} disabled={!hasExpense} onPress={finish}>
                  {t("onboarding.finish")}
                </Action>
              </>
            ) : (
              <Action onPress={next}>{t("onboarding.continue")}</Action>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
