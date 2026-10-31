import type { FinanceState } from "../model";

// Same refresh as WidgetSync (features/widgets/widget-sync.ios.tsx) for a
// background launch, which renders no UI: recurring entries the task just
// added would otherwise stay off the home-screen widget until the app opens.
// widgetSnapshot() hides amounts itself when the app lock is on. Loaded lazily
// so importing the task definition never requires the widgets native module.
export async function refreshWidget(state: FinanceState) {
  try {
    const [{ default: BudgetWidget }, { widgetTimeline }] = await Promise.all([
      import("@/features/widgets/budget-widget"),
      import("@/features/widgets/snapshot"),
    ]);
    BudgetWidget.updateTimeline(widgetTimeline(state));
  } catch (error) {
    console.warn("[background] widget refresh failed", error);
  }
}
