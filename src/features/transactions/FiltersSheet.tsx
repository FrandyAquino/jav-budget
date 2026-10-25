import { useState } from "react";
import { View } from "react-native";
import { SelectField } from "@/shared/SelectField";
import { useFinance } from "@/features/finance/store";
import { entryAmount, monthKey, validDate } from "@/features/finance/model";
import { Action, Choice, Field, FormError, Row, Sheet, Txt } from "@/shared/ui";
import { defaultFilters as defaults, type Filters } from "./activity-model";
import { useT } from "@/shared/i18n/react";

export function FiltersSheet({
  initial,
  onClose,
  onApply,
}: {
  initial: Filters;
  onClose: () => void;
  onApply: (value: Filters) => void;
}) {
  const { state } = useFinance();
  const mode = state.settings.numberEntry;
  const { t } = useT();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const set = <K extends keyof Filters>(key: K, entry: Filters[K]) =>
    setValue((s) => ({ ...s, [key]: entry }));
  return (
    <Sheet
      title={t("filters.title")}
      subtitle={t("filters.subtitle")}
      onClose={onClose}
    >
      <Txt size={12}>{t("filters.account")}</Txt>
      <SelectField
        label={t("filters.account")}
        value={value.account}
        options={[
          { value: "", label: t("filters.allAccounts") },
          ...state.accounts.map((a) => ({ value: a.id, label: a.name })),
        ]}
        onChange={(v) => set("account", v)}
      />
      <Txt size={12}>{t("filters.category")}</Txt>
      <SelectField
        label={t("filters.category")}
        value={value.category}
        options={[
          { value: "", label: t("entries.allCategories") },
          ...state.categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
        onChange={(v) => set("category", v)}
      />
      <Action
        secondary
        onPress={() =>
          setValue((s) => ({
            ...s,
            from: `${monthKey()}-01`,
            to: `${monthKey()}-31`.replace(
              /31$/,
              String(
                new Date(
                  new Date().getFullYear(),
                  new Date().getMonth() + 1,
                  0,
                ).getDate(),
              ),
            ),
          }))
        }
      >
        {t("period.month")}
      </Action>
      <Row>
        <View style={{ flex: 1 }}>
          <Field
            label={t("filters.from")}
            accessibilityLabel={t("filters.fromA11y")}
            value={value.from}
            onChangeText={(v) => set("from", v)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t("filters.to")}
            accessibilityLabel={t("filters.toA11y")}
            value={value.to}
            onChangeText={(v) => set("to", v)}
          />
        </View>
      </Row>
      <Row>
        <View style={{ flex: 1 }}>
          <Field
            label={t("filters.min")}
            accessibilityLabel={t("filters.min")}
            value={value.min}
            onChangeText={(v) => set("min", v)}
            keyboardType={mode === "cents" ? "number-pad" : "decimal-pad"}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t("filters.max")}
            accessibilityLabel={t("filters.max")}
            value={value.max}
            onChangeText={(v) => set("max", v)}
            keyboardType={mode === "cents" ? "number-pad" : "decimal-pad"}
          />
        </View>
      </Row>
      <Txt size={11}>
        {t("filters.currencyHint")}
      </Txt>
      <Choice
        value={value.sort}
        items={[
          { value: "newest", label: t("filters.newest") },
          { value: "oldest", label: t("filters.oldest") },
          { value: "amount", label: t("filters.highest") },
        ]}
        onChange={(v) => set("sort", v)}
      />
      <FormError message={error} />
      <Action
        onPress={() => {
          try {
            if (
              (value.from && !validDate(value.from)) ||
              (value.to && !validDate(value.to))
            )
              throw new Error(t("filters.invalidDates"));
            if (value.from && value.to && value.from > value.to)
              throw new Error(t("filters.endBeforeStart"));
            const amount = (text: string) => entryAmount(text, mode, true);
            if (value.min) amount(value.min);
            if (value.max) amount(value.max);
            if (value.min && value.max && amount(value.min) > amount(value.max))
              throw new Error(t("filters.maxBelowMin"));
            onApply(value);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {t("filters.apply")}
      </Action>
      <Action secondary onPress={() => onApply(defaults)}>
        {t("filters.reset")}
      </Action>
    </Sheet>
  );
}
