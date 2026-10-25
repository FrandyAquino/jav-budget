// Session unlock state for the biometric app lock, shared by the shell and the
// security settings (enabling the lock right after authenticating must not
// lock the app). Framework-free so it can be unit tested.
let unlocked = false;
const listeners = new Set<() => void>();

// Time in the background before the lock is required again. Short trips out
// of the app (Android pickers, camera, share sheet) must not destroy forms.
export const LOCK_GRACE_MS = 60_000;

export function isUnlocked() {
  return unlocked;
}
export function setUnlocked(value: boolean) {
  if (unlocked === value) return;
  unlocked = value;
  for (const listener of listeners) listener();
}
export function subscribeUnlocked(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
// Should returning to the foreground require authentication again?
export function lockExpired(
  backgroundAt: number | undefined,
  now: number,
  grace = LOCK_GRACE_MS,
) {
  return backgroundAt !== undefined && now - backgroundAt >= grace;
}
