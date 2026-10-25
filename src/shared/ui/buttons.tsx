import { Button } from "panelui-native/components/button";
import { Platform, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useFinance } from "@/features/finance/store";
import { Icon, Txt } from "./text";
import { Row } from "./layout";
import { useTheme } from "./theme";

export function tap() {
  if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => {});
}
export function IconButton({
  icon,
  onPress,
  label,
  background,
}: {
  icon: string;
  onPress: () => void;
  label: string;
  background?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 15,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: background ?? colors.surface,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon name={icon} size={20} />
    </Pressable>
  );
}
export function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={{
        backgroundColor: active ? colors.accent : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.line,
        borderRadius: 100,
        paddingHorizontal: 15,
        minHeight: 40,
        justifyContent: "center",
      }}
    >
      <Row style={{ gap: 7 }}>
        {icon && (
          <Icon
            name={icon}
            size={14}
            color={active ? colors.surface : colors.muted}
          />
        )}
        <Txt
          size={12}
          weight={active ? "600" : "500"}
          color={active ? colors.surface : colors.muted}
        >
          {label}
        </Txt>
      </Row>
    </Pressable>
  );
}
export function Choice<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      {items.map((item) => (
        <Chip
          key={item.value}
          label={item.label}
          active={item.value === value}
          onPress={() => onChange(item.value)}
        />
      ))}
    </View>
  );
}
export function CurrencySwitch() {
  const { state } = useFinance();
  const { colors } = useTheme();
  return (
    <Row style={{ gap: 6 }}>
      <Icon name="globe" size={13} color={colors.muted} />
      <Txt size={12} color={colors.muted}>
        {state.settings.currency}
      </Txt>
    </Row>
  );
}
export function Action({
  children,
  onPress,
  secondary,
  danger,
  loading,
  disabled,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Button
      accessibilityRole="button"
      variant={secondary ? "outline" : danger ? "destructive" : "primary"}
      loading={loading}
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      style={{
        borderRadius: 15,
        minHeight: 49,
        backgroundColor: secondary
          ? colors.surface
          : danger
            ? colors.danger
            : colors.accent,
        borderColor: colors.line,
      }}
    >
      <Txt weight="600" color={secondary ? colors.text : colors.surface}>
        {children}
      </Txt>
    </Button>
  );
}
