import type { FinanceState } from "@/features/finance/model";

// Web has no app file system: no automatic backups. Settings shows an export
// reminder instead (ExportReminder.tsx).
export const autoBackupSupported = false;
export type BackupEntry = { name: string; date: string; size: number; uri: string };

export const listBackups = (): BackupEntry[] => [];
export const cachedBackups = (revision: number): {
  revision: number;
  list: BackupEntry[];
  error?: string;
} => ({ revision, list: [] });
export const runAutoBackup = async (_state: FinanceState) => false;
export const backupNow = async (_state: FinanceState) => {};
export const readBackup = async (_entry: BackupEntry): Promise<string> => "";
export const shareBackup = async (_entry: BackupEntry) => {};
