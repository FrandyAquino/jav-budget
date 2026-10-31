// Pure cloud-sync rules: what syncs, change tracking (outbox), push batches,
// applying pulled rows with last-write-wins, the first sign-in decision and
// receipt planning. React/Supabase-free so node tests import it directly.
import { hasRealData } from "../backup/policy.ts";
import { parseState } from "../finance/schema.ts";
import type { FinanceState, Settings } from "../finance/types.ts";
import { referencedReceipts } from "../transactions/receipt-names.ts";
import {
  diffState,
  emptySnapshot,
  type Snapshot,
  type StateDiff,
} from "../finance/storage/diff.ts";

// The user's data. Order matters when applying pulled rows one by one:
// referenced records (accounts, categories) come before the records using them.
export const SYNCED_COLLECTIONS = [
  "accounts",
  "categories",
  "goals",
  "budgets",
  "monthlyBudgets",
  "recurring",
  "transactions",
] as const;
export type SyncedCollection = (typeof SYNCED_COLLECTIONS)[number];
// Preferences shared by every device of the account (one sync_meta row each).
export const SHARED_SETTINGS = [
  "name",
  "email",
  "currency",
  "numberEntry",
  "exchangeRate",
  "budgetPeriod",
  "primaryAccountId",
] as const satisfies readonly (keyof Settings)[];
export type SharedSetting = (typeof SHARED_SETTINGS)[number];
// Never uploaded nor applied from the cloud: they describe this device
// (app lock, reminders, icon, theme, language, backups) or are local
// bookkeeping (onboarding, migration markers).
export const DEVICE_LOCAL_SETTINGS = [
  "biometrics",
  "notifications",
  "appIcon",
  "appearance",
  "language",
  "autoBackup",
  "lastExportAt",
  "onboarded",
] as const satisfies readonly (keyof Settings)[];

const collections = new Set<string>(SYNCED_COLLECTIONS);
const shared = new Set<string>(SHARED_SETTINGS);
export const isSyncedCollection = (key: string): key is SyncedCollection =>
  collections.has(key);
export const metaKey = (field: SharedSetting) => `settings_${field}`;
const metaField = (key: string): SharedSetting | undefined => {
  const field = key.startsWith("settings_") ? key.slice(9) : "";
  return shared.has(field) ? (field as SharedSetting) : undefined;
};

// Outbox: one entry per changed record / shared setting, valued with the
// client time of its latest local change. The data itself is read from the
// current state when pushing (a missing record becomes a tombstone).
export type Outbox = Record<string, string>;
export const recordKey = (collection: string, id: string) =>
  `r/${collection}/${id}`;
export const settingKey = (field: SharedSetting) => `m/${metaKey(field)}`;
export type ParsedKey =
  | { kind: "record"; collection: SyncedCollection; id: string }
  | { kind: "meta"; key: string; field: SharedSetting };
