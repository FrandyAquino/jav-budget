// Sync orchestration: auth (email OTP), push/pull cycles, the first sign-in
// merge, receipts and sign-out. The rules live in ./core (pure, unit-tested);
// this module does the I/O. Every run is serialized and never blocks the UI.
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isAuthApiError } from "@supabase/supabase-js";
import { emptyState, type FinanceState } from "@/features/finance/model";
import { parseState } from "@/features/finance/schema";
import { syncTransact, transact } from "@/features/finance/storage/backend";
import type { SyncLocal, SyncPatch } from "@/features/finance/storage/shared";
import { hasRealData } from "@/features/backup/policy";
import { sweepReceipts } from "@/features/transactions/receipts";
import {
  acknowledged,
  afterCursor,
  applyRemote,
  buildPush,
  decideFirstSync,
  EPOCH,
  keepDeviceSettings,
  lastCursor,
  localKind,
  planReceipts,
  pullStart,
  seedOutbox,
  type Cursor,
  type MetaRow,
  type RecordRow,
} from "./core";
import { getSupabase } from "./supabase";
import {
  downloadReceipt,
  receiptExists,
  receiptSyncSupported,
  receiptUrl,
  uploadReceipt,
} from "./receipt-files";
import { getSyncStatus, setSyncStatus, type SyncErrorCode } from "./status";

const PAGE = 1000;
const RECORD_COLUMNS = "collection,id,data,position,deleted,client_updated_at,server_updated_at";

