import { useEffect } from "react";
import { Platform } from "react-native";
import { router, useNavigationContainerRef, type Href } from "expo-router";
import * as QuickActions from "expo-quick-actions";
import { isRouterAction, type RouterAction } from "expo-quick-actions/router";
import { useT } from "@/shared/i18n/react";
import type { Translate } from "@/shared/i18n/core";

const ios = Platform.OS === "ios";

// Titles follow the app language; the add route reads `kind` from the href.
const items = (t: Translate): RouterAction<Href>[] => [
  {
    id: "add-expense",
    title: t("quickActions.addExpense"),
    icon: ios ? "symbol:minus.circle" : null,
    params: { href: "/add?kind=expense" },
  },
  {
    id: "add-income",
    title: t("quickActions.addIncome"),
    icon: ios ? "symbol:plus.circle" : null,
    params: { href: "/add?kind=income" },
  },
  {
    id: "activity",
    title: t("quickActions.activity"),
    icon: ios ? "symbol:list.bullet" : null,
    params: { href: "/activity" },
  },
  {
    id: "budgets",
    title: t("quickActions.budgets"),
    icon: ios ? "symbol:chart.pie" : null,
    params: { href: "/budgets" },
  },
];

let initialHandled = false;

// Registers home-screen quick actions and routes to their `params.href`.
// We don't use `useQuickActionRouting` from expo-quick-actions/router: it must
// live below a navigator, but the root Stack (AppShell) only mounts after data
// loads and the biometric lock opens. Actions wait until a navigator is ready.
export function QuickActionsSync() {
  const navigation = useNavigationContainerRef();
  const { t } = useT();

  useEffect(() => {
    void QuickActions.setItems(items(t)).catch(() => {});
  }, [t]);

  useEffect(() => {
    let stopWaiting: (() => void) | undefined;
    const open = (action: QuickActions.Action | undefined) => {
      if (!action || !isRouterAction(action)) return;
      const href = action.params.href as Href;
      stopWaiting?.();
      stopWaiting = undefined;
      const go = () => {
        if (!navigation.isReady()) return false;
        setTimeout(() => router.navigate(href));
        return true;
      };
      if (go()) return;
      const unsubscribe = navigation.addListener("state", () => {
        if (!go()) return;
        unsubscribe();
        stopWaiting = undefined;
      });
      stopWaiting = unsubscribe;
    };
    if (!initialHandled) {
      initialHandled = true;
      open(QuickActions.initial);
    }
    const subscription = QuickActions.addListener(open);
    return () => {
      subscription.remove();
      stopWaiting?.();
    };
  }, [navigation]);

  return null;
}
