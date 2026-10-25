import { useState } from "react";
import { useFinance } from "@/features/finance/store";
import {
  currencySymbol,
  exchangeRate,
  validRate,
} from "@/features/finance/model";
import { useT } from "@/shared/i18n/react";
import {
  Action,
  Field,
  FormError,
  Sheet,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { SettingsLink } from "./SettingsLink";

// Accepts "58.5" or "58,5"; returns NaN for anything that is not a plain decimal.
function parseRate(text: string) {
  const value = text.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
}

export function ExchangeRateSetting() {
  const { state, update, setNotice } = useFinance();
  const { colors } = useTheme();
  const { t, lang, number, mediumDate } = useT();
  const form = useFormAction();
  const current = state.settings.exchangeRate;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const updated =
    current && !Number.isNaN(Date.parse(current.updatedAt))
      ? mediumDate(new Date(current.updatedAt))
      : "";
  const clear = () =>
    form.run(async () => {
      await update((s) => ({
        ...s,
        settings: { ...s.settings, exchangeRate: undefined },
      }));
      setOpen(false);
      setNotice(t("rate.cleared"));
    });
  return (
    <>
      <SettingsLink
        icon="repeat"
        label={t("rate.title")}
        detail={
          current
            ? `${t("rate.detail", {
                rate: `${currencySymbol("DOP", lang)}${number(current.dopPerUsd, { maximumFractionDigits: 4 })}`,
              })}${updated ? ` · ${t("rate.updated", { date: updated })}` : ""}`
            : t("rate.notSet")
        }
        onPress={() => {
          setDraft(current ? String(current.dopPerUsd) : "");
          setOpen(true);
        }}
      />
      {open && (
        <Sheet
          title={t("rate.title")}
          subtitle={t("rate.subtitle")}
          onClose={() => setOpen(false)}
        >
          <Field
            label={t("rate.label")}
            accessibilityLabel={t("rate.a11y")}
            value={draft}
            onChangeText={setDraft}
            keyboardType="decimal-pad"
            placeholder={t("common.example", { value: "60.25" })}
            maxLength={12}
            autoFocus
          />
          <Txt size={11} color={colors.muted}>
            {updated
              ? t("rate.lastUpdated", { date: updated })
              : t("rate.enterToday")}
          </Txt>
          <FormError message={form.error} />
          <Action
            loading={form.busy}
            onPress={() => {
              const value = parseRate(draft);
              void form.run(async () => {
                if (!validRate(value))
                  throw new Error(t("errors.rateInvalid"));
                await update((s) => ({
                  ...s,
                  settings: {
                    ...s.settings,
                    exchangeRate: exchangeRate(value),
                  },
                }));
                setOpen(false);
                setNotice(t("rate.saved"));
              });
            }}
          >
            {t("rate.save")}
          </Action>
          {current && (
            <Action secondary disabled={form.busy} onPress={() => void clear()}>
              {t("rate.clear")}
            </Action>
          )}
          <Action secondary onPress={() => setOpen(false)}>
            {t("common.cancel")}
          </Action>
        </Sheet>
      )}
    </>
  );
}
