// Sync orchestration: auth (email OTP), push/pull cycles, the first sign-in
// merge, receipts and sign-out. The rules live in ./core (pure, unit-tested);
// this module does the I/O. Every run is serialized and never blocks the UI.
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isAuthApiError } from "@supabase/supabase-js";
import { emptyState, type FinanceState } from "@/features/finance/model";
import { parseState } from "@/features/finance/schema";
import { syncTransact, transact } from "@/features/finance/storage/backend";
import type { SyncLocal, SyncPatch } from "@/features/finance/storage/shared";
import { LedgerOwnerChangedError, requireLedgerOwner } from "@/features/finance/storage/shared";
import { hasRealData } from "@/features/backup/policy";
import { clearReceiptCache, sweepReceipts } from "@/features/transactions/receipts";
import {
  acknowledged,
  afterCursor,
  applyRemote,
  buildPush,
  decideFirstSync,
  EPOCH,
  keepDeviceSettings,
  lastCursor,
  latestMeta,
  localKind,
  metaSince,
  planReceipts,
  pullStart,
  seedOutbox,
  stampTime,
  type Cursor,
  type MetaRow,
  type RecordRow,
} from "./core";
import { RECEIPTS_BUCKET, SUPABASE_URL, syncConfigured } from "./config";
import { emailLinkToken } from "./email-link";
import { beginGoogleSignIn, finishGoogleSignIn, hasGoogleCallback } from "./google-auth";
import { createAuthVerifier } from "./auth-verifier";
import { getSupabase } from "./supabase";
import {
  downloadReceipt,
  receiptExists,
  receiptSyncSupported,
  receiptUrl,
  uploadReceipt,
} from "./receipt-files";
import { canAccessLedger, getSyncStatus, setSyncStatus, type SyncErrorCode } from "./status";

const PAGE = 1000;
const receiptDownloads = new Set<Promise<unknown>>();
const RECORD_COLUMNS = "collection,id,data,position,deleted,client_updated_at,server_updated_at";

// Persisted values (SyncLocal.values).
type Values = {
  userId?: string; // account this device's data belongs to
  bootstrapped?: string; // user id whose first sync finished
  cursor?: string; // JSON Cursor
  metaCursor?: string; // newest sync_meta server_updated_at seen
  parked?: string; // JSON RecordRow[]
  receipts?: string; // JSON string[] of names known to be in the cloud
  lastSyncedAt?: string;
};
const values = (local: SyncLocal) => local.values as Values;
const json = <T,>(raw: string | undefined, fallback: T): T => {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const read = () =>
  syncTransact((base, local) => ({ result: { base, local } }));
const patch = (p: SyncPatch) => syncTransact(() => ({ patch: p, result: undefined }));
const patchOwned = (user: string, p: SyncPatch) => syncTransact((_base, local) => {
  requireLedgerOwner(local, user);
  return { patch: p, result: undefined };
});

async function currentSession(client: SupabaseClient): Promise<Session | null> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}
function errorCode(error: unknown): SyncErrorCode {
  if (isAuthApiError(error) || (error as { status?: number })?.status === 401) return "auth";
  const message = String((error as Error)?.message ?? error);
  return /network|fetch|offline|timed? ?out/i.test(message) ? "offline" : "server";
}
const later = (a: Cursor | null, b: Cursor | null) => {
  if (!a || !b) return a ?? b;
  const ta = stampTime(a.at);
  const tb = stampTime(b.at);
  if (ta !== tb) return ta > tb ? a : b;
  return `${a.collection}/${a.id}` >= `${b.collection}/${b.id}` ? a : b;
};
// Leaves the onboarding once the cloud brought real data.
const onboardedIfData = (state: FinanceState) =>
  state.settings.onboarded === false && hasRealData(state)
    ? { ...state, settings: { ...state.settings, onboarded: true } }
    : state;

