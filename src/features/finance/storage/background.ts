import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { getLocales } from "expo-localization";
import { resolveLanguage, setLanguage } from "@/shared/i18n/core";
import { processRecurring } from "../model";
import { parseState } from "../schema";
import { syncReminders } from "../device";
import { transact } from "./backend";
import { runAutoBackup } from "@/features/backup/files";
import { backgroundSync } from "@/features/sync/engine";

// Defined at module scope (imported from the root layout) so a background launch can find it.
export const RECURRING_TASK = "jav-budget:recurring";
if (!TaskManager.isTaskDefined(RECURRING_TASK))
  TaskManager.defineTask(RECURRING_TASK, async () => {
    try {
      const state = await transact((base) => {
        if (!base) return base;
        // A cold background launch has no UI to resolve the language yet
        // (core.ts starts in English); reminders must use the user's language.
        setLanguage(resolveLanguage(base.settings.language, getLocales()));
        return parseState(processRecurring(base));
      });
      // Daily automatic backup (never throws; skipped for demo/unchanged data).
      if (state) await runAutoBackup(state);
      if (state) await syncReminders(state);
      // Cloud sync when signed in (bounded; never throws).
      if (state) await backgroundSync();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

export async function registerBackgroundProcessing() {
  if (
    !(await TaskManager.isAvailableAsync()) ||
    (await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available ||
    (await TaskManager.isTaskRegisteredAsync(RECURRING_TASK))
  )
    return;
  await BackgroundTask.registerTaskAsync(RECURRING_TASK, { minimumInterval: 6 * 60 });
}
