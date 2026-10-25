import { DatePicker, Host } from "@expo/ui/swift-ui";
import { datePickerStyle, environment } from "@expo/ui/swift-ui/modifiers";
import { dateString, localTime } from "@/features/finance/model";
import { Txt, useTheme } from "./ui";
import type { DateTimeFieldProps } from "./DateTimeField.types";
import { useT } from "./i18n/react";
export function DateTimeField({ date, time, onChange }: DateTimeFieldProps) {
  const { isDark, colors } = useTheme();
  const { t, locale } = useT();
  return (
    <>
      {!time && (
        <Txt size={11} color={colors.muted}>
          {t("dateTime.iosNoTime")}
        </Txt>
      )}
      <Host
        matchContents
        colorScheme={isDark ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <DatePicker
          title={t("dateTime.label")}
          selection={new Date(`${date}T${time ?? "12:00"}:00`)}
          range={{ end: new Date() }}
          displayedComponents={["date", "hourAndMinute"]}
          modifiers={[
            datePickerStyle("compact"),
            environment("locale", locale),
          ]}
          onDateChange={(d) => onChange(dateString(d), localTime(d))}
        />
      </Host>
    </>
  );
}