// --- Auth ----------------------------------------------------------------
export type AuthErrorCode = "invalidEmail" | "invalidCode" | "rateLimited" | "emailNotAllowed" | "offline" | "failed";
export class SyncAuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
  }
}
function authError(error: unknown, verifying: boolean): SyncAuthError {
  const code = (error as { code?: string })?.code ?? "";
  const status = (error as { status?: number })?.status;
  if (code === "email_address_not_authorized") return new SyncAuthError("emailNotAllowed");
  if (code.includes("rate_limit") || status === 429) return new SyncAuthError("rateLimited");
  if (verifying && (code === "otp_expired" || status === 403 || status === 401))
    return new SyncAuthError("invalidCode");
  if (code === "email_address_invalid" || code === "validation_failed" || (!verifying && status === 400))
    return new SyncAuthError("invalidEmail");
  return new SyncAuthError(errorCode(error) === "offline" ? "offline" : "failed");
}
export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export async function sendCode(email: string) {
  const client = getSupabase();
  if (!client) throw new SyncAuthError("failed");
  if (!validEmail(email)) throw new SyncAuthError("invalidEmail");
  try {
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  } catch (error) {
    throw error instanceof SyncAuthError ? error : authError(error, false);
  }
}
export async function verifyCode(email: string, token: string) {
  const client = getSupabase();
  if (!client) throw new SyncAuthError("failed");
  const code = token.trim();
  const hash = /^\d{6}$/.test(code) ? null : emailLinkToken(code, SUPABASE_URL);
  if (!/^\d{6}$/.test(code) && !hash) throw new SyncAuthError("invalidCode");
  if (!validEmail(email) || getSyncStatus().transitioning) throw new SyncAuthError("failed");
  setSyncStatus({ transitioning: true });
  try {
    await running;
    const verifier = createAuthVerifier();
    const { data, error } = await verifier.auth.verifyOtp(hash
      ? { token_hash: hash, type: "email" }
      : { email: email.trim(), token: code, type: "email" });
    if (error) throw error;
    if (!data.session || data.session.user.email?.toLowerCase() !== email.trim().toLowerCase())
      throw new SyncAuthError("invalidCode");
    const accepted = await client.auth.setSession({
      access_token: data.session.access_token, refresh_token: data.session.refresh_token,
    });
    if (accepted.error) throw accepted.error;
    if (!accepted.data.session) throw new SyncAuthError("failed");
    setUser(accepted.data.session);
  } catch (error) {
    throw error instanceof SyncAuthError ? error : authError(error, true);
  } finally {
    setSyncStatus({ transitioning: false });
  }
  void requestSync();
}
export async function signInWithGoogle(): Promise<boolean> {
  const client = getSupabase();
  if (!client || getSyncStatus().transitioning) throw new SyncAuthError("failed");
  setSyncStatus({ transitioning: true, error: null });
  try {
    await running;
    const completed = await beginGoogleSignIn(client);
    if (completed) setUser(await currentSession(client));
    return completed;
  } catch (error) {
    throw authError(error, false);
  } finally {
    setSyncStatus({ transitioning: false });
    void requestSync();
  }
}

function setUser(session: Session | null) {
  if (!session) firstPullDone(); // nothing to pull while signed out
  const changed = getSyncStatus().user?.id !== session?.user.id;
  setSyncStatus({
    ready: true,
    user: session ? { id: session.user.id, email: session.user.email ?? "" } : null,
    ...(!session || changed ? { ledgerUserId: null, lastSyncedAt: null } : {}),
    ...(!session || changed ? { phase: "idle", error: null, decision: null } : {}),
  });
}

