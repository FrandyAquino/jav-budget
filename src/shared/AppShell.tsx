import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type ComponentProps,
} from "react";
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { PanelUIProvider } from "panelui-native/provider";
import { Stack, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { Uniwind } from "uniwind";
import { useFinance } from "@/features/finance/store";
import { authenticate } from "@/features/finance/device";
import { Action, FormError, Icon, Row, Txt, tap, useTheme } from "./ui";
import { useT } from "./i18n/react";
import type { PlainKey } from "./i18n/core";
import {
  isUnlocked,
  lockExpired,
  setUnlocked,
  subscribeUnlocked,
} from "./app-lock";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
export function AppShell() {
  const {
    state,
    ready,
    loadError,
    retry,
    canStartEmpty,
    startEmpty,
    notice,
    setNotice,
  } = useFinance();
  const { colors, isDark } = useTheme();
  const { t } = useT();
  const unlocked = useSyncExternalStore(
    subscribeUnlocked,
    isUnlocked,
    isUnlocked,
  );
  // Hides content in the app switcher without unmounting anything.
  const [covered, setCovered] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  useEffect(() => {
    if (ready || loadError) void SplashScreen.hideAsync().catch(() => {});
  }, [ready, loadError]);
  useEffect(() => {
    Uniwind.setTheme(state.settings.appearance);
  }, [state.settings.appearance]);
  useEffect(() => {
    // Only lock after a real absence: Android pickers, the camera and the
    // share sheet background the app for a few seconds and must not lose
    // the form, CSV import or backup restore in progress.
    let backgroundAt: number | undefined;
    const listener = AppState.addEventListener("change", (status) => {
      setCovered(status !== "active");
      if (status === "background") backgroundAt ??= Date.now();
      else if (status === "active") {
        if (lockExpired(backgroundAt, Date.now())) setUnlocked(false);
        backgroundAt = undefined;
      }
    });
    return () => listener.remove();
  }, []);
  const container = (children: ReactNode) => (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        gap: 20,
      }}
    >
      <View style={{ width: "100%", maxWidth: 380, gap: 20 }}>{children}</View>
    </View>
  );
  const lockable = state.settings.biometrics && Platform.OS !== "web";
  const locked = lockable && !unlocked;
  if (Platform.OS === "web" && !hydrated) return null;
  if (!ready)
    return container(
      <>
        <Txt size={32} weight="600">
          jav-budget
        </Txt>
        {loadError ? (
          <>
            <FormError message={loadError} />
            <Pressable accessibilityRole="button" onPress={retry}>
              <Txt color={colors.accent}>{t("common.tryAgain")}</Txt>
            </Pressable>
            {canStartEmpty ? (
              <Pressable accessibilityRole="button" onPress={startEmpty}>
                <Txt color={colors.accent}>{t("store.startEmpty")}</Txt>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Txt color={colors.muted}>{t("shell.loading")}</Txt>
            {[100, 70, 85].map((width, i) => (
              <View
                key={i}
                style={{
                  height: i === 0 ? 140 : 28,
                  width: `${width}%`,
                  borderRadius: 16,
                  backgroundColor: colors.line,
                }}
              />
            ))}
          </>
        )}
      </>,
    );
  const shell = (
    <PanelUIProvider background={false}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        style={{ flex: 1 }}
        // Keep the navigator mounted under the lock, hidden from assistive tech.
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="accounts" />
          <Stack.Screen name="categories" />
          <Stack.Screen name="recurring" />
          <Stack.Screen name="goals" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="import" />
        </Stack>
        {notice ? (
          <Pressable
            accessibilityRole="alert"
            accessibilityHint={t("shell.dismissNotice")}
            onPress={() => setNotice("")}
            style={{
              position: "absolute",
              bottom: 100,
              left: 24,
              right: 24,
              maxWidth: 540,
              alignSelf: "center",
              backgroundColor: colors.text,
              padding: 16,
              borderRadius: 17,
              zIndex: 100,
            }}
          >
            <Row>
              <Icon name="check-circle" color={colors.surface} size={18} />
              <Txt color={colors.surface} size={13} style={{ flex: 1 }}>
                {notice}
              </Txt>
              <Icon name="x" color={colors.surface} size={14} />
            </Row>
          </Pressable>
        ) : null}
      </View>
      {/* A Modal sits above sheets and pickers that are still open; the
          navigator underneath stays mounted so nothing in progress is lost. */}
      <Modal
        visible={locked}
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {}}
      >
        {container(
          <>
            <Icon name="shield" size={42} color={colors.accent} />
            <Txt size={30} weight="600">
              {t("shell.lockedTitle")}
            </Txt>
            <Txt color={colors.muted}>{t("shell.lockedBody")}</Txt>
            <FormError message={authError} />
            <Action
              loading={authenticating}
              onPress={() => {
                setAuthenticating(true);
                setAuthError("");
                void authenticate()
                  .then(() => setUnlocked(true))
                  .catch((e) => setAuthError(e.message))
                  .finally(() => setAuthenticating(false));
              }}
            >
              {t("shell.unlock")}
            </Action>
          </>,
        )}
      </Modal>
    </PanelUIProvider>
  );
  return (
    <View style={{ flex: 1 }}>
      {shell}
      {/* Privacy cover for the app switcher while inactive or backgrounded;
          drawn above the sheet portal host, without unmounting anything. */}
      {lockable && covered && !locked ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}
        >
          {container(<Icon name="shield" size={42} color={colors.accent} />)}
        </View>
      ) : null}
    </View>
  );
}

