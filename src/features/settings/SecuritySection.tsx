import { Platform, Switch, View } from "react-native";
import { useFinance } from "@/features/finance/store";
import { authenticate, requestReminders } from "@/features/finance/device";
import {
  Card,
  FormError,
  Row,
  Section,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import { setUnlocked } from "@/shared/app-lock";

function ToggleRow({
  title,
  description,
  value,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <Row>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt weight="500">{title}</Txt>
        <Txt size={12} color={colors.muted}>
          {description}
        </Txt>
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent }}
      />
    </Row>
  );
}

export function SecuritySection() {
  const { state, update } = useFinance();
  const { colors } = useTheme();
  const { t } = useT();
  const form = useFormAction();
  const web = Platform.OS === "web";
  return (
    <Card style={{ gap: 22 }}>
      <Section title={t("security.title")} />
      <ToggleRow
        title={t("security.biometrics")}
        description={t(web ? "security.nativeOnly" : "security.biometricsBody")}
        value={state.settings.biometrics}
        disabled={web || form.busy}
        onChange={(value) =>
          void form.run(async () => {
            await authenticate();
            // The user just authenticated: enabling the lock must not lock
            // the app they are looking at.
            setUnlocked(true);
            await update((s) => ({
              ...s,
              settings: { ...s.settings, biometrics: value },
            }));
          })
        }
      />
      <ToggleRow
        title={t("security.reminders")}
        description={t(web ? "security.nativeOnly" : "security.remindersBody")}
        value={state.settings.notifications}
        disabled={web || form.busy}
        onChange={(value) =>
          void form.run(async () => {
            if (value) await requestReminders();
            await update((s) => ({
              ...s,
              settings: { ...s.settings, notifications: value },
            }));
          })
        }
      />
      <FormError message={form.error} />
      <Txt size={11} color={colors.muted}>
        {t("security.footnote")}
      </Txt>
    </Card>
  );
}
