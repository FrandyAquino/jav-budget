import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { Icon, Txt } from "./text";
import { useTheme } from "./theme";

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, style]}
    >
      {children}
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Section({
  title,
  action,
  onPress,
  subtitle,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  return (
    <Row style={{ justifyContent: "space-between", marginBottom: 16 }}>
      <View style={{ flex: 1 }}>
        <Txt size={19} weight="600" style={{ letterSpacing: -0.5 }}>
          {title}
        </Txt>
        {subtitle && (
          <Txt size={12} color={colors.muted} style={{ marginTop: 4 }}>
            {subtitle}
          </Txt>
        )}
      </View>
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={{ paddingVertical: 10, paddingLeft: 10 }}
        >
          <Row style={{ gap: 5 }}>
            <Txt size={12} color={colors.accent} weight="600">
              {action}
            </Txt>
            <Icon name="arrow-up-right" size={14} color={colors.accent} />
          </Row>
        </Pressable>
      )}
    </Row>
  );
}
export function Screen({
  children,
  title,
  subtitle,
  right,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: width > 700 ? 36 : 22,
          paddingBottom: 115,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          entering={FadeIn.duration(250).reduceMotion(ReduceMotion.System)}
          style={{
            width: "100%",
            maxWidth: 1140,
            alignSelf: "center",
            gap: 26,
          }}
        >
          <Row style={{ justifyContent: "space-between", gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Txt
                size={width > 700 ? 32 : 28}
                weight="600"
                style={{ letterSpacing: -1.1 }}
              >
                {title}
              </Txt>
              {subtitle && (
                <Txt size={13} color={colors.muted} style={{ marginTop: 5 }}>
                  {subtitle}
                </Txt>
              )}
            </View>
            {right}
          </Row>
          {children}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
export function Grid({
  children,
  ratio = 1.55,
}: {
  children: [ReactNode, ReactNode];
  ratio?: number;
}) {
  const wide = useWindowDimensions().width >= 850;
  return (
    <View style={{ flexDirection: wide ? "row" : "column", gap: 24 }}>
      <View style={{ flex: wide ? ratio : undefined, gap: 24 }}>
        {children[0]}
      </View>
      <View style={{ flex: wide ? 1 : undefined, gap: 24 }}>{children[1]}</View>
    </View>
  );
}
export const styles = StyleSheet.create({
  divider: { height: 1, marginVertical: 16 },
  stack: { gap: 16 },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