const labels: Record<string, { label: PlainKey; icon: string }> = {
  index: { label: "tabs.home", icon: "home" },
  activity: { label: "tabs.activity", icon: "list" },
  add: { label: "tabs.add", icon: "plus" },
  budgets: { label: "tabs.budgets", icon: "pie-chart" },
  insights: { label: "tabs.insights", icon: "bar-chart-2" },
};
const TabBar: NonNullable<ComponentProps<typeof Tabs>["tabBar"]> = ({
  state,
  emitter,
  navigateToTab,
}) => {
  const { colors } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingTop: 12,
      }}
    >
      <Row
        style={{ width: "100%", maxWidth: 660, alignSelf: "center", gap: 0 }}
      >
        {state.routes.map((route, index) => {
          const item = labels[route.name];
          if (!item) return null;
          const focused = state.index === index;
          const add = route.name === "add";
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={t(item.label)}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                tap();
                const event = emitter.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented)
                  navigateToTab(route.key);
              }}
              style={{ flex: 1, alignItems: "center", gap: 4, minHeight: 49 }}
            >
              <View
                style={{
                  width: add ? 49 : 44,
                  height: add ? 43 : 28,
                  borderRadius: 16,
                  backgroundColor: add
                    ? colors.accent
                    : focused
                      ? colors.soft
                      : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: add ? -6 : 0,
                }}
              >
                <Icon
                  name={item.icon}
                  size={add ? 25 : 21}
                  color={
                    add
                      ? colors.surface
                      : focused
                        ? colors.accent
                        : colors.muted
                  }
                />
              </View>
              <Txt
                size={10}
                weight={focused ? "600" : "400"}
                color={focused ? colors.accent : colors.muted}
              >
                {t(item.label)}
              </Txt>
            </Pressable>
          );
        })}
      </Row>
    </View>
  );
};
export function MainTabs() {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        animation: "fade",
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tabs.home") }} />
      <Tabs.Screen name="activity" options={{ title: t("tabs.activity") }} />
      <Tabs.Screen name="add" options={{ title: t("tabs.add") }} />
      <Tabs.Screen name="budgets" options={{ title: t("tabs.budgets") }} />
      <Tabs.Screen name="insights" options={{ title: t("tabs.insights") }} />
    </Tabs>
  );
}
