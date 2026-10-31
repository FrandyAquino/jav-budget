import { Platform } from "react-native";
import { t } from "@/shared/i18n/core";
import type { FinanceState } from "./model";
import { planReminders, REMINDER_PREFIX } from "./storage/reminders";

export async function authenticate() {
  if (Platform.OS === "web")
    throw new Error(t("device.biometricsWeb"));
  const auth = await import("expo-local-authentication");
  if (!(await auth.hasHardwareAsync()) || !(await auth.isEnrolledAsync()))
    throw new Error(t("device.biometricsSetup"));
  const result = await auth.authenticateAsync({
    promptMessage: t("device.unlockPrompt"),
    cancelLabel: t("common.cancel"),
    disableDeviceFallback: false,
  });
  if (!result.success)
    throw new Error(t("device.authFailed"));
}
export async function requestReminders() {
  if (Platform.OS === "web")
    throw new Error(t("device.remindersWeb"));
  const notifications = await import("expo-notifications");
  if (Platform.OS === "android")
    await notifications.setNotificationChannelAsync("bills", {
      name: t("device.billsChannel"),
      importance: notifications.AndroidImportance.DEFAULT,
    });
  const permission = await notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error(t("device.notificationsDenied"));
}
let reminders: Promise<unknown> = Promise.resolve();
// Replaces the app-owned ("jav:") pending notifications with the planned set; serialized per runtime.
export function syncReminders(state: FinanceState) {
  const task = reminders.then(() => scheduleReminders(state));
  reminders = task.catch(() => {});
  return task;
}
async function scheduleReminders(state: FinanceState) {
  if (Platform.OS === "web") return;
  const n = await import("expo-notifications");
  n.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  const plan = planReminders(state);
  const wanted = new Set(plan.map((r) => r.identifier));
  const previous = await n.getAllScheduledNotificationsAsync();
  await Promise.all(
    previous
      .filter(
        (item) =>
          item.identifier.startsWith(REMINDER_PREFIX) &&
          !wanted.has(item.identifier),
      )
      .map((item) => n.cancelScheduledNotificationAsync(item.identifier)),
  );
  for (const reminder of plan)
    await n.scheduleNotificationAsync({
      identifier: reminder.identifier,
      content: { title: reminder.title, body: reminder.body },
      trigger: {
        type: n.SchedulableTriggerInputTypes.DATE,
        date: reminder.date,
        channelId: "bills",
      },
    });
}
export async function exportBackup(content: string) {
  const name = `jav-budget-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const { File, Paths } = await import("expo-file-system");
  const sharing = await import("expo-sharing");
  if (!(await sharing.isAvailableAsync()))
    throw new Error(t("device.sharingUnavailable"));
  const file = new File(Paths.cache, name);
  // A plain JSON copy by design (the user is taking it out of the app); it
  // must not linger in the cache once the share sheet closes.
  try {
    if (file.exists) file.delete();
    await file.write(content);
    await sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: t("device.exportTitle"),
    });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // The OS clears the cache eventually.
    }
  }
}

const MAX_BACKUP_BYTES = 10_000_000;

export async function pickBackup(): Promise<string | undefined> {
  const picker = await import("expo-document-picker");
  const result = await picker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return;
  const asset = result.assets[0];
  // Reject by size before reading anything into memory; the picker's size can
  // be missing, so fall back to the File's own size.
  if ((asset.size ?? 0) > MAX_BACKUP_BYTES)
    throw new Error(t("device.backupTooLarge"));
  if (Platform.OS === "web" && asset.file) {
    if (asset.file.size > MAX_BACKUP_BYTES)
      throw new Error(t("device.backupTooLarge"));
    return asset.file.text();
  }
  const { File } = await import("expo-file-system");
  const file = new File(asset.uri);
  if ((file.size ?? 0) > MAX_BACKUP_BYTES)
    throw new Error(t("device.backupTooLarge"));
  return file.text();
}
export async function changeAppIcon(icon: "graphite" | "chalk") {
  if (Platform.OS === "web")
    throw new Error(t("device.iconWeb"));
  try {
    const icons = await import("expo-alternate-app-icons");
    if (!icons.supportsAlternateIcons)
      throw new Error(t("device.iconUnsupported"));
    await icons.setAlternateAppIcon(icon === "chalk" ? "Chalk" : null);
  } catch (error) {
    throw new Error(
      t("device.iconFailed", {
        detail: error instanceof Error ? error.message : "",
      }).trim(),
    );
  }
}
