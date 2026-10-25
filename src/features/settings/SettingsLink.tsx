import { Pressable, View } from "react-native";
import { Icon, Row, Txt, tap, useTheme } from "@/shared/ui";

// Tappable settings row with an icon, label, optional detail and chevron.
export function SettingsLink({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: string;
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({ padding: 14, opacity: pressed ? 0.6 : 1 })}
    >
      <Row>
        <Icon name={icon} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt>{label}</Txt>
          {detail ? (
            <Txt size={12} color={colors.muted}>
              {detail}
            </Txt>
          ) : null}
        </View>
        <Icon name="chevron-right" size={16} />
      </Row>
    </Pressable>
  );
}