export function parseKey(key: string): ParsedKey | undefined {
  if (key.startsWith("m/")) {
    const field = metaField(key.slice(2));
    return field ? { kind: "meta", key: key.slice(2), field } : undefined;
  }
  const match = /^r\/([A-Za-z][A-Za-z0-9_]*)\/(.+)$/.exec(key);
  if (!match || !isSyncedCollection(match[1])) return;
  return { kind: "record", collection: match[1], id: match[2] };
}
// Synced data changes between two stored snapshots. `diff` is what the storage
// layer computed (upserts also include position-only moves, which don't sync).
export function changesFromDiff(
  diff: StateDiff,
  prevSnapshot: Snapshot,
  prev: FinanceState | null,
  next: FinanceState,
): string[] {
  // Nothing before (first launch, legacy migration): nothing was changed by
  // the user here. The first sign-in uploads existing data explicitly.
  if (!prev) return [];
  // An unfinished onboarding is never uploaded.
  if (next.settings.onboarded === false) return [];
  // Finishing onboarding: everything in `next` is new.
  if (prev.settings.onboarded === false) return allKeys(next);
  const keys: string[] = [];
  for (const row of diff.upserts)
    if (
      isSyncedCollection(row.collection) &&
      prevSnapshot.collections.get(row.collection)?.get(row.id)?.data !==
        row.data
    )
      keys.push(recordKey(row.collection, row.id));
  for (const row of diff.deletes)
    if (isSyncedCollection(row.collection))
      keys.push(recordKey(row.collection, row.id));
  for (const collection of diff.dropped)
    if (isSyncedCollection(collection))
      for (const id of prevSnapshot.collections.get(collection)?.keys() ?? [])
        keys.push(recordKey(collection, id));
  if (diff.meta.some((m) => m.key === "settings"))
    for (const field of SHARED_SETTINGS)
      if (
        JSON.stringify(prev.settings[field]) !==
        JSON.stringify(next.settings[field])
      )
        keys.push(settingKey(field));
  return keys;
}
// Same as changesFromDiff for storage that keeps whole documents (web).
export function syncChanges(
  prev: FinanceState | null,
  next: FinanceState,
): string[] {
  if (!prev) return [];
  const before = diffState(emptySnapshot(), prev).snapshot;
  return changesFromDiff(diffState(before, next).diff, before, prev, next);
}
// Every synced record and shared setting of a state.
export function allKeys(state: FinanceState): string[] {
  const keys: string[] = [];
  for (const collection of SYNCED_COLLECTIONS)
    for (const row of state[collection]) keys.push(recordKey(collection, row.id));
  for (const field of SHARED_SETTINGS) keys.push(settingKey(field));
  return keys;
}
export function recordChanges(outbox: Outbox, keys: string[], at: string) {
  const set: Outbox = {};
  for (const key of keys) set[key] = at;
  return { ...outbox, ...set };
}
// Before a first sync: everything local that has no pending change yet gets
// `at` (the epoch for a merge, so the cloud copy wins any conflict). On a
// merge or pull, pending shared settings are forced to the epoch too: they are
// this device's defaults, stamped when onboarding finished, and must not
// overwrite the account's profile.
export function seedOutbox(state: FinanceState, outbox: Outbox, at: string) {
  const set: Outbox = {};
  for (const key of allKeys(state))
    if (!outbox[key] || (at === EPOCH && key.startsWith("m/"))) set[key] = at;
  return set;
}
export const EPOCH = new Date(0).toISOString();

