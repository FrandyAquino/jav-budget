// In-memory status of the automatic backups, for the Settings screen.
// Bumping `revision` tells listeners to re-list the backup folder.
export type BackupStatus = {
  revision: number;
  // Message of the last failed attempt; cleared by the next success.
  error?: string;
};
let status: BackupStatus = { revision: 0 };
const listeners = new Set<() => void>();

export const getBackupStatus = () => status;
export function subscribeBackupStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function reportBackup(error?: unknown) {
  status = {
    revision: status.revision + 1,
    error:
      error === undefined
        ? undefined
        : error instanceof Error
          ? error.message
          : String(error),
  };
  for (const listener of listeners) listener();
}
// Re-list the folder (e.g. when Settings opens; files may change in Files).
export function refreshBackupList() {
  status = { ...status, revision: status.revision + 1 };
  for (const listener of listeners) listener();
}
