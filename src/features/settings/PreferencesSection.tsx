import { router } from "expo-router";
import { useFinance } from "@/features/finance/store";
import { SelectField } from "@/shared/SelectField";
import {
  Card,
  FormError,
  Section,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { ExchangeRateSetting } from "./ExchangeRateSetting";
import { SettingsLink } from "./SettingsLink";
import { useT } from "@/shared/i18n/react";
import { currencySymbol } from "@/features/finance/model";

export function PreferencesSection() {
  const { state, update } = useFinance();
  const { colors } = useTheme();
  const { t, lang } = useT();
  const form = useFormAction();
  return (
    <Card style={{ gap: 16 }}>
      <Section title={t("preferences.title")} />
      <SelectField
        label={t("preferences.language")}
        value={state.settings.language ?? "system"}
        options={[
          {
            value: "system",
            label: t("preferences.system"),
            detail: t("preferences.languageSystemDetail", {
              language: t(`preferences.languageName.${lang}`),
            }),
            icon: "smartphone",
          },
          // Each language is named in itself so it can always be found.
          { value: "es", label: "Español", icon: "globe" },
          { value: "en", label: "English", icon: "globe" },
        ]}
        onChange={(language) =>
          void form.run(() =>
            update((s) => ({ ...s, settings: { ...s.settings, language } })),
          )
        }
      />
      <SelectField
        label={t("preferences.appearance")}
        value={state.settings.appearance}
        options={[
          { value: "system", label: t("preferences.system"), icon: "smartphone" },
          { value: "light", label: t("preferences.light"), icon: "sun" },
          { value: "dark", label: t("preferences.dark"), icon: "moon" },
        ]}
        onChange={(appearance) =>
          void form.run(() =>
            update((s) => ({
              ...s,
              settings: { ...s.settings, appearance },
            })),
          )
        }
      />
      <SelectField
        label={t("preferences.currency")}
        value={state.settings.currency}
        options={[
          {
            value: "DOP",
            label: t("preferences.dop"),
            detail: `DOP · ${currencySymbol("DOP", lang)}`,
          },
          {
            value: "USD",
            label: t("preferences.usd"),
            detail: `USD · ${currencySymbol("USD", lang)}`,
          },
        ]}
        onChange={(currency) =>
          void form.run(() =>
            update((s) => ({ ...s, settings: { ...s.settings, currency } })),
          )
        }
      />
      <Txt size={11} color={colors.muted}>
        {t("preferences.currencyHint")}
      </Txt>
      <ExchangeRateSetting />
      {state.accounts.length > 1 && (
        <SelectField
          label={t("preferences.primaryAccount")}
          value={
            state.accounts.some((a) => a.id === state.settings.primaryAccountId)
              ? state.settings.primaryAccountId!
              : ""
          }
          options={[
            {
              value: "",
              label: t("preferences.primaryAll"),
              detail: t("preferences.primaryAllDetail"),
              icon: "layers",
            },
            ...state.accounts.map((a) => ({
              value: a.id,
              label: a.name,
              detail: `${t(`accountType.${a.type}`)} · ${a.currency}`,
              icon: a.type === "cash" ? "dollar-sign" : "credit-card",
            })),
          ]}
          onChange={(id) =>
            void form.run(() =>
              update((s) => ({
                ...s,
                settings: { ...s.settings, primaryAccountId: id || undefined },
              })),
            )
          }
        />
      )}
      <SelectField
        label={t("preferences.numberEntry")}
        value={state.settings.numberEntry ?? "decimal"}
        options={[
          {
            value: "decimal",
            label: t("preferences.decimal"),
            detail: t("preferences.decimalDetail"),
          },
          {
            value: "cents",
            label: t("preferences.cents"),
            detail: t("preferences.centsDetail"),
          },
        ]}
        onChange={(numberEntry) =>
          void form.run(() =>
            update((s) => ({
              ...s,
              settings: { ...s.settings, numberEntry },
            })),
          )
        }
      />
      <FormError message={form.error} />
      <SettingsLink
        icon="grid"
        label={t("preferences.manageCategories")}
        onPress={() => router.push("/categories")}
      />
      <SettingsLink
        icon="credit-card"
        label={t("preferences.manageAccounts")}
        onPress={() => router.push("/accounts")}
      />
    </Card>
  );
}
