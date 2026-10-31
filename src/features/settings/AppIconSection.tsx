import { Image } from "expo-image";
import { Platform, Pressable } from "react-native";
import { useFinance } from "@/features/finance/store";
import { changeAppIcon } from "@/features/finance/device";
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

const icons = {
  graphite: {
    label: "appIcon.graphite",
    source: require("../../../assets/icons/graphite.png"),
  },
  chalk: {
    label: "appIcon.chalk",
    source: require("../../../assets/icons/chalk.png"),
  },
} as const;

export function AppIconSection() {
  const { state, update, setNotice } = useFinance();
  const { colors } = useTheme();
  const { t } = useT();
  const form = useFormAction();
  const selected = state.settings.appIcon ?? "graphite";
  return (
    <Card style={{ gap: 16 }}>
      <Section title={t("appIcon.title")} />
      <Row>
        {(["graphite", "chalk"] as const).map((icon) => (
          <Pressable
            key={icon}
            accessibilityRole="button"
            accessibilityLabel={t("appIcon.a11y", { name: t(icons[icon].label) })}
            accessibilityState={{ selected: selected === icon }}
            disabled={Platform.OS === "web" || form.busy}
            onPress={() =>
              void form.run(async () => {
                await changeAppIcon(icon);
                await update((s) => ({
                  ...s,
                  settings: { ...s.settings, appIcon: icon },
                }));
                setNotice(t("appIcon.updated"));
              })
            }
            style={{
              alignItems: "center",
              gap: 8,
              padding: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: selected === icon ? colors.text : colors.line,
            }}
          >
            {/* expo-image downsamples the large PNGs to the 64pt view. */}
            <Image
              source={icons[icon].source}
              contentFit="cover"
              recyclingKey={icon}
              style={{ width: 64, height: 64, borderRadius: 15 }}
            />
            <Txt size={12}>{t(icons[icon].label)}</Txt>
          </Pressable>
        ))}
      </Row>
      <FormError message={form.error} />
      <Txt size={11} color={colors.muted}>
        {t(Platform.OS === "web" ? "appIcon.webHint" : "appIcon.buildHint")}
      </Txt>
    </Card>
  );
}