// --- Remote I/O -----------------------------------------------------------
async function remoteHasData(client: SupabaseClient, user: string) {
  const { data, error } = await client
    .from("sync_records")
    .select("id")
    .eq("user_id", user)
    .eq("deleted", false)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
// Every setting, or only the ones changed after `since`.
async function fetchMeta(client: SupabaseClient, user: string, since?: string | null): Promise<MetaRow[]> {
  let query = client
    .from("sync_meta")
    .select("key,data,client_updated_at,server_updated_at")
    .eq("user_id", user);
  if (since) query = query.or(`server_updated_at.gt."${since}"`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MetaRow[];
}
async function fetchPage(client: SupabaseClient, user: string, after: Cursor | null): Promise<RecordRow[]> {
  let query = client.from("sync_records").select(RECORD_COLUMNS).eq("user_id", user);
  if (after) query = query.or(afterCursor(after));
  const { data, error } = await query
    .order("server_updated_at", { ascending: true })
    .order("collection", { ascending: true })
    .order("id", { ascending: true })
    .limit(PAGE);
  if (error) throw error;
  return (data ?? []) as RecordRow[];
}

// --- Cycle steps ----------------------------------------------------------
async function push(client: SupabaseClient, user: string) {
  // A few rounds at most: changes made while pushing go out in the next one.
  for (let round = 0; round < 5; round++) {
    const { base, local } = await read();
    requireLedgerOwner(local, user);
    if (!base) return;
    const batches = buildPush(base, local.outbox);
    if (!batches.length) return;
    for (const batch of batches) {
      if (batch.records.length) {
        const { error } = await client
          .from("sync_records")
          .upsert(batch.records.map((row) => ({ ...row, user_id: user })), {
            onConflict: "user_id,collection,id",
          });
        if (error) throw error;
      }
      if (batch.meta.length) {
        const { error } = await client
          .from("sync_meta")
          .upsert(batch.meta.map((row) => ({ ...row, user_id: user })), {
            onConflict: "user_id,key",
          });
        if (error) throw error;
      }
      await syncTransact((_, current) => {
        requireLedgerOwner(current, user);
        return { patch: { removeOutbox: acknowledged(current.outbox, batch) }, result: undefined };
      });
    }
  }
}
async function pull(client: SupabaseClient, user: string, from: Cursor | null) {
  // Settings: all of them on a first pull, then only the recently changed.
  const { local: start } = await read();
  const since = from ? values(start).metaCursor : undefined;
  const meta = await fetchMeta(client, user, since && metaSince(since));
  let after = from;
  let first = true;
  for (;;) {
    const rows = await fetchPage(client, user, after);
    const pageMeta = first ? meta : [];
    first = false;
    const stop = await syncTransact((base, local) => {
      requireLedgerOwner(local, user);
      if (!base) return { result: true };
      const parked = json<RecordRow[]>(values(local).parked, []);
      const result = applyRemote(base, [...parked, ...rows], pageMeta, local.outbox);
      const cursor = later(json<Cursor | null>(values(local).cursor, null), lastCursor(rows, null));
      const next = onboardedIfData(result.state);
      const metaCursor = result.metaRejected
        ? values(local).metaCursor
        : latestMeta(pageMeta, values(local).metaCursor ?? null);
      return {
        state: result.changed || next !== result.state ? next : undefined,
        patch: {
          removeOutbox: result.superseded,
          outbox: result.outbox,
          values: {
            cursor: cursor ? JSON.stringify(cursor) : null,
            parked: result.parked.length ? JSON.stringify(result.parked.slice(-500)) : null,
            ...(metaCursor ? { metaCursor } : {}),
          },
        },
        result: false,
      };
    });
    if (stop || rows.length < PAGE) return;
    after = lastCursor(rows, after);
  }
}
// Receipt names attempted this session, so a missing cloud file isn't retried
// on every cycle.
const attempted = new Set<string>();
async function syncReceipts(client: SupabaseClient, user: string) {
  if (!receiptSyncSupported) return;
  const { base, local } = await read();
  requireLedgerOwner(local, user);
  if (!base) return;
  const cloud = new Set(json<string[]>(values(local).receipts, []));
  const plan = planReceipts(base, { cloud: [...cloud] }, receiptExists);
  for (const name of plan.upload.slice(0, 10))
    try {
      await uploadReceipt(client, user, name);
      cloud.add(name);
    } catch {
      // Retried on the next cycle.
    }
  for (const name of plan.download.filter((n) => !attempted.has(`${user}/${n}`)).slice(0, 10)) {
    attempted.add(`${user}/${name}`);
    try {
      await downloadReceipt(client, user, name);
      cloud.add(name);
    } catch {
      // Not in the cloud (yet); viewing the receipt tries again.
    }
  }
  if (plan.remove.length) {
    const { error } = await client.storage
      .from("receipts")
      .remove(plan.remove.map((name) => `${user}/${name}`));
    if (!error) for (const name of plan.remove) cloud.delete(name);
  }
  await patchOwned(user, { values: { receipts: JSON.stringify([...cloud]) } });
}

// --- First sync -----------------------------------------------------------
type Bootstrap = "push" | "pull" | "merge" | "replace";
async function bootstrap(client: SupabaseClient, user: string, mode: Bootstrap) {
  if (mode === "replace") {
    const meta = await fetchMeta(client, user);
    const rows: RecordRow[] = [];
    for (let after: Cursor | null = null; ; ) {
      const page = await fetchPage(client, user, after);
      rows.push(...page);
      if (page.length < PAGE) break;
      after = lastCursor(page, after);
    }
    const now = new Date().toISOString();
    const { local: previous } = await read();
    if (values(previous).userId && values(previous).userId !== user) {
      await Promise.allSettled([...receiptDownloads]);
      // Equal filenames in different accounts must never reuse the old photo.
      clearReceiptCache();
    }
    const replaced = await syncTransact((base) => {
      const fresh = keepDeviceSettings(emptyState(), base);
      const result = applyRemote(fresh, rows, meta, {});
      const state = parseState(onboardedIfData(result.state));
      const cursor = lastCursor(rows, null);
      return {
        state,
        patch: {
          clearOutbox: true,
          clearValues: true,
          outbox: result.outbox,
          values: {
            userId: user,
            bootstrapped: user,
            cursor: cursor ? JSON.stringify(cursor) : null,
            metaCursor: latestMeta(meta, null),
            parked: result.parked.length ? JSON.stringify(result.parked) : null,
            lastSyncedAt: now,
          },
        },
        result: state,
      };
    });
    // Photos of the replaced transactions are no longer referenced.
    sweepReceipts(replaced);
    setSyncStatus({ lastSyncedAt: now });
    await syncReceipts(client, user);
    return;
  }
  // Seed the outbox: a merge (or pull into an empty device) lets the cloud
  // copy win conflicts (epoch); uploading into an empty cloud uses now.
  const at = mode === "push" ? new Date().toISOString() : EPOCH;
  const { local: previous } = await read();
  if (values(previous).userId && values(previous).userId !== user) {
    await Promise.allSettled([...receiptDownloads]);
    clearReceiptCache();
  }
  await syncTransact((base, local) => {
    const switched = values(local).userId !== undefined && values(local).userId !== user;
    if (switched && base && localKind(base) === "data") throw new LedgerOwnerChangedError();
    const outbox = switched ? {} : local.outbox;
    return {
      patch: {
        clearOutbox: switched,
        clearValues: switched,
        outbox: base ? seedOutbox(base, outbox, at) : {},
        values: { userId: user },
      },
      result: undefined,
    };
  });
  await push(client, user);
  await pull(client, user, null);
  await patchOwned(user, { values: { bootstrapped: user } });
  await syncReceipts(client, user);
}

// --- Cycle ----------------------------------------------------------------
async function cycle(client: SupabaseClient, session: Session) {
  const user = session.user.id;
  const { base, local } = await read();
  if (!base) return; // the ledger hasn't loaded yet
  const v = values(local);
  // This check is local, so the existing owner can work during network outages.
  setSyncStatus({ ledgerUserId: v.userId === user && v.bootstrapped === user ? user : null });
  const needsBootstrap = v.bootstrapped !== user || v.userId !== user || base.settings.onboarded === false;
  if (needsBootstrap) {
    const kind = localKind(base);
    const remote = kind === "data" ? await remoteHasData(client, user) : false;
    const decision = decideFirstSync({ local: kind, remoteHasData: remote, previousUser: v.userId, user });
    if (decision === "switch" || decision === "merge")
      return setSyncStatus({ phase: "paused", decision: { kind: decision } });
    await bootstrap(client, user, decision);
  } else {
    await push(client, user);
    await pull(client, user, pullStart(json<Cursor | null>(v.cursor, null)));
    await syncReceipts(client, user);
  }
  const now = new Date().toISOString();
  await patchOwned(user, { values: { lastSyncedAt: now } });
  setSyncStatus({ phase: "idle", error: null, decision: null, lastSyncedAt: now });
  if (getSyncStatus().user?.id === user) setSyncStatus({ ledgerUserId: user });
}

let running: Promise<void> | null = null;
// What asked for sync: manual (Sync now, sign-in, launch) bypasses the
// backoff; outbox (local edits) never skips for the minimum gap.
export type SyncTrigger = "manual" | "outbox" | "focus" | "timer";
const strength: Record<SyncTrigger, number> = { timer: 0, focus: 0, outbox: 1, manual: 2 };
let pending: SyncTrigger | null = null;
// Focus/timer cycles shortly after a successful one only run with pending edits.
export const MIN_GAP_MS = 15_000;
let lastSuccess = 0;
// Automatic triggers wait after errors: 5 s doubling up to 5 min.
let failures = 0;
let retryAt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
export const backoffMs = (failures: number) =>
  failures ? Math.min(5_000 * 2 ** (failures - 1), 300_000) : 0;
// Resolves once this session's first cycle ended (whatever the outcome).
let firstPullDone: () => void = () => {};
const firstPull = new Promise<void>((resolve) => (firstPullDone = resolve));
// Everything in flight (cycles, first-sync answers, sign-out), for whenIdle().
let activity: Promise<unknown> = Promise.resolve();
function track<T>(work: Promise<T>): Promise<T> {
  activity = Promise.all([activity, work.catch(() => {})]);
  return work;
}
// Resolves once no sync work is in flight.
export async function whenIdle() {
  for (let last; last !== activity; ) await (last = activity);
}
// Resolves once this session's first sync cycle finished (or there is none:
// sync not configured, signed out). Capped so a stalled network never blocks.
export function whenFirstPull(timeoutMs = 30_000): Promise<void> {
  if (!syncConfigured || !getSupabase()) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    firstPull,
    new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs))),
  ]).finally(() => clearTimeout(timer));
}
// Runs a sync cycle now (or right after the one in progress). Never throws.
export function requestSync(trigger: SyncTrigger = "manual"): Promise<void> {
  if (getSyncStatus().transitioning) return Promise.resolve();
  if (trigger !== "manual" && Date.now() < retryAt) {
    // Local edits still go out once the backoff ends.
    if (trigger === "outbox" && !retryTimer)
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void requestSync("outbox");
      }, retryAt - Date.now());
    return Promise.resolve();
  }
  if (running) {
    if (!pending || strength[trigger] > strength[pending]) pending = trigger;
    return running;
  }
  const work = (async () => {
    await null; // `running` is set before the loop starts
    try {
      for (let next: SyncTrigger | null = trigger; next; ) {
        await runCycle(next);
        next = getSyncStatus().transitioning ? null : pending;
        pending = null;
      }
    } finally {
      // Same tick as the last `pending` check: no request is lost.
      running = null;
      pending = null;
    }
  })();
  running = track(work);
  return running;
}
async function runCycle(trigger: SyncTrigger) {
  try {
    if ((trigger === "focus" || trigger === "timer") && Date.now() - lastSuccess < MIN_GAP_MS) {
      const { local } = await read().catch(() => ({ local: null }));
      if (local && !Object.keys(local.outbox).length) return;
    }
    const client = getSupabase();
    if (!client) return;
    try {
      const session = await currentSession(client);
      setUser(session);
      if (!session) return;
      // A pending first-sync question is asked again (or dropped when no
      // longer needed, e.g. the sample data was removed meanwhile).
      setSyncStatus({ phase: "syncing" });
      await cycle(client, session);
    } catch (error) {
      if (error instanceof LedgerOwnerChangedError || errorCode(error) === "auth")
        setSyncStatus({ ledgerUserId: null });
      setSyncStatus({ phase: "error", error: errorCode(error) });
    }
    const { phase } = getSyncStatus();
    if (phase === "error") retryAt = Date.now() + backoffMs(++failures);
    else if (phase === "idle") {
      failures = 0;
      retryAt = 0;
      lastSuccess = Date.now();
    }
  } finally {
    firstPullDone();
  }
}

