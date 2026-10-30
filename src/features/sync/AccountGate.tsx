import { useState, type ReactNode } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Action, FormError, Icon, Row, Txt, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import { SignInForm } from "./SignInForm";
import { SyncDecisionSheet } from "./SyncDecisionSheet";
import { requestSync, signOut } from "./engine";
import { useSyncStatus } from "./status";

const ICON = {
  light: require("../../../assets/brand/icon-light.png"),
  dark: require("../../../assets/brand/icon-dark.png"),
};
// Dark letters on the light theme, white letters on the dark theme.
const WORDMARK = {
  light: require("../../../assets/brand/wordmark-dark.png"),
  dark: require("../../../assets/brand/wordmark-light.png"),
};

// The navigator is not mounted while this screen is visible. Dismissing a
// first-sync decision must never reveal another account's retained ledger.
export function AccountGate() {
  const status = useSyncStatus();
  const { t } = useT();
  const [deciding, setDeciding] = useState(true);
  if (!status.configured)
    return (
      <GateLayout title={t("auth.welcome")} body={t("auth.unavailable")} />
    );
  if (!status.ready)
    return <GateLayout title={t("auth.welcome")} body={t("shell.loading")} />;
  if (!status.user)
    return (
      <GateLayout title={t("auth.welcome")} body={t("auth.required")}>
        <FormError
          message={status.error === "auth" ? t("auth.error.failed") : ""}
        />
        <SignInForm />
      </GateLayout>
    );
  return (
    <GateLayout
      title={t("auth.preparingTitle")}
      body={t("account.signedInAs", { email: status.user.email })}
    >
      <Txt>{t("auth.preparing")}</Txt>
      <FormError
        message={status.error ? t(`account.error.${status.error}`) : ""}
      />
      {status.decision ? (
        <Action onPress={() => setDeciding(true)}>
          {t("account.reviewDecision")}
        </Action>
      ) : (
        <Action
          loading={status.phase === "syncing"}
          onPress={() => void requestSync()}
        >
          {t("common.tryAgain")}
        </Action>
      )}
      <Action secondary onPress={() => void signOut("keep")}>
        {t("account.signOut")}
      </Action>
      {status.decision && deciding ? (
        <SyncDecisionSheet onClose={() => setDeciding(false)} />
      ) : null}
    </GateLayout>
  );
}

// Centered sign-in card; wide screens add a brand panel beside it.
function GateLayout({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: wide ? 48 : 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          entering={FadeIn.duration(250).reduceMotion(ReduceMotion.System)}
          style={{
            width: "100%",
            maxWidth: wide ? 980 : 420,
            alignSelf: "center",
            flexDirection: wide ? "row" : "column",
            alignItems: wide ? "center" : "stretch",
            gap: wide ? 72 : 28,
          }}
        >
          {wide && <BrandPanel />}
          <View style={{ flex: wide ? 1 : undefined, gap: 24 }}>
            <View style={{ gap: 18 }}>
              {!wide && <Logo size={64} />}
              <View style={{ gap: 6 }}>
                <Txt
                  accessibilityRole="header"
                  size={28}
                  weight="600"
                  style={{ letterSpacing: -0.9 }}
                >
                  {title}
                </Txt>
                <Txt size={15} color={colors.muted}>
                  {body}
                </Txt>
              </View>
            </View>
            {children && (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.line,
                  padding: wide ? 28 : 20,
                  gap: 16,
                }}
              >
                {children}
              </View>
            )}
            <Txt
              size={12}
              color={colors.muted}
              style={{ textAlign: "center" }}
            >
              {t("auth.footer")}
            </Txt>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Logo({ size }: { size: number }) {
  const { isDark } = useTheme();
  return (
    <Image
      source={ICON[isDark ? "dark" : "light"]}
      accessibilityLabel="Jav Budget"
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size }}
    />
  );
}

function BrandPanel() {
  const { colors, isDark } = useTheme();
  const { t } = useT();
  const features = [
    { icon: "pie-chart", text: t("auth.feature.budgets") },
    { icon: "refresh-cw", text: t("auth.feature.sync") },
    { icon: "shield", text: t("auth.feature.private") },
  ] as const;
  return (
    <View style={{ flex: 1, gap: 28 }}>
      <Image
        source={WORDMARK[isDark ? "dark" : "light"]}
        accessibilityLabel="Jav Budget"
        contentFit="contain"
        contentPosition="left"
        style={{ width: 168, height: 74 }}
      />
      <Txt size={38} weight="600" style={{ letterSpacing: -1.4 }}>
        {t("auth.tagline")}
      </Txt>
      <View style={{ gap: 16 }}>
        {features.map((f) => (
          <Row key={f.icon} style={{ gap: 12 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: colors.soft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={f.icon} size={17} color={colors.text} />
            </View>
            <Txt size={15} color={colors.muted} style={{ flex: 1 }}>
              {f.text}
            </Txt>
          </Row>
        ))}
      </View>
    </View>
  );
}
