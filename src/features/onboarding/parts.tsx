import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Row, Txt, tap, useTheme } from "@/shared/ui";

// Step title block shared by every onboarding step.
export function StepHeading({
  title,
  body,
  large,
}: {
  title: string;
  body: string;
  large?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Txt
        accessibilityRole="header"
        size={large ? 34 : 28}
        weight="600"
        style={{ letterSpacing: large ? -1.2 : -0.9 }}
      >
        {title}
      </Txt>
      <Txt size={large ? 16 : 15} color={colors.muted}>
        {body}
      </Txt>
    </View>
  );
}

// Labeled group of controls inside a step.
export function Group({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Txt size={13} weight="600" color={colors.muted}>
        {label}
      </Txt>
      {children}
    </View>
  );
}

// Inset-grouped single choice (radio rows), e.g. the default currency.
export function OptionList<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; badge: string }[];
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              tap();
              onChange(option.value);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: pressed ? colors.soft : "transparent",
              borderTopWidth: i ? StyleSheet.hairlineWidth : 0,
              borderTopColor: colors.line,
            })}
          >
            <Row style={{ gap: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: selected ? colors.accent : colors.input,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt
                  size={13}
                  weight="600"
                  color={selected ? colors.surface : colors.text}
                >
                  {option.badge}
                </Txt>
              </View>
              <Txt size={16} weight="500" style={{ flex: 1 }}>
                {option.label}
              </Txt>
              {selected ? (
                <Icon name="check" size={20} color={colors.accent} />
              ) : null}
            </Row>
          </Pressable>
        );
      })}
    </View>
  );
}

// Segmented progress for the setup steps after the welcome screen.
export function StepProgress({
  step,
  total,
  label,
}: {
  step: number;
  total: number;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: total, now: step }}
      style={{ flexDirection: "row", gap: 6, flex: 1, maxWidth: 180 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < step ? colors.accent : colors.line,
          }}
        />
      ))}
    </View>
  );
}