export type DecisionChoice = "merge" | "replace" | "cancel";
// Answers the pending first-sync question (SyncStatus.decision).
export function resolveDecision(choice: DecisionChoice) {
  return transition(() => decide(choice));
}
function transition(work: () => Promise<void>): Promise<void> {
  if (getSyncStatus().transitioning) return Promise.resolve();
  setSyncStatus({ transitioning: true });
  return track(work().catch((error) => {
    setSyncStatus({ phase: "error", error: errorCode(error) });
  }).finally(() => setSyncStatus({ transitioning: false })));
}
async function decide(choice: DecisionChoice) {
  const client = getSupabase();
  const decision = getSyncStatus().decision;
  if (!client || !decision) return;
  if (choice === "cancel") return leave("keep");
  if (choice === "merge" && decision.kind !== "merge") return;
  const session = await currentSession(client);
  if (!session) return setUser(null);
  if (session.user.id !== getSyncStatus().user?.id) {
    setUser(session);
    return;
  }
  const user = session.user.id;
  await running;
  setSyncStatus({ decision: null, phase: "syncing", error: null });
  try {
    await bootstrap(client, user, choice === "merge" ? "merge" : "replace");
    const now = new Date().toISOString();
    await patchOwned(user, { values: { lastSyncedAt: now } });
    setSyncStatus({ phase: "idle", lastSyncedAt: now });
    if (getSyncStatus().user?.id === user) setSyncStatus({ ledgerUserId: user });
  } catch (error) {
    setSyncStatus({ phase: "error", error: errorCode(error) });
  }
}

