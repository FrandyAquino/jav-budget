import { useState } from "react";
import { View } from "react-native";
import {
  currentRange,
  daysInRange,
  today,
  validDate,
  type DateRange,
} from "@/features/finance/model";
import {
  Action,
  Choice,
  DateField,
  FormError,
  Sheet,
  Txt,
  useTheme,
} from "./ui";
import { useT } from "./i18n/react";

export function usePeriod() {
  const [range, setRange] = useState<DateRange>(() => currentRange("month"));
  const [mode, setMode] = useState<"week" | "month" | "custom">("month");
  return {
    range: mode === "custom" ? range : currentRange(mode),
    mode,
    change: (mode: "week" | "month" | "custom", range: DateRange) => {
      setMode(mode);
      setRange(range);
    },
  };
}
export function PeriodSelector({
  period,
}: {
  period: ReturnType<typeof usePeriod>;
}) {
  const { colors } = useTheme();
  const { t, shortDate, mediumDate } = useT();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(period.range.from);
  const [to, setTo] = useState(period.range.to);
  const [error, setError] = useState("");
  return (
    <View style={{ gap: 9 }}>
      <Choice
        value={period.mode}
        items={[
          { value: "week", label: t("period.week") },
          { value: "month", label: t("period.month") },
          { value: "custom", label: t("period.custom") },
        ]}
        onChange={(mode) => {
          if (mode === "custom") {
            setFrom(period.range.from);
            setTo(period.range.to);
            setOpen(true);
          } else period.change(mode, currentRange(mode));
        }}
      />
      <Txt size={11} color={colors.muted}>
        {t("dates.range", {
          from: shortDate(period.range.from),
          to: mediumDate(period.range.to),
        })}
      </Txt>
      {open && (
        <Sheet
          title={t("period.sheetTitle")}
          subtitle={t("period.sheetSubtitle")}
          onClose={() => setOpen(false)}
        >
          <DateField
            label={t("period.start")}
            value={from}
            onChange={setFrom}
            maxDate={today()}
          />
          <DateField
            label={t("period.end")}
            value={to}
            onChange={setTo}
            minDate={from}
            maxDate={today()}
          />
          <FormError message={error} />
          <Action
            onPress={() => {
              const range = { from, to };
              if (
                !validDate(from) ||
                !validDate(to) ||
                from > to ||
                to > today()
              ) {
                setError(t("period.invalid"));
                return;
              }
              if (daysInRange(range) > 366) {
                setError(t("period.tooLong"));
                return;
              }
              period.change("custom", range);
              setOpen(false);
            }}
          >
            {t("period.apply")}
          </Action>
        </Sheet>
      )}
    </View>
  );
}
