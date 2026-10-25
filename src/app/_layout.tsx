import "../global.css";
import "@/features/finance/storage/background";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { FinanceProvider } from "@/features/finance/store";
import { FinanceI18nProvider } from "@/features/finance/FinanceI18n";
import { AppShell } from "@/shared/AppShell";
import { QuickActionsSync } from "@/features/quick-actions/quick-actions";
import { WidgetSync } from "@/features/widgets/widget-sync";
import { BackupSync } from "@/features/backup/BackupSync";
export { ErrorBoundary } from "expo-router";

void SplashScreen.preventAutoHideAsync().catch(() => {});
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <FinanceProvider>
        <FinanceI18nProvider>
          <AppShell />
          <WidgetSync />
          <QuickActionsSync />
          <BackupSync />
        </FinanceI18nProvider>
      </FinanceProvider>
    </SafeAreaProvider>
  );
}