// keep: this device keeps its data (and resumes with the same account later).
// erase: this device's copy is erased (the cloud copy stays) -> onboarding.
export function signOut(mode: "keep" | "erase") {
  return transition(() => leave(mode));
}
async function leave(mode: "keep" | "erase") {
  const client = getSupabase();
  if (!client) return;
  await running;
  if (mode === "keep") {
    // Best effort: send what's pending before leaving.
    const session = await currentSession(client).catch(() => null);
    const { local } = await read();
    if (session && values(local).bootstrapped === session.user.id)
      await push(client, session.user.id).catch(() => {});
  }
  // Local scope: other devices stay signed in.
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw error;
  if (mode === "erase") await eraseDevice();
  setUser(null);
  setSyncStatus({ lastSyncedAt: mode === "erase" ? null : getSyncStatus().lastSyncedAt });
}
// Same as Settings -> erase: empty data with this device's preferences.
async function eraseDevice() {
  await Promise.allSettled([...receiptDownloads]);
  clearReceiptCache();
  await transact((base) => parseState(keepDeviceSettings(emptyState(), base)), {
    record: false,
  });
  await patch({ clearOutbox: true, clearValues: true });
  sweepReceipts({ transactions: [] });
}

// Settings -> erase while signed in: replaces this device's copy with `next`
// and forgets the sync progress (keeps the account link), in one write, so the
// next cycle downloads the whole cloud copy again instead of resuming.
export async function eraseLocalCopy(next: (base: FinanceState | null) => FinanceState) {
  const user = getSyncStatus().user?.id;
  const state = await syncTransact((base, local) => {
    if (user) requireLedgerOwner(local, user);
    const state = parseState(next(base));
    return {
      state,
      patch: {
        clearOutbox: true,
        values: { bootstrapped: null, cursor: null, metaCursor: null, parked: null },
      },
      result: state,
    };
  });
  void requestSync();
  return state;
}

