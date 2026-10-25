import type { Recurring } from "@/features/finance/model";
import type { Translate } from "./core";

// "Monthly" / "Every 3 days".
export function frequencyLabel(
  t: Translate,
  { frequency, intervalDays }: Pick<Recurring, "frequency" | "intervalDays">,
) {
  return frequency === "custom"
    ? t("frequency.everyDays", { count: intervalDays ?? 1 })
    : t(`frequency.${frequency}`);
}
