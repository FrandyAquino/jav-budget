// Harness for the Supabase integration tests (__tests__/integration/sync.test.ts).
// Each "device" runs the REAL sync engine (src/features/sync/engine.ts + core.ts)
// in its own Jest module registry, with:
// - its own @supabase/supabase-js client (real network, in-memory session),
// - its own in-memory ledger + sync outbox (same contract as the native
//   SQLite backend and __mocks__/finance-backend.ts),
// - its own in-memory expo-file-system (receipt photos).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FinanceState } from "@/features/finance/model";
import type { SyncLocal, SyncWork, TransactOptions } from "@/features/finance/storage/shared";

// --- Configuration ----------------------------------------------------------
// Values come from the environment or the gitignored
// __tests__/integration/credentials.local.json ({ "SUPABASE_IT_URL": ..., ... }).
// Not a root .env* file: Expo CLI would load it into the app bundle.
function loadCredentials() {
  let values: Record<string, unknown>;
  try {
    values = jest.requireActual<Record<string, unknown>>("./credentials.local.json");
  } catch {
    return; // no local file: the environment must provide the values
  }
  for (const [key, value] of Object.entries(values))
    if (/^SUPABASE_IT_[A-Z0-9_]+$/.test(key) && typeof value === "string" && process.env[key] === undefined)
      process.env[key] = value;
}
loadCredentials();

export const IT = {
  url: process.env.SUPABASE_IT_URL ?? "",
  key: process.env.SUPABASE_IT_KEY ?? "",
  emailA: process.env.SUPABASE_IT_EMAIL_A ?? "",
  emailB: process.env.SUPABASE_IT_EMAIL_B ?? "",
  password: process.env.SUPABASE_IT_PASSWORD ?? "",
};
export const enabled =
  process.env.SUPABASE_IT === "1" && Object.values(IT).every((value) => value.length > 0);

// Node's fetch, saved by ./environment.js before Expo's stub replaced it.
const nodeFetch = (globalThis as { __nodeFetch?: typeof fetch }).__nodeFetch;
function realFetch(): typeof fetch {
  if (!nodeFetch) throw new Error("Run with @jest-environment ./__tests__/integration/environment.js");
  return nodeFetch;
}

let clients = 0;
export function newClient(): SupabaseClient {
  return createClient(IT.url, IT.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `jav-budget-it-${++clients}`,
    },
    global: { fetch: realFetch() },
  });
}
export async function signIn(client: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await client.auth.signInWithPassword({ email, password: IT.password });
  if (error || !data.user) throw error ?? new Error(`Sign-in failed for ${email}`);
  return data.user.id;
}

// --- Server helpers (run as the user, under RLS) ------------------------------
export type ServerRecord = {
  user_id: string;
  collection: string;
  id: string;
  data: unknown;
  position: number;
  deleted: boolean;
  client_updated_at: string;
  server_updated_at: string;
};
export type ServerMeta = { user_id: string; key: string; data: unknown; client_updated_at: string };

export async function serverRecords(client: SupabaseClient, user?: string): Promise<ServerRecord[]> {
  const rows: ServerRecord[] = [];
  for (let from = 0; ; from += 1000) {
    let query = client.from("sync_records").select("*");
    if (user) query = query.eq("user_id", user);
    const { data, error } = await query
      .order("collection")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as ServerRecord[]));
    if ((data ?? []).length < 1000) return rows;
  }
}
export async function serverMeta(client: SupabaseClient, user?: string): Promise<ServerMeta[]> {
  let query = client.from("sync_meta").select("*");
  if (user) query = query.eq("user_id", user);
  const { data, error } = await query.order("key");
  if (error) throw error;
  return (data ?? []) as ServerMeta[];
}
export async function serverReceipts(client: SupabaseClient, user: string): Promise<string[]> {
  const { data, error } = await client.storage.from("receipts").list(user, { limit: 1000 });
  if (error) throw error;
  return (data ?? []).map((object) => object.name).filter((name) => name !== ".emptyFolderPlaceholder");
}
// Deletes everything the user has in the cloud (allowed by the RLS policies).
export async function wipeUser(client: SupabaseClient, user: string) {
  for (const table of ["sync_records", "sync_meta"] as const) {
    const { error } = await client.from(table).delete().eq("user_id", user);
    if (error) throw error;
  }
  const names = await serverReceipts(client, user);
  if (names.length) {
    const { error } = await client.storage.from("receipts").remove(names.map((name) => `${user}/${name}`));
    if (error) throw error;
  }
}