// Permanently deletes the cloud account: receipt photos first (only the
// Storage API can remove them), then the user, whose sync rows cascade.
// keep: this device keeps its data, unlinked from any account.
// Resolves to null on success; on failure nothing on the device changes.
export function deleteAccount(mode: "keep" | "erase"): Promise<SyncErrorCode | null> {
  if (getSyncStatus().transitioning) return Promise.resolve("server");
  setSyncStatus({ transitioning: true });
  return track(removeAccount(mode).catch(errorCode).then((error) => {
    if (error) setSyncStatus({ phase: "error", error });
    return error;
  }).finally(() => setSyncStatus({ transitioning: false })));
}
async function removeAccount(mode: "keep" | "erase"): Promise<SyncErrorCode | null> {
  const client = getSupabase();
  if (!client) return "server";
  await running;
  try {
    const session = await currentSession(client);
    if (!session) return "auth";
    const user = session.user.id;
    const bucket = client.storage.from(RECEIPTS_BUCKET);
    for (;;) {
      const { data: files, error } = await bucket.list(user, { limit: PAGE });
      if (error) throw error;
      if (!files?.length) break;
      const { data: removed, error: removeError } = await bucket.remove(
        files.map((file) => `${user}/${file.name}`),
      );
      if (removeError) throw removeError;
      if (!removed?.length) throw new Error("Receipts could not be removed");
    }
    const { error } = await client.rpc("delete_account");
    if (error) throw error;
    await client.auth.signOut({ scope: "local" }).catch(() => {});
  } catch (error) {
    return errorCode(error);
  }
  if (mode === "erase") await eraseDevice();
  // Retained data must never become unowned and upload to a new account.
  else {
    const { local } = await read();
    await patch({ clearOutbox: true, clearValues: true, values: { userId: values(local).userId ?? null } });
  }
  setUser(null);
  setSyncStatus({ lastSyncedAt: null });
  return null;
}

