import { Directory, File, Paths } from "expo-file-system";
import { t } from "@/shared/i18n/core";
import type { FinanceState } from "@/features/finance/model";
import { parseState } from "@/features/finance/schema";
import {
  BACKUP_FOLDER,
  backupFileName,
  hasRealData,
  isBackupDue,
  localDate,
  parseBackupName,
  selectRetained,
  serializeBackup,
} from "./policy";
import { reportBackup } from "./status";
import { canAccessLedger, getSyncStatus } from "@/features/sync/status";

// Native automatic backups in Documents/Backups (see policy.ts for the rules).
export const autoBackupSupported = true;
export type BackupEntry = { name: string; date: string; size: number; uri: string };

function owner() {
  const status = getSyncStatus();
  if (!canAccessLedger(status)) throw new Error("Sign in before accessing backups");
  return status.user!.id;
}
// Legacy unowned backups stay on disk, but are never listed under a new account.
const folder = () => new Directory(Paths.document, BACKUP_FOLDER, owner());

// Strict backup files only, newest first.
export function listBackups(): BackupEntry[] {
  const dir = folder();
  if (!dir.exists) return [];
  const entries: BackupEntry[] = [];
  for (const entry of dir.list()) {
    if (!(entry instanceof File)) continue;
    const date = parseBackupName(entry.name);
    if (date)
      entries.push({ name: entry.name, date, size: entry.size ?? 0, uri: entry.uri });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

// listBackups() cached per status revision, safe to call while rendering.
let cached: { revision: number; owner: string | null; list: BackupEntry[]; error?: string } | undefined;
export function cachedBackups(revision: number) {
  const user = canAccessLedger() ? getSyncStatus().user!.id : null;
  if (cached?.revision !== revision || cached?.owner !== user)
    try {
      cached = { revision, owner: user, list: user ? listBackups() : [] };
    } catch (error) {
      console.warn("[backup] listing backups failed", error);
      cached = { revision, owner: user, list: [], error: t("backup.listFailed") };
    }
  return cached;
}

// One backup operation at a time per JS runtime (UI, debounce, background task).
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const task = chain.then(work);
  chain = task.catch(() => {});
  return task;
}

async function write(date: string, content: string) {
  // Validate exactly what lands on disk: it must restore through parseState.
  parseState(JSON.parse(content));
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const name = backupFileName(date);
  // Write a hidden temp file first so a crash never leaves a truncated backup.
  const temp = new File(dir, `.${name}.tmp`);
  if (temp.exists) temp.delete();
  await temp.write(content);
  await temp.move(new File(dir, name), { overwrite: true });
}

// Deletes backups outside the retention window (strict names only).
function prune() {
  const backups = listBackups();
  const { remove } = selectRetained(backups.map((b) => b.date));
  for (const backup of backups)
    if (remove.includes(backup.date))
      try {
        new File(backup.uri).delete();
      } catch {
        // Retried after the next backup.
      }
}

// Automatic backup: at most one file per day, only for real (non-demo) data
// that changed since the newest backup. Never throws; failures are logged and
// surfaced through the backup status in Settings.
export function runAutoBackup(state: FinanceState): Promise<boolean> {
  if (!canAccessLedger()) return Promise.resolve(false);
  const user = owner();
  return serial(async () => {
    try {
      if (!canAccessLedger() || owner() !== user) return false;
      if (state.settings.autoBackup === false || !hasRealData(state)) return false;
      const backups = listBackups();
      const today = localDate();
      if (
        !isBackupDue({
          today,
          dates: backups.map((b) => b.date),
          enabled: true,
          realData: true,
        })
      )
        return false;
      const content = serializeBackup(state);
      const newest = backups[0];
      if (newest && (await new File(newest.uri).text()) === content) return false;
      if (!canAccessLedger() || owner() !== user) return false;
      await write(today, content);
      prune();
      reportBackup();
      return true;
    } catch (error) {
      console.warn("[backup] automatic backup failed", error);
      reportBackup(error);
      return false;
    }
  });
}

// "Back up now": writes (or refreshes) today's file even if one exists.
export function backupNow(state: FinanceState): Promise<void> {
  const user = owner();
  return serial(async () => {
    if (owner() !== user) throw new Error("Account changed before backup");
    if (state.demo) throw new Error(t("backup.demoSkipped"));
    if (!hasRealData(state)) throw new Error(t("backup.nothingToBackUp"));
    try {
      await write(localDate(), serializeBackup(state));
      prune();
      reportBackup();
    } catch (error) {
      console.warn("[backup] manual backup failed", error);
      reportBackup(error);
      throw new Error(t("backup.failed"));
    }
  });
}

export async function readBackup(entry: BackupEntry): Promise<string> {
  const file = new File(folder(), entry.name);
  if (file.uri !== entry.uri) throw new Error(t("backup.missing"));
  if (!parseBackupName(file.name) || !file.exists) throw new Error(t("backup.missing"));
  if ((file.size ?? 0) > 10_000_000) throw new Error(t("device.backupTooLarge"));
  return file.text();
}

export async function shareBackup(entry: BackupEntry) {
  const sharing = await import("expo-sharing");
  if (!(await sharing.isAvailableAsync())) throw new Error(t("device.sharingUnavailable"));
  const file = new File(folder(), entry.name);
  if (file.uri !== entry.uri || !parseBackupName(file.name)) throw new Error(t("backup.missing"));
  await sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: t("device.exportTitle"),
  });
}
