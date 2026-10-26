import { useState } from "react";
import { router } from "expo-router";
import { IconButton, Icon, Row, Screen, Txt, useTheme } from "@/shared/ui";
import { AccountSection } from "./AccountSection";
import { AppIconSection } from "./AppIconSection";
import { DataSection } from "./DataSection";
import { PreferencesSection } from "./PreferencesSection";
import { ProfileSection } from "./ProfileSection";
import { SecuritySection } from "./SecuritySection";
import { useT } from "@/shared/i18n/react";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  // Bumped after a data replacement so the profile drafts reload from the new state.
  const [profileKey, setProfileKey] = useState(0);
  return (
    <Screen
      title={t("settings.title")}
      subtitle={t("settings.subtitle")}
      right={
        <IconButton
          icon="x"
          label={t("settings.close")}
          onPress={() => router.back()}
        />
      }
    >
      <ProfileSection key={profileKey} />
      <AccountSection onReplaced={() => setProfileKey((k) => k + 1)} />
      <PreferencesSection />
      <AppIconSection />
      <SecuritySection />
      <DataSection onReplaced={() => setProfileKey((k) => k + 1)} />
      <Row style={{ justifyContent: "center", gap: 8 }}>
        <Icon name="feather" size={14} color={colors.accent} />
        <Txt size={12} color={colors.muted}>
          {t("settings.footer")}
        </Txt>
      </Row>
    </Screen>
  );
}
