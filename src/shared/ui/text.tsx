import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps, ReactNode } from "react";
import { Platform, Text, type StyleProp, type TextStyle } from "react-native";
import type { Currency } from "@/features/finance/model";
import { useT } from "@/shared/i18n/react";
import { useTheme } from "./theme";

export function Txt({
  children,
  size = 14,
  weight = "400",
  color,
  style,
  ...props
}: {
  children?: ReactNode;
  size?: number;
  weight?: TextStyle["fontWeight"];
  color?: string;
  style?: StyleProp<TextStyle>;
} & Omit<ComponentProps<typeof Text>, "style">) {
  const { colors } = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: color ?? colors.text,
          fontSize: size,
          fontWeight: weight,
          lineHeight: size * 1.45,
          fontFamily: Platform.OS === "ios" ? "System" : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <Feather
      name={
        (name in Feather.glyphMap ? name : "circle") as ComponentProps<
          typeof Feather
        >["name"]
      }
      size={size}
      color={color ?? colors.text}
      // Decorative: keeps the icon font's glyph out of screen reader labels.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
export function Amount({
  value,
  currency,
  size = 24,
  color,
}: {
  value: number;
  currency: Currency;
  size?: number;
  color?: string;
}) {
  const { money } = useT();
  return (
    <Txt
      size={size}
      weight="600"
      color={color}
      style={{ fontVariant: ["tabular-nums"], letterSpacing: -size * 0.035 }}
    >
      {money(value, currency)}
    </Txt>
  );
}