// Rows as stored in public.sync_records / public.sync_meta.
export type RecordRow = {
  collection: string;
  id: string;
  data: unknown;
  position: number;
  deleted: boolean;
  client_updated_at: string;
  server_updated_at?: string;
};
export type MetaRow = {
  key: string;
  data: unknown;
  client_updated_at: string;
  server_updated_at?: string;
};
export type PushBatch = {
  records: RecordRow[];
  meta: MetaRow[];
  // Outbox entries this batch acknowledges (key -> the `at` that was sent).
  sent: Outbox;
  // Entries that can't sync (unknown keys); removed with the acknowledgement.
  invalid: string[];
};
// Splits the outbox into batches of at most `size` rows.
// Below the 64 KB jsonb limit of sync_records.data.
export const MAX_ROW_CHARS = 60_000;
export function buildPush(
  state: FinanceState,
  outbox: Outbox,
  size = 500,
): PushBatch[] {
  const batches: PushBatch[] = [];
  let batch: PushBatch = { records: [], meta: [], sent: {}, invalid: [] };
  const index = new Map<string, Map<string, number>>();
  const positions = (collection: SyncedCollection) => {
    let map = index.get(collection);
    if (!map) {
      map = new Map(state[collection].map((row, i) => [row.id, i]));
      index.set(collection, map);
    }
    return map;
  };
  const entries = Object.entries(outbox).sort(([, a], [, b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  for (const [key, at] of entries) {
    const parsed = parseKey(key);
    if (!parsed) {
      batch.invalid.push(key);
      continue;
    }
    if (parsed.kind === "meta") {
      const value = state.settings[parsed.field];
      batch.meta.push({
        key: parsed.key,
        data: value === undefined ? null : value,
        client_updated_at: at,
      });
    } else {
      const i = positions(parsed.collection).get(parsed.id);
      const row = i === undefined ? undefined : state[parsed.collection][i];
      // The server refuses oversized rows; one must not block every other change.
      if (row && JSON.stringify(row).length > MAX_ROW_CHARS) {
        batch.invalid.push(key);
        continue;
      }
      batch.records.push({
        collection: parsed.collection,
        id: parsed.id,
        data: row ?? null,
        position: i ?? 0,
        deleted: !row,
        client_updated_at: at,
      });
    }
    batch.sent[key] = at;
    if (batch.records.length + batch.meta.length >= size) {
      batches.push(batch);
      batch = { records: [], meta: [], sent: {}, invalid: [] };
    }
  }
  if (batch.records.length || batch.meta.length || batch.invalid.length)
    batches.push(batch);
  return batches;
}
// Keys to remove after a batch was stored: only entries not changed again
// while the request was in flight.
export function acknowledged(outbox: Outbox, batch: PushBatch): string[] {
  return [
    ...Object.entries(batch.sent)
      .filter(([key, at]) => outbox[key] === at)
      .map(([key]) => key),
    ...batch.invalid,
  ];
}

// Key-order independent JSON (jsonb and the schema parser reorder keys).
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
// Postgres timestamps ("2026-10-30 16:16:42.466225+00") as ms-precision ISO:
// Safari's Date.parse rejects microseconds, a space separator and "+00".
export function normalizeStamp(stamp: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(stamp.trim());
  if (!m) return stamp;
  const seconds = m[2].length === 5 ? `${m[2]}:00` : m[2];
  const ms = (m[3] ?? "").padEnd(3, "0").slice(0, 3);
  const zone = !m[4] || /z/i.test(m[4]) ? "Z" : `${m[4].slice(0, 3)}:${m[4].slice(3).replace(":", "").padEnd(2, "0")}`;
  return `${m[1]}T${seconds}.${ms}${zone}`;
}
export const stampTime = (iso: string | undefined) => {
  const value = iso ? Date.parse(normalizeStamp(iso)) : NaN;
  return Number.isNaN(value) ? 0 : value;
};
const time = stampTime;
// A pending local change newer than the cloud copy wins (it will be pushed);
// otherwise the cloud copy wins (ties included).
export const localWins = (outbox: Outbox, key: string, remoteAt: string) =>
  outbox[key] !== undefined && time(outbox[key]) > time(remoteAt);

type Op =
  | { kind: "upsert"; collection: SyncedCollection; id: string; data: { id: string }; position: number; key: string; row: RecordRow }
  | { kind: "delete"; collection: SyncedCollection; id: string; key: string; row: RecordRow }
  | { kind: "meta"; field: SharedSetting; data: unknown; key: string; row: MetaRow };
export type ApplyResult = {
  state: FinanceState;
  // Outbox entries to add: tombstones for the losers of a same-key clash.
  outbox: Outbox;
  // Outbox keys superseded by the cloud copy (to remove).
  superseded: string[];
  // Rows that could not be applied yet (e.g. a transaction whose account
  // hasn't arrived); kept and retried on the next pull.
  parked: RecordRow[];
  // A setting was rejected (it isn't parked, so it must be fetched again).
  metaRejected?: boolean;
  changed: boolean;
};
function opsFor(
  state: FinanceState,
  records: RecordRow[],
  meta: MetaRow[],
  outbox: Outbox,
  superseded: string[],
) {
  const ops: Op[] = [];
  // Latest row per key (pages may repeat a key after an overlap window).
  const latest = new Map<string, RecordRow>();
  for (const row of records) {
    if (!isSyncedCollection(row.collection)) continue;
    const key = recordKey(row.collection, row.id);
    const seen = latest.get(key);
    if (!seen || time(seen.client_updated_at) <= time(row.client_updated_at))
      latest.set(key, row);
  }
  const byId = new Map<string, Map<string, string>>();
  const local = (collection: SyncedCollection) => {
    let map = byId.get(collection);
    if (!map) {
      map = new Map(state[collection].map((r) => [r.id, canonical(r)]));
      byId.set(collection, map);
    }
    return map;
  };
  for (const [key, row] of latest) {
    const collection = row.collection as SyncedCollection;
    if (localWins(outbox, key, row.client_updated_at)) continue;
    if (outbox[key] !== undefined) superseded.push(key);
    const current = local(collection).get(row.id);
    const data = row.data as { id?: unknown } | null;
    if (row.deleted || !data || typeof data !== "object") {
      if (current !== undefined)
        ops.push({ kind: "delete", collection, id: row.id, key, row });
      continue;
    }
    const record = { ...data, id: row.id };
    if (current === canonical(record)) continue;
    ops.push({ kind: "upsert", collection, id: row.id, data: record, position: row.position, key, row });
  }
  for (const row of meta) {
    const field = metaField(row.key);
    if (!field) continue; // never apply device-local or unknown keys
    const key = `m/${row.key}`;
    if (localWins(outbox, key, row.client_updated_at)) continue;
    if (outbox[key] !== undefined) superseded.push(key);
    const data = row.data === null ? undefined : row.data;
    if (canonical(state.settings[field]) === canonical(data ?? null)) continue;
    ops.push({ kind: "meta", field, data, key, row });
  }
  return ops;
}
function applyOps(state: FinanceState, ops: Op[]): FinanceState {
  if (!ops.length) return state;
  const next: FinanceState = { ...state, settings: { ...state.settings } };
  const grouped = new Map<SyncedCollection, Op[]>();
  for (const op of ops) {
    if (op.kind === "meta") {
      const settings = next.settings as Record<string, unknown>;
      if (op.data === undefined) delete settings[op.field];
      else settings[op.field] = op.data;
      continue;
    }
    grouped.set(op.collection, [...(grouped.get(op.collection) ?? []), op]);
  }
  for (const [collection, list] of grouped) {
    const deletes = new Set(list.filter((o) => o.kind === "delete").map((o) => o.id));
    const upserts = new Map(
      list.flatMap((o) => (o.kind === "upsert" ? [[o.id, o] as const] : [])),
    );
    const rows = (state[collection] as { id: string }[])
      .filter((r) => !deletes.has(r.id))
      .map((r) => {
        const op = upserts.get(r.id);
        if (!op) return r;
        upserts.delete(r.id);
        return op.data;
      });
    // New records go after the existing ones, in their cloud order.
    const added = [...upserts.values()].sort((a, b) => a.position - b.position);
    (next as Record<string, unknown>)[collection] = [
      ...rows,
      ...added.map((o) => o.data),
    ];
  }
  return next;
}
const rank = (op: Op) =>
  op.kind === "meta"
    ? -1
    : op.kind === "upsert"
      ? SYNCED_COLLECTIONS.indexOf(op.collection)
      : 2 * SYNCED_COLLECTIONS.length - SYNCED_COLLECTIONS.indexOf(op.collection);

// Budgets are unique per period (and category) and currency; two devices
// creating "the same" budget get different ids.
const uniqueKey = (collection: SyncedCollection, row: Record<string, unknown>) =>
  collection === "budgets"
    ? `${row.month}:${row.categoryId}:${row.currency}`
    : collection === "monthlyBudgets"
      ? `${row.month}:${row.currency}`
      : undefined;
function clashing(state: FinanceState, op: Op) {
  if (op.kind !== "upsert") return;
  const key = uniqueKey(op.collection, op.data);
  if (key === undefined) return;
  return (state[op.collection] as { id: string }[]).find(
    (r) => r.id !== op.id && uniqueKey(op.collection, r) === key,
  )?.id;
}

// Applies pulled rows to `state` through the normal validation (parseState).
// When the whole set doesn't validate, rows are applied one by one in
// dependency order and the ones that still don't fit are parked.
export function applyRemote(
  state: FinanceState,
  records: RecordRow[],
  meta: MetaRow[],
  outbox: Outbox,
  validate: (state: FinanceState) => FinanceState = parseState,
  now = new Date().toISOString(),
): ApplyResult {
  const superseded: string[] = [];
  const added: Outbox = {};
  const ops = opsFor(state, records, meta, outbox, superseded);
  if (!ops.length) return { state, outbox: added, superseded, parked: [], changed: false };
  try {
    return { state: validate(applyOps(state, ops)), outbox: added, superseded, parked: [], changed: true };
  } catch {
    // Fall through to the incremental path.
  }
  let current = state;
  const parked: RecordRow[] = [];
  const rejected = new Set<string>();
  for (const op of [...ops].sort((a, b) => rank(a) - rank(b))) {
    try {
      current = validate(applyOps(current, [op]));
      continue;
    } catch {
      // A same-key budget clash, or a row that doesn't fit (yet).
    }
    const other = op.kind === "upsert" ? clashing(current, op) : undefined;
    if (op.kind === "upsert" && other !== undefined) {
      // Only the clash: every device keeps the same one (the older id; ids
      // start with their creation time) and sends a tombstone for the other,
      // so the cloud converges.
      const loser: Op = { kind: "delete", collection: op.collection, id: other, key: recordKey(op.collection, other), row: op.row };
      try {
        const resolved = validate(applyOps(current, [loser, op]));
        if (op.id < other) {
          current = resolved;
          added[loser.key] = now;
        } else added[op.key] = now;
        continue;
      } catch {
        // Something else is wrong too: park it.
      }
    }
    rejected.add(op.key);
    if (op.kind !== "meta") parked.push(op.row);
  }
  return {
    state: current,
    outbox: added,
    superseded: superseded.filter((key) => !rejected.has(key)),
    parked,
    metaRejected: [...rejected].some((key) => key.startsWith("m/")),
    changed: current !== state,
  };
}
// Pull cursor: the last row seen, ordered by (server_updated_at, collection, id).
export type Cursor = { at: string; collection: string; id: string };
// Re-read a short window before the cursor: a slow transaction can commit rows
// stamped before rows that were already pulled. Re-applying a row is a no-op.
export const PULL_OVERLAP_MS = 60_000;
export function pullStart(cursor: Cursor | null): Cursor | null {
  if (!cursor) return null;
  const at = time(cursor.at) - PULL_OVERLAP_MS;
  return { at: new Date(Math.max(0, at)).toISOString(), collection: "", id: "" };
}
// Settings cursor: the newest server_updated_at seen in sync_meta.
export function latestMeta(rows: MetaRow[], previous: string | null): string | null {
  let latest = previous;
  for (const row of rows)
    if (row.server_updated_at && (!latest || time(row.server_updated_at) > time(latest)))
      latest = row.server_updated_at;
  return latest;
}
// Lower bound for the next settings fetch (same overlap as records).
export const metaSince = (cursor: string) =>
  new Date(Math.max(0, time(cursor) - PULL_OVERLAP_MS)).toISOString();
const quote = (value: string) => `"${value.replace(/["\\]/g, (c) => `\\${c}`)}"`;
// PostgREST `or` filter for rows strictly after `cursor` (keyset paging).
export function afterCursor(cursor: Cursor): string {
  const at = quote(cursor.at);
  return [
    `server_updated_at.gt.${at}`,
    `and(server_updated_at.eq.${at},collection.gt.${quote(cursor.collection)})`,
    `and(server_updated_at.eq.${at},collection.eq.${quote(cursor.collection)},id.gt.${quote(cursor.id)})`,
  ].join(",");
}
export function lastCursor(rows: RecordRow[], fallback: Cursor | null): Cursor | null {
  const last = rows.at(-1);
  return last?.server_updated_at
    ? { at: last.server_updated_at, collection: last.collection, id: last.id }
    : fallback;
}
// Keeps parked rows bounded and unique (newest per key).
export function mergeParked(previous: RecordRow[], next: RecordRow[], limit = 500) {
  const map = new Map<string, RecordRow>();
  for (const row of [...previous, ...next]) map.set(recordKey(row.collection, row.id), row);
  return [...map.values()].slice(-limit);
}

// What a device has, for the first sign-in.
export type LocalKind = "empty" | "data";
export function localKind(state: FinanceState | null): LocalKind {
  if (!state) return "empty";
  if (state.settings.onboarded === false || !hasRealData(state)) return "empty";
  return "data";
}
export type FirstSync =
  // Different account than the one this device synced with: only an explicit
  // "Replace this device's data" may continue.
  | "switch"
  // Nothing here: download everything (union, the cloud wins conflicts).
  | "pull"
  // Nothing in the cloud: upload everything.
  | "push"
  // Both have data: confirm before merging (or replacing this device).
  | "merge";
export function decideFirstSync({
  local,
  remoteHasData,
  previousUser,
  user,
}: {
  local: LocalKind;
  remoteHasData: boolean;
  previousUser?: string;
  user: string;
}): FirstSync {
  if (previousUser && previousUser !== user && local !== "empty") return "switch";
  if (local === "empty") return "pull";
  return remoteHasData ? "merge" : "push";
}
// Device-local settings kept when this device's data is replaced.
export function keepDeviceSettings(next: FinanceState, device: FinanceState | null): FinanceState {
  if (!device) return next;
  const settings = { ...next.settings } as Record<string, unknown>;
  for (const field of DEVICE_LOCAL_SETTINGS)
    if (field !== "onboarded") settings[field] = device.settings[field];
  return { ...next, settings: settings as Settings };
}

// Receipt photos: names (inside the receipts folder) referenced by transactions.
export type ReceiptState = { cloud: string[] };
export function planReceipts(
  state: FinanceState,
  receipts: ReceiptState,
  existsLocally: (name: string) => boolean,
) {
  const referenced = referencedReceipts(state);
  const cloud = new Set(receipts.cloud);
  const upload: string[] = [];
  const download: string[] = [];
  for (const name of referenced) {
    const local = existsLocally(name);
    if (local && !cloud.has(name)) upload.push(name);
    if (!local) download.push(name);
  }
  // Known in the cloud but no longer referenced: removed (best effort).
  const remove = receipts.cloud.filter((name) => !referenced.has(name));
  return { upload, download, remove };
}
