import { useState } from "react";
import { View, Pressable } from "react-native";
import { today } from "@/features/finance/model";
import { Action, DateField, Icon, Row, Sheet, Txt, useTheme } from "./ui";
import { SelectField } from "./SelectField";
import type { DateTimeFieldProps } from "./DateTimeField.types";
import { useT } from "./i18n/react";
export function DateTimeField({ date, time, onChange }: DateTimeFieldProps) {
  const { colors } = useTheme();
  const { t, mediumDate } = useT();
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(date);
  const [hour, setHour] = useState(time?.slice(0, 2) ?? "12");
  const [minute, setMinute] = useState(time?.slice(3) ?? "00");
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("dateTime.a11y", {
          date: mediumDate(date),
          time: time ?? t("dateTime.notRecorded"),
        })}
        onPress={() => {
          setDraftDate(date);
          setHour(time?.slice(0, 2) ?? "12");
          setMinute(time?.slice(3) ?? "00");
          setOpen(true);
        }}
        style={{ backgroundColor: colors.input, padding: 16, borderRadius: 12 }}
      >
        <Row>
          <Icon name="calendar" size={18} />
          <View style={{ flex: 1 }}>
            <Txt size={11} color={colors.muted}>
              {t("dateTime.label")}
            </Txt>
            <Txt>
              {mediumDate(date)} · {time ?? t("dateTime.timeNotRecorded")}
            </Txt>
          </View>
          <Icon name="chevron-down" size={16} />
        </Row>
      </Pressable>
      {open && (
        <Sheet title={t("dateTime.label")} onClose={() => setOpen(false)}>
          <DateField
            label={t("dateTime.date")}
            value={draftDate}
            onChange={setDraftDate}
            maxDate={today()}
          />
          <Row>
            <View style={{ flex: 1 }}>
              <SelectField
                label={t("dateTime.hour")}
                value={hour}
                onChange={setHour}
                options={Array.from({ length: 24 }, (_, i) => ({
                  value: String(i).padStart(2, "0"),
                  label: String(i).padStart(2, "0"),
                }))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <SelectField
                label={t("dateTime.minute")}
                value={minute}
                onChange={setMinute}
                options={Array.from({ length: 60 }, (_, i) => ({
                  value: String(i).padStart(2, "0"),
                  label: String(i).padStart(2, "0"),
                }))}
              />
            </View>
          </Row>
          <Action
            onPress={() => {
              onChange(draftDate, `${hour}:${minute}`);
              setOpen(false);
            }}
          >
            {t("dateTime.apply")}
          </Action>
        </Sheet>
      )}
    </>
  );
}
