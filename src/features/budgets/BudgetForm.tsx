import { useState } from "react";
import { Switch, View } from "react-native";
import { CategoryForm } from "@/features/categories/CategoriesScreen";
import { SelectField } from "@/shared/SelectField";
import { useFinance } from "@/features/finance/store";
import {
  amountText,
  entryAmount,
  id,
  shiftMonth,
  type Budget,
} from "@/features/finance/model";
import {
  Action,
  Field,
  FormError,
  Row,
  Sheet,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

export function BudgetForm({
  budget,
  month,
  onClose,
}: {
  budget?: Budget;
  month: string;
  onClose: () => void;
}) {
  const { state, update, setNotice } = useFinance();
  const { colors } = useTheme();
  const { t, monthLabel, monthName } = useT();
  const [categoryId, setCategory] = useState(
    budget?.categoryId ??
      state.categories.find((c) => c.kind === "expense")?.id ??
      "",
  );
  const mode = state.settings.numberEntry;
  const [amount, setAmount] = useState(
    budget ? amountText(budget.limit, mode) : "",
  );
  const [rollover, setRollover] = useState(budget?.rollover ?? false);
  const [deleting, setDeleting] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const form = useFormAction();
  const currency = budget?.currency ?? state.settings.currency;
  return (
    <Sheet
      title={t(
        deleting
          ? "budgetForm.removeTitle"
          : budget
            ? "budgetForm.editTitle"
            : "budgetForm.newTitle",
      )}
      subtitle={`${monthLabel(month)} · ${currency}`}
      onClose={onClose}
    >
      {deleting ? (
        <>
          <Txt>{t("budgetForm.removeBody")}</Txt>
          <Action
            danger
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                await update((s) => ({
                  ...s,
                  budgets: s.budgets.filter((b) => b.id !== budget?.id),
                }));
                onClose();
              })
            }
          >
            {t("budgetForm.remove")}
          </Action>
          <Action secondary onPress={() => setDeleting(false)}>
            {t("budgetForm.keep")}
          </Action>
        </>
      ) : (
        <>
          <SelectField
            label={t("txForm.category")}
            value={categoryId}
            onChange={setCategory}
            options={state.categories
              .filter((c) => c.kind === "expense")
              .map((c) => ({ value: c.id, label: c.name, icon: c.icon }))}
            onCreate={() => setCreatingCategory(true)}
          />
          <Field
            label={t("budgetForm.limitLabel", { currency })}
            accessibilityLabel={t("budgetForm.limitA11y")}
            placeholder={mode === "cents" ? "0" : "0.00"}
            value={amount}
            onChangeText={setAmount}
            keyboardType={mode === "cents" ? "number-pad" : "decimal-pad"}
          />
          <Row>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt weight="500">{t("budgetForm.rollover")}</Txt>
              <Txt size={12} color={colors.muted}>
                {t("budgetForm.rolloverHint", {
                  month: monthName(shiftMonth(month, -1)),
                })}
              </Txt>
            </View>
            <Switch
              accessibilityLabel={t("budgetForm.rollover")}
              value={rollover}
              onValueChange={setRollover}
              trackColor={{ true: colors.accent }}
            />
          </Row>
          <Action
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                if (!categoryId)
                  throw new Error(t("budgetForm.needCategory"));
                const limit = entryAmount(amount, mode);
                if (limit <= 0)
                  throw new Error(t("budgetForm.limitPositive"));
                await update((s) => {
                  if (
                    s.budgets.some(
                      (b) =>
                        b.id !== budget?.id &&
                        b.month === month &&
                        b.currency === currency &&
                        b.categoryId === categoryId,
                    )
                  )
                    throw new Error(t("budgetForm.duplicate"));
                  return {
                    ...s,
                    budgets: [
                      ...s.budgets.filter((b) => b.id !== budget?.id),
                      {
                        id: budget?.id ?? id(),
                        categoryId,
                        currency,
                        month,
                        limit,
                        rollover,
                      },
                    ],
                  };
                });
                setNotice(t("budgetForm.saved"));
                onClose();
              })
            }
          >
            {t("budgetForm.save")}
          </Action>
          {budget && (
            <Action secondary onPress={() => setDeleting(true)}>
              {t("budgetForm.remove")}
            </Action>
          )}
          {creatingCategory && (
            <CategoryForm
              initialKind="expense"
              onSaved={setCategory}
              onClose={() => setCreatingCategory(false)}
            />
          )}
        </>
      )}
      <FormError message={form.error} />
    </Sheet>
  );
}
