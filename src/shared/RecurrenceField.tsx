import { View } from "react-native";
import { type Recurring } from "@/features/finance/model";
import { Field, Txt, useTheme } from "./ui";
import { SelectField } from "./SelectField";
import { useT } from "./i18n/react";
export type RepeatValue = Recurring["frequency"] | "none";
export function RecurrenceField({
  value,
  onChange,
  interval,
  onIntervalChange,
  allowNone = true,
}: {
  value: RepeatValue;
  onChange: (value: RepeatValue) => void;
  interval: string;
  onIntervalChange: (value: string) => void;
  allowNone?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View style={{ gap: 12 }}>
      <SelectField<RepeatValue>
        compact
        label={t("repeat.label")}
        value={value}
        onChange={onChange}
        options={[
          ...(allowNone
            ? [
                {
                  value: "none" as const,
                  label: t("repeat.none"),
                  icon: "minus",
                },
              ]
            : []),
          { value: "daily", label: t("frequency.daily"), icon: "repeat" },
          { value: "weekly", label: t("frequency.weekly"), icon: "repeat" },
          {
            value: "biweekly",
            label: t("frequency.biweekly"),
            icon: "repeat",
          },
          { value: "monthly", label: t("frequency.monthly"), icon: "repeat" },
          { value: "custom", label: t("repeat.customInterval"), icon: "sliders" },
        ]}
      />
      {value === "custom" && (
        <Field
          label={t("repeat.everyDays")}
          accessibilityLabel={t("repeat.everyDaysA11y")}
          keyboardType="number-pad"
          value={interval}
          onChangeText={onIntervalChange}
          placeholder={t("common.example", { value: 3 })}
        />
      )}
      {value !== "none" && (
        <Txt size={11} color={colors.muted}>
          {t("repeat.hint")}
        </Txt>
      )}
    </View>
  );
}
