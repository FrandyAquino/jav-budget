import { Input } from "panelui-native/components/input";
import { DatePicker } from "panelui-native/components/date-picker";
import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { dateString, validDate } from "@/features/finance/model";
import { useT } from "@/shared/i18n/react";
import { Icon, Txt } from "./text";
import { useTheme } from "./theme";

export function Field(props: ComponentProps<typeof Input>) {
  const { colors } = useTheme();
  return (
    <Input
      {...props}
      style={[
        { color: colors.text, backgroundColor: colors.input, borderRadius: 12 },
        props.style,
      ]}
    />
  );
}
export function DateField({
  label,
  value,
  onChange,
  minDate,
  maxDate,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
}) {
  const { colors } = useTheme();
  const { t, locale, mediumDate } = useT();
  return (
    <View style={{ gap: 8 }}>
      <Txt size={12} weight="500">
        {label}
      </Txt>
      <DatePicker
        selected={validDate(value) ? new Date(`${value}T12:00:00`) : undefined}
        onSelect={(date) => {
          if (date) onChange(dateString(date));
        }}
        minDate={
          minDate && validDate(minDate)
            ? new Date(`${minDate}T12:00:00`)
            : undefined
        }
        maxDate={
          maxDate && validDate(maxDate)
            ? new Date(`${maxDate}T12:00:00`)
            : undefined
        }
        captionLayout="dropdown"
        locale={locale}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{
            minHeight: 48,
            backgroundColor: colors.input,
            borderRadius: 12,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Txt size={14}>
            {validDate(value) ? mediumDate(value) : t("dates.chooseDate")}
          </Txt>
          <Icon name="calendar" color={colors.muted} size={18} />
        </Pressable>
      </DatePicker>
    </View>
  );
}