// Loads the persisted status and follows auth changes. Returns a cleanup.
export function startSync(): () => void {
  const client = getSupabase();
  if (!client) return () => {};
  void read()
    .then(({ local }) => setSyncStatus({ lastSyncedAt: values(local).lastSyncedAt ?? null }))
    .catch(() => {});
  let completingGoogle = hasGoogleCallback();
  if (completingGoogle) {
    setSyncStatus({ transitioning: true });
    void finishGoogleSignIn(client)
      .then(async () => {
        setUser(await currentSession(client));
        completingGoogle = false;
        setSyncStatus({ transitioning: false });
        void requestSync();
      })
      .catch(() => {
        completingGoogle = false;
        setSyncStatus({ ready: true, transitioning: false, error: "auth", ledgerUserId: null });
      });
  }
  const { data } = client.auth.onAuthStateChange((event, session) => {
    // Don't await other Supabase calls inside the callback (it runs while
    // auth holds its lock); continue after it returns.
    void Promise.resolve().then(() => {
      if (completingGoogle) return;
      setUser(session);
      if (session && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) void requestSync();
    });
  });
  return () => data.subscription.unsubscribe();
}

// Background task (native): one bounded cycle when signed in.
export async function backgroundSync(timeoutMs = 25_000) {
  const client = getSupabase();
  if (!client) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    requestSync(),
    new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs))),
  ]);
  clearTimeout(timer);
}

// Lazy receipt download when viewing one (native), or a signed URL (web).
export function fetchReceipt(name: string): Promise<{ downloaded?: boolean; url?: string }> {
  if (!canAccessLedger()) return Promise.resolve({});
  const work = loadReceipt(name).finally(() => receiptDownloads.delete(work));
  receiptDownloads.add(work);
  return work;
}
async function loadReceipt(name: string): Promise<{ downloaded?: boolean; url?: string }> {
  const client = getSupabase();
  if (!client) return {};
  const session = await currentSession(client).catch(() => null);
  if (!session) return {};
  const user = session.user.id;
  if (user !== getSyncStatus().user?.id || !canAccessLedger()) return {};
  if (!receiptSyncSupported) return { url: await receiptUrl(client, user, name).catch(() => undefined) };
  try {
    await downloadReceipt(client, user, name);
    const { local } = await read();
    const cloud = new Set(json<string[]>(values(local).receipts, []));
    cloud.add(name);
    await patchOwned(user, { values: { receipts: JSON.stringify([...cloud]) } });
    return { downloaded: true };
  } catch {
    return {};
  }
}
