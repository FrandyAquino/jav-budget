import { useState } from "react";
import { useFinance } from "@/features/finance/store";
import {
  amountText,
  entryAmount,
  setMonthlyBudget,
  type Currency,
  type MonthlyBudget,
} from "@/features/finance/model";
import {
  Action,
  AmountField,
  FormError,
  Sheet,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

export function MonthlyBudgetForm({
  budget,
  month,
  currency,
  allocated,
  onClose,
}: {
  budget?: MonthlyBudget;
  month: string;
  currency: Currency;
  allocated: number;
  onClose: () => void;
}) {
  const { state, update, setNotice } = useFinance();
  const mode = state.settings.numberEntry;
  const { colors } = useTheme();
  const { t, money, monthLabel } = useT();
  const [amount, setAmount] = useState(
    budget
      ? amountText(budget.limit, mode)
      : allocated
        ? amountText(allocated, mode)
        : "",
  );
  const [deleting, setDeleting] = useState(false);
  const form = useFormAction();
  const save = (limit: () => number | null, notice: string) =>
    void form.run(async () => {
      const value = limit();
      await update((s) => setMonthlyBudget(s, month, currency, value));
      setNotice(notice);
      onClose();
    });
  return (
    <Sheet
      title={t(
        deleting
          ? "monthlyForm.removeTitle"
          : budget
            ? "monthlyForm.editTitle"
            : "monthlyForm.newTitle",
      )}
      subtitle={`${monthLabel(month)} · ${currency}`}
      onClose={onClose}
    >
      {deleting ? (
        <>
          <Txt>{t("monthlyForm.removeBody")}</Txt>
          <Action
            danger
            loading={form.busy}
            onPress={() => save(() => null, t("monthlyForm.removed"))}
          >
            {t("monthlyForm.remove")}
          </Action>
          <Action secondary onPress={() => setDeleting(false)}>
            {t("monthlyForm.keep")}
          </Action>
        </>
      ) : (
        <>
          <Txt size={13} color={colors.muted}>
            {t("monthlyForm.body")}
          </Txt>
          <AmountField
            mode={mode}
            label={t("monthlyForm.limitLabel", { currency })}
            accessibilityLabel={t("monthlyForm.limitA11y")}
            placeholder={mode === "cents" ? "0" : "0.00"}
            value={amount}
            onChangeText={setAmount}
          />
          {allocated > 0 && (
            <Txt size={12} color={colors.muted}>
              {t("monthlyForm.allocated", {
                amount: money(allocated, currency),
              })}
            </Txt>
          )}
          <Action
            loading={form.busy}
            onPress={() =>
              save(() => {
                const limit = entryAmount(amount, mode);
                if (limit <= 0)
                  throw new Error(t("budgetForm.limitPositive"));
                return limit;
              }, t("monthlyForm.saved"))
            }
          >
            {t("monthlyForm.save")}
          </Action>
          {budget && (
            <Action secondary onPress={() => setDeleting(true)}>
              {t("monthlyForm.remove")}
            </Action>
          )}
        </>
      )}
      <FormError message={form.error} />
    </Sheet>
  );
}
