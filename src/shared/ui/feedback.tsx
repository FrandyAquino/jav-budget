import { BottomSheet } from "panelui-native/components/bottom-sheet";
import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Action } from "./buttons";
import { Icon, Txt } from "./text";
import { useTheme } from "./theme";
import { useT } from "@/shared/i18n/react";

export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  open = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  open?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <BottomSheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <BottomSheet.Content
        size="auto"
        style={{
          backgroundColor: colors.surface,
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
        }}
      >
        <BottomSheet.Header
          title={
            <Txt size={23} weight="600">
              {title}
            </Txt>
          }
          description={subtitle}
        />
        <BottomSheet.Body
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, gap: 18, paddingBottom: 42 }}
        >
          {children}
        </BottomSheet.Body>
      </BottomSheet.Content>
    </BottomSheet>
  );
}
export function FormError({ message }: { message: string }) {
  const { colors } = useTheme();
  return message ? (
    <Txt accessibilityRole="alert" size={13} color={colors.danger}>
      {message}
    </Txt>
  ) : null;
}
export function useFormAction() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { t } = useT();
  const run = async (fn: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("common.saveError"),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run };
}
export function Progress({ value, color }: { value: number; color?: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{
        height: 6,
        backgroundColor: colors.line,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(value, 1)) * 100}%`,
          height: 6,
          borderRadius: 4,
          backgroundColor: color ?? colors.accent,
        }}
      />
    </View>
  );
}
export function Empty({
  icon = "inbox",
  title,
  description,
  action,
  onPress,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", padding: 28, gap: 12 }}>
      <View
        style={{ backgroundColor: colors.soft, padding: 17, borderRadius: 22 }}
      >
        <Icon name={icon} size={25} color={colors.accent} />
      </View>
      <Txt size={18} weight="600" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      <Txt color={colors.muted} style={{ textAlign: "center", maxWidth: 330 }}>
        {description}
      </Txt>
      {action && onPress && (
        <Action secondary onPress={onPress}>
          {action}
        </Action>
      )}
    </View>
  );
}
