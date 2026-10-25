import { Pressable } from "react-native";
import type { Kind } from "@/features/finance/model";
import { Icon, Row, Txt, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

const items = [
  { kind: "income", icon: "arrow-down-left" },
  { kind: "expense", icon: "arrow-up-right" },
  { kind: "transfer", icon: "repeat" },
] as const;

export function QuickActions({ onAdd }: { onAdd: (kind: Kind) => void }) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Row style={{ gap: 10 }}>
      {items.map((item) => (
        <Pressable
          key={item.kind}
          accessibilityRole="button"
          accessibilityLabel={t(`home.quick.add.${item.kind}`)}
          onPress={() => onAdd(item.kind)}
          style={{
            flex: 1,
            borderRadius: 18,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            padding: 16,
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name={item.icon} size={22} color={colors.accent} />
          <Txt size={12} weight="500">
            {t(`kind.${item.kind}`)}
          </Txt>
        </Pressable>
      ))}
    </Row>
  );
}