// Persisted values (SyncLocal.values).
type Values = {
  userId?: string; // account this device's data belongs to
  bootstrapped?: string; // user id whose first sync finished
  keepDemo?: string; // user id that chose to keep the demo (sync paused)
  cursor?: string; // JSON Cursor
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

async function currentSession(client: SupabaseClient): Promise<Session | null> {
  const { data } = await client.auth.getSession();
  return data.session;
}
function errorCode(error: unknown): SyncErrorCode {
  if (isAuthApiError(error) || (error as { status?: number })?.status === 401) return "auth";
  const message = String((error as Error)?.message ?? error);
  return /network|fetch|offline|timed? ?out/i.test(message) ? "offline" : "server";
}
const later = (a: Cursor | null, b: Cursor | null) => {
  if (!a || !b) return a ?? b;
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (ta !== tb) return ta > tb ? a : b;
  return `${a.collection}/${a.id}` >= `${b.collection}/${b.id}` ? a : b;
};
// Leaves the onboarding once the cloud brought real data.
const onboardedIfData = (state: FinanceState) =>
  state.settings.onboarded === false && hasRealData(state)
    ? { ...state, settings: { ...state.settings, onboarded: true } }
    : state;

// --- Auth ----------------------------------------------------------------
export type AuthErrorCode = "invalidEmail" | "invalidCode" | "rateLimited" | "offline" | "failed";
export class SyncAuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
  }
}
function authError(error: unknown, verifying: boolean): SyncAuthError {
  const code = (error as { code?: string })?.code ?? "";
  const status = (error as { status?: number })?.status;
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
  if (!/^\d{6}$/.test(token.trim())) throw new SyncAuthError("invalidCode");
  let session: Session | null = null;
  try {
    const { data, error } = await client.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: "email",
    });
    if (error) throw error;
    session = data.session;
  } catch (error) {
    throw error instanceof SyncAuthError ? error : authError(error, true);
  }
  if (session) setUser(session);
  void requestSync();
}
function setUser(session: Session | null) {
  setSyncStatus({
    ready: true,
    user: session ? { id: session.user.id, email: session.user.email ?? "" } : null,
    ...(session ? {} : { phase: "idle", error: null, decision: null }),
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
async function fetchMeta(client: SupabaseClient, user: string): Promise<MetaRow[]> {
  const { data, error } = await client
    .from("sync_meta")
    .select("key,data,client_updated_at,server_updated_at")
    .eq("user_id", user);
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
    if (!base || base.demo) return;
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
      await syncTransact((_, current) => ({
        patch: { removeOutbox: acknowledged(current.outbox, batch) },
        result: undefined,
      }));
    }
  }
}
async function pull(client: SupabaseClient, user: string, from: Cursor | null) {
  const meta = await fetchMeta(client, user);
  let after = from;
  let first = true;
  for (;;) {
    const rows = await fetchPage(client, user, after);
    const pageMeta = first ? meta : [];
    first = false;
    const stop = await syncTransact((base, local) => {
      if (!base || base.demo) return { result: true };
      const parked = json<RecordRow[]>(values(local).parked, []);
      const result = applyRemote(base, [...parked, ...rows], pageMeta, local.outbox);
      const cursor = later(json<Cursor | null>(values(local).cursor, null), lastCursor(rows, null));
      const next = onboardedIfData(result.state);
      return {
        state: result.changed || next !== result.state ? next : undefined,
        patch: {
          removeOutbox: result.superseded,
          values: {
            cursor: cursor ? JSON.stringify(cursor) : null,
            parked: result.parked.length ? JSON.stringify(result.parked.slice(-500)) : null,
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
  if (!base || base.demo) return;
  const cloud = new Set(json<string[]>(values(local).receipts, []));
  const plan = planReceipts(base, { cloud: [...cloud] }, receiptExists);
  for (const name of plan.upload.slice(0, 10))
    try {
      await uploadReceipt(client, user, name);
      cloud.add(name);
    } catch {
      // Retried on the next cycle.
    }
  for (const name of plan.download.filter((n) => !attempted.has(n)).slice(0, 10)) {
    attempted.add(name);
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
  await patch({ values: { receipts: JSON.stringify([...cloud]) } });
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
          values: {
            userId: user,
            bootstrapped: user,
            cursor: cursor ? JSON.stringify(cursor) : null,
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
  await syncTransact((base, local) => {
    const switched = values(local).userId !== undefined && values(local).userId !== user;
    const outbox = switched ? {} : local.outbox;
    return {
      patch: {
        clearOutbox: switched,
        clearValues: switched,
        outbox: base ? seedOutbox(base, outbox, at) : {},
        values: { userId: user, keepDemo: null },
      },
      result: undefined,
    };
  });
  await push(client, user);
  await pull(client, user, null);
  await patch({ values: { bootstrapped: user } });
  await syncReceipts(client, user);
}

// --- Cycle ----------------------------------------------------------------
async function cycle(client: SupabaseClient, session: Session) {
  const user = session.user.id;
  const { base, local } = await read();
  if (!base) return; // the ledger hasn't loaded yet
  const v = values(local);
  if (base.demo) {
    // Sample data never syncs; leaving it re-runs the first sync.
    if (v.bootstrapped === user) await patch({ values: { bootstrapped: null, cursor: null, parked: null } });
    if (v.keepDemo === user) return setSyncStatus({ phase: "paused", decision: null });
    const remote = await remoteHasData(client, user);
    return setSyncStatus({ phase: "paused", decision: { kind: "demo", remoteHasData: remote } });
  }
  const needsBootstrap = v.bootstrapped !== user || v.userId !== user || base.settings.onboarded === false;
  if (needsBootstrap) {
    const kind = localKind(base);
    const remote = kind === "data" ? await remoteHasData(client, user) : false;
    const decision = decideFirstSync({ local: kind, remoteHasData: remote, previousUser: v.userId, user });
    if (decision === "switch" || decision === "merge")
      return setSyncStatus({ phase: "paused", decision: { kind: decision } });
    if (decision !== "demo") await bootstrap(client, user, decision);
  } else {
    await push(client, user);
    await pull(client, user, pullStart(json<Cursor | null>(v.cursor, null)));
    await syncReceipts(client, user);
  }
  const now = new Date().toISOString();
  await patch({ values: { lastSyncedAt: now } });
  setSyncStatus({ phase: "idle", error: null, decision: null, lastSyncedAt: now });
}

let running: Promise<void> | null = null;
let again = false;
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
// Runs a sync cycle now (or right after the one in progress). Never throws.
export function requestSync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = track((async () => {
    do {
      again = false;
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
        setSyncStatus({ phase: "error", error: errorCode(error) });
      }
    } while (again);
  })()).finally(() => {
    running = null;
  });
  return running;
}

export type DecisionChoice = "merge" | "replace" | "keepDemo" | "cancel";
// Answers the pending first-sync question (SyncStatus.decision).
export function resolveDecision(choice: DecisionChoice) {
  return track(decide(choice));
}
async function decide(choice: DecisionChoice) {
  const client = getSupabase();
  const decision = getSyncStatus().decision;
  if (!client || !decision) return;
  if (choice === "cancel") return signOut("keep");
  const session = await currentSession(client);
  if (!session) return setUser(null);
  const user = session.user.id;
  if (choice === "keepDemo") {
    await patch({ values: { keepDemo: user } });
    return setSyncStatus({ decision: null, phase: "paused" });
  }
  await running;
  setSyncStatus({ decision: null, phase: "syncing", error: null });
  try {
    await bootstrap(client, user, choice === "merge" ? "merge" : "replace");
    const now = new Date().toISOString();
    await patch({ values: { lastSyncedAt: now } });
    setSyncStatus({ phase: "idle", lastSyncedAt: now });
  } catch (error) {
    setSyncStatus({ phase: "error", error: errorCode(error) });
  }
}

// keep: this device keeps its data (and resumes with the same account later).
// erase: this device's copy is erased (the cloud copy stays) -> onboarding.
export function signOut(mode: "keep" | "erase") {
  return track(leave(mode));
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
  await client.auth.signOut({ scope: "local" }).catch(() => {});
  if (mode === "erase") {
    // Same as Settings -> erase: empty data with this device's preferences.
    await transact((base) => parseState(keepDeviceSettings(emptyState(), base)), {
      record: false,
    });
    await patch({ clearOutbox: true, clearValues: true });
    sweepReceipts({ transactions: [] });
  }
  setUser(null);
  setSyncStatus({ lastSyncedAt: mode === "erase" ? null : getSyncStatus().lastSyncedAt });
}

// Loads the persisted status and follows auth changes. Returns a cleanup.
export function startSync(): () => void {
  const client = getSupabase();
  if (!client) return () => {};
  void read()
    .then(({ local }) => setSyncStatus({ lastSyncedAt: values(local).lastSyncedAt ?? null }))
    .catch(() => {});
  const { data } = client.auth.onAuthStateChange((event, session) => {
    // Don't await other Supabase calls inside the callback (it runs while
    // auth holds its lock); continue after it returns.
    void Promise.resolve().then(() => {
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
export async function fetchReceipt(name: string): Promise<{ downloaded?: boolean; url?: string }> {
  const client = getSupabase();
  if (!client) return {};
  const session = await currentSession(client).catch(() => null);
  if (!session) return {};
  const user = session.user.id;
  if (!receiptSyncSupported) return { url: await receiptUrl(client, user, name).catch(() => undefined) };
  try {
    await downloadReceipt(client, user, name);
    const { local } = await read();
    const cloud = new Set(json<string[]>(values(local).receipts, []));
    cloud.add(name);
    await patch({ values: { receipts: JSON.stringify([...cloud]) } });
    return { downloaded: true };
  } catch {
    return {};
  }
}
