// Framework-free backup rules shared by the native backup module, the web
// export reminder and node tests (tests/backup.test.mts). No React here.
import { dateString, validDate } from "../finance/dates.ts";
import type { FinanceState } from "../finance/types.ts";

// Documents/Backups/<user id>. Private to the app; explicit sharing exports a copy.
export const BACKUP_FOLDER = "Backups";
// The only names auto-backup creates, lists, restores or deletes.
const NAME = /^jav-budget-(\d{4}-\d{2}-\d{2})\.json$/;
export const DAILY_KEEP = 7;
export const MONTHLY_KEEP = 3;
export const EXPORT_REMINDER_DAYS = 30;
const DAY = 86_400_000;

// The backup file format: the same pretty-printed JSON the manual export
// writes, restorable through parseState.
export function serializeBackup(state: FinanceState): string {
  return JSON.stringify(state, null, 2);
}
export function backupFileName(date: string): string {
  if (!validDate(date)) throw new Error(`Invalid backup date "${date}".`);
  return `jav-budget-${date}.json`;
}
// The local calendar date of a strict backup file name, or undefined.
export function parseBackupName(name: string): string | undefined {
  const match = NAME.exec(name);
  return match && validDate(match[1]) ? match[1] : undefined;
}
// Data worth protecting: not an empty ledger (backing up an
// erased ledger would push real backups out of the retention window).
export function hasRealData(
  state: Pick<
    FinanceState,
    "accounts" | "transactions" | "budgets" | "monthlyBudgets" | "recurring" | "goals"
  >,
): boolean {
  return [
    state.accounts,
    state.transactions,
    state.budgets,
    state.monthlyBudgets,
    state.recurring,
    state.goals,
  ].some((rows) => rows.length > 0);
}
// At most one automatic backup per local day: due when today has no file yet.
// (The caller also skips it when the content equals the newest backup.)
export function isBackupDue({
  today,
  dates,
  enabled,
  realData,
}: {
  today: string;
  dates: readonly string[];
  enabled: boolean;
  realData: boolean;
}): boolean {
  return enabled && realData && !dates.includes(today);
}
// Retention: the DAILY_KEEP most recent backups, plus the newest backup of
// each of the MONTHLY_KEEP most recent calendar months before the month of
// the newest backup (at most 10 files). Count-based on existing files, so a
// long break never deletes every backup.
export function selectRetained(
  dates: readonly string[],
  { daily = DAILY_KEEP, monthly = MONTHLY_KEEP } = {},
): { keep: string[]; remove: string[] } {
  const sorted = [...new Set(dates.filter(validDate))].sort().reverse();
  const keep = new Set(sorted.slice(0, daily));
  const newestMonth = sorted[0]?.slice(0, 7);
  const months = new Set<string>();
  for (const date of sorted) {
    const month = date.slice(0, 7);
    if (month === newestMonth || months.has(month)) continue;
    if (months.size >= monthly) break;
    months.add(month);
    keep.add(date); // Sorted newest first: the month's newest backup.
  }
  return {
    keep: sorted.filter((d) => keep.has(d)),
    remove: sorted.filter((d) => !keep.has(d)),
  };
}
// Web has no automatic backups: remind to export when real data exists and
// the last export (or first real use, or the last dismissal) is 30+ days old.
export function isExportReminderDue({
  now,
  realData,
  lastExportAt,
  firstSeenAt,
  dismissedAt,
}: {
  now: Date;
  realData: boolean;
  lastExportAt?: string;
  firstSeenAt?: string;
  dismissedAt?: string;
}): boolean {
  if (!realData) return false;
  const times = [lastExportAt, firstSeenAt, dismissedAt]
    .map((v) => (v ? Date.parse(v) : NaN))
    .filter((v) => !Number.isNaN(v));
  // Nothing to measure from yet: the caller records firstSeenAt now.
  if (!times.length) return false;
  return now.valueOf() - Math.max(...times) >= EXPORT_REMINDER_DAYS * DAY;
}
export const localDate = (date = new Date()) => dateString(date);
