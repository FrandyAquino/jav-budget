import { Pressable } from "react-native";
import { router } from "expo-router";
import { Icon, Row, Sheet, Txt, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import type { PlainKey } from "@/shared/i18n/core";

const links = [
  { label: "nav.accounts", icon: "credit-card", path: "/accounts" },
  { label: "nav.categories", icon: "grid", path: "/categories" },
  { label: "nav.recurring", icon: "repeat", path: "/recurring" },
  { label: "nav.goals", icon: "target", path: "/goals" },
  { label: "nav.settings", icon: "settings", path: "/settings" },
] as const satisfies readonly { label: PlainKey; icon: string; path: string }[];

export function WorkspaceSheet({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Sheet
      title={t("home.workspace.title")}
      subtitle={t("home.workspace.subtitle")}
      onClose={onClose}
    >
      {links.map((item) => (
        <Pressable
          key={item.path}
          accessibilityRole="button"
          onPress={() => {
            onClose();
            router.push(item.path);
          }}
          style={{ paddingVertical: 12 }}
        >
          <Row>
            <Icon name={item.icon} color={colors.accent} />
            <Txt style={{ flex: 1 }} weight="500">
              {t(item.label)}
            </Txt>
            <Icon name="chevron-right" size={17} color={colors.muted} />
          </Row>
        </Pressable>
      ))}
    </Sheet>
  );
}
