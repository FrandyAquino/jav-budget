import { Pressable } from "react-native";
import { router } from "expo-router";
import { useFinance } from "@/features/finance/store";
import { Icon, IconButton, Row, Txt, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

export function HomeHeaderActions({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { state, update, setNotice } = useFinance();
  const { colors, isDark } = useTheme();
  const { t, locale } = useT();
  return (
    <Row>
      <IconButton
        icon={isDark ? "sun" : "moon"}
        label={t(isDark ? "home.header.toLight" : "home.header.toDark")}
        onPress={() => {
          void update((s) => ({
            ...s,
            settings: {
              ...s.settings,
              appearance: isDark ? "light" : "dark",
            },
          })).catch(() => setNotice(t("home.header.appearanceError")));
        }}
      />
      <IconButton
        icon="bell"
        label={t("home.header.upcomingBills")}
        onPress={() => router.push("/recurring")}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("home.header.profileMenu")}
        onPress={onOpenMenu}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.input,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Txt weight="600" color={colors.text}>
          {state.settings.name
            ? state.settings.name.slice(0, 1).toLocaleUpperCase(locale)
            : "J"}
        </Txt>
      </Pressable>
    </Row>
  );
}
export function DemoBanner({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: colors.soft,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginTop: -12,
      }}
    >
      <Row style={{ justifyContent: "space-between" }}>
        <Row style={{ gap: 8 }}>
          <Icon name="sun" size={14} color={colors.accent} />
          <Txt size={11} color={colors.accent}>
            {t("home.demo.banner")}
          </Txt>
        </Row>
        <Txt size={11} weight="600" color={colors.accent}>
          {t("home.demo.cta")}
        </Txt>
      </Row>
    </Pressable>
  );
}
