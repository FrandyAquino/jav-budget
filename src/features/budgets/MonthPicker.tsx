import { shiftMonth } from "@/features/finance/model";
import { IconButton, Row, Txt, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const { colors } = useTheme();
  const { t, monthLabel } = useT();
  return (
    <Row style={{ gap: 7 }}>
      <IconButton
        icon="chevron-left"
        label={t("budgets.previousMonth")}
        onPress={() => onChange(shiftMonth(month, -1))}
      />
      <Txt size={13} weight="500" color={colors.muted}>
        {monthLabel(month)}
      </Txt>
      <IconButton
        icon="chevron-right"
        label={t("budgets.nextMonth")}
        onPress={() => onChange(shiftMonth(month, 1))}
      />
    </Row>
  );
}