// --- In-memory device storage -----------------------------------------------
const LEDGER = "ledger";
const SYNC = "sync";
// Module factory for @/features/finance/storage/backend inside a device's
// registry: one serialized JSON ledger plus the sync outbox/values document,
// recording local changes exactly like the native/web backends.
function memoryBackend(store: Map<string, string>) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { parseState } = require("@/features/finance/schema") as typeof import("@/features/finance/schema");
  const shared = require("@/features/finance/storage/shared") as typeof import("@/features/finance/storage/shared");
  const { syncChanges } = require("@/features/sync/core") as typeof import("@/features/sync/core");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const listeners = new Set<(state: FinanceState) => void>();
  const readLocal = (): SyncLocal => {
    const parsed = JSON.parse(store.get(SYNC) ?? "{}") as Partial<SyncLocal>;
    return { outbox: { ...parsed.outbox }, values: { ...parsed.values } };
  };
  const readBase = () => {
    const raw = store.get(LEDGER);
    return { raw, base: raw ? parseState(JSON.parse(raw)) : null };
  };
  return {
    transact<R extends FinanceState | null>(change: (base: FinanceState | null) => R, options: TransactOptions = {}) {
      return shared.serialize(async () => {
        const { raw, base } = readBase();
        const result = change(base);
        if (!result) return result;
        const data = JSON.stringify(result);
        if (data === raw) return result;
        store.set(LEDGER, data);
        const keys = options.record === false ? [] : syncChanges(base, result);
        if (keys.length) {
          const at = new Date().toISOString();
          store.set(
            SYNC,
            JSON.stringify(shared.patchSyncLocal(readLocal(), { outbox: Object.fromEntries(keys.map((k) => [k, at])) })),
          );
        }
        for (const listener of listeners) listener(result);
        if (keys.length) shared.notifyOutbox();
        return result;
      });
    },
    syncTransact<R>(work: (base: FinanceState | null, local: SyncLocal) => SyncWork<R>) {
      return shared.serialize(async () => {
        const { raw, base } = readBase();
        const local = readLocal();
        const output = work(base, local);
        if (output.state && JSON.stringify(output.state) !== raw) {
          store.set(LEDGER, JSON.stringify(output.state));
          for (const listener of listeners) listener(output.state);
        }
        if (output.patch) store.set(SYNC, JSON.stringify(shared.patchSyncLocal(local, output.patch)));
        return output.result;
      });
    },
    subscribe(listener: (state: FinanceState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    discardUnreadableData: async () => {},
  };
}

// Module factory for expo-file-system: files are byte arrays keyed by URI.
const DOCUMENTS = "file:///device/Documents/";
function memoryFileSystem(files: Map<string, Uint8Array>) {
  const dirs = new Set<string>([DOCUMENTS]);
  type Part = string | { uri: string };
  const resolve = (parts: Part[]) =>
    parts
      .map((part) => (typeof part === "string" ? part : part.uri))
      .reduce((base, part) => (base ? `${base.replace(/\/$/, "")}/${part.replace(/^\//, "")}` : part), "");
  class Directory {
    readonly uri: string;
    constructor(...parts: Part[]) {
      this.uri = `${resolve(parts).replace(/\/$/, "")}/`;
    }
    get exists() {
      return dirs.has(this.uri) || [...files.keys()].some((uri) => uri.startsWith(this.uri));
    }
    create() {
      dirs.add(this.uri);
    }
    list() {
      return [...files.keys()]
        .filter((uri) => uri.startsWith(this.uri) && !uri.slice(this.uri.length).includes("/"))
        .map((uri) => new File(uri));
    }
  }
  class File {
    readonly uri: string;
    constructor(...parts: Part[]) {
      this.uri = resolve(parts);
    }
    get name() {
      return this.uri.split("/").pop() ?? "";
    }
    get extension() {
      const match = /\.[^./]+$/.exec(this.name);
      return match ? match[0] : "";
    }
    get exists() {
      return files.has(this.uri);
    }
    async arrayBuffer() {
      const bytes = files.get(this.uri);
      if (!bytes) throw new Error(`No such file: ${this.uri}`);
      return bytes.slice().buffer;
    }
    write(bytes: Uint8Array) {
      files.set(this.uri, bytes);
    }
    delete() {
      files.delete(this.uri);
    }
    async copy(target: File) {
      files.set(target.uri, files.get(this.uri)!.slice());
    }
    static async downloadFileAsync(url: string, to: File) {
      const response = await realFetch()(url);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      files.set(to.uri, new Uint8Array(await response.arrayBuffer()));
      return to;
    }
  }
  return { Directory, File, Paths: { document: new Directory(DOCUMENTS), cache: new Directory("file:///device/Caches/") } };
}
export const receiptUri = (name: string) => `${DOCUMENTS}receipts/${name}`;

// --- Devices ------------------------------------------------------------------
type Engine = typeof import("@/features/sync/engine");
type Status = typeof import("@/features/sync/status");
type Backend = ReturnType<typeof memoryBackend>;
export type Device = {
  label: string;
  client: SupabaseClient;
  engine: Engine;
  status: Status;
  backend: Backend;
  files: Map<string, Uint8Array>;
  state(): FinanceState | null;
  local(): SyncLocal;
  // Stores a ledger as if it had been saved earlier (nothing in the outbox).
  seed(state: FinanceState): void;
  // A local change, recorded in the outbox like an edit in the app.
  edit(change: (state: FinanceState) => FinanceState): Promise<FinanceState>;
  signIn(email: string): Promise<string>;
  // One sync cycle; resolves when every sync task of this device is done.
  sync(): Promise<void>;
};

export function createDevice(label: string): Device {
  const client = newClient();
  const store = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  let modules: { engine: Engine; status: Status; backend: Backend } | undefined;
  jest.isolateModules(() => {
    jest.doMock("@/features/sync/config", () => ({
      SUPABASE_URL: IT.url,
      SUPABASE_KEY: IT.key,
      syncConfigured: true,
      RECEIPTS_BUCKET: "receipts",
    }));
    jest.doMock("@/features/sync/supabase", () => ({ getSupabase: () => client }));
    jest.doMock("@/features/finance/storage/backend", () => memoryBackend(store));
    jest.doMock("expo-file-system", () => memoryFileSystem(files));
    /* eslint-disable @typescript-eslint/no-require-imports */
    modules = {
      engine: require("@/features/sync/engine"),
      status: require("@/features/sync/status"),
      backend: require("@/features/finance/storage/backend"),
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  const { engine, status, backend } = modules!;
  const device: Device = {
    label,
    client,
    engine,
    status,
    backend,
    files,
    state: () => {
      const raw = store.get(LEDGER);
      return raw ? (JSON.parse(raw) as FinanceState) : null;
    },
    local: () => {
      const parsed = JSON.parse(store.get(SYNC) ?? "{}") as Partial<SyncLocal>;
      return { outbox: { ...parsed.outbox }, values: { ...parsed.values } };
    },
    seed: (state) => {
      store.set(LEDGER, JSON.stringify(state));
    },
    edit: (change) =>
      backend.transact((base) => {
        if (!base) throw new Error(`${label} has no ledger`);
        return change(base);
      }),
    signIn: (email) => signIn(client, email),
    async sync() {
      await engine.requestSync();
      await engine.whenIdle();
      const { phase, error } = status.getSyncStatus();
      if (phase === "error") throw new Error(`${label}: sync failed (${error})`);
    },
  };
  return device;
}
