// Small external store for the sync status shown in Settings (and onboarding).
import { useSyncExternalStore } from "react";
import { syncConfigured } from "./config";

export type SyncErrorCode = "offline" | "auth" | "server";
// Choices the user must make before the first sync with an account.
export type SyncDecision =
  | { kind: "merge" }
  | { kind: "switch" }
  | { kind: "demo"; remoteHasData: boolean };
export type SyncStatus = {
  configured: boolean;
  // Auth state has been read (avoids flashing the sign-in form on launch).
  ready: boolean;
  user: { id: string; email: string } | null;
  // Only expose the ledger after its persisted owner matches this session.
  ledgerUserId: string | null;
  transitioning: boolean;
  phase: "idle" | "syncing" | "error" | "paused";
  error: SyncErrorCode | null;
  lastSyncedAt: string | null;
  decision: SyncDecision | null;
};
let status: SyncStatus = {
  configured: syncConfigured,
  ready: !syncConfigured,
  user: null,
  ledgerUserId: null,
  transitioning: false,
  phase: "idle",
  error: null,
  lastSyncedAt: null,
  decision: null,
};
const listeners = new Set<() => void>();
export const getSyncStatus = () => status;
export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener();
}
export function subscribeSyncStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useSyncStatus() {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}

export function canAccessLedger(value: SyncStatus = getSyncStatus()) {
  return value.configured && value.ready && !value.transitioning && !!value.user && value.ledgerUserId === value.user.id;
}
