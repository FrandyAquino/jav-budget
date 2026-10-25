import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useFinance } from "@/features/finance/store";
import { Icon, Row, Txt, tap, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import { hasRealData, isExportReminderDue } from "./policy";

// Per-browser bookkeeping for the reminder (not part of the ledger).
const FIRST_SEEN = "jav-budget:backup:first-seen";
const DISMISSED = "jav-budget:backup:reminder-dismissed";
function read(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}
function write(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage blocked: the reminder simply shows again next time.
  }
}

// Web only (native has automatic backups): a subtle, dismissable reminder to
// export when real data exists and the last export is 30+ days old.
// Self-contained, so it can also be mounted on Home.
export function ExportReminder() {
  const { state, ready } = useFinance();
  const { colors } = useTheme();
  const { t } = useT();
  const web = Platform.OS === "web";
  const realData = ready && hasRealData(state);
  const [dismissedAt, setDismissedAt] = useState(() => (web ? read(DISMISSED) : undefined));
  const [firstSeenAt] = useState(() => (web ? read(FIRST_SEEN) : undefined));
  // Start the 30-day clock the first time real data is seen.
  useEffect(() => {
    if (web && realData && !read(FIRST_SEEN)) write(FIRST_SEEN, new Date().toISOString());
  }, [web, realData]);
  if (
    !web ||
    !isExportReminderDue({
      now: new Date(),
      realData,
      lastExportAt: state.settings.lastExportAt,
      firstSeenAt,
      dismissedAt,
    })
  )
    return null;
  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 14,
        gap: 4,
      }}
    >
      <Row style={{ alignItems: "flex-start" }}>
        <Icon name="download" size={16} color={colors.muted} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt weight="500">{t("backup.reminderTitle")}</Txt>
          <Txt size={12} color={colors.muted}>
            {state.settings.lastExportAt
              ? t("backup.reminderBody")
              : t("backup.reminderNever")}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("backup.reminderDismiss")}
          hitSlop={10}
          onPress={() => {
            tap();
            const now = new Date().toISOString();
            write(DISMISSED, now);
            setDismissedAt(now);
          }}
        >
          <Icon name="x" size={16} color={colors.muted} />
        </Pressable>
      </Row>
    </View>
  );
}
