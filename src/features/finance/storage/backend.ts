import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SQLite from "expo-sqlite";
import type { FinanceState } from "../model";
import { parseState } from "../schema";
import {
  diffState,
  emptySnapshot,
  isEmptyDiff,
  validKey,
  stateOf,
  type Snapshot,
  type StateDiff,
} from "./diff";
import {
  keepRecoveryCopy,
  LEGACY_KEY,
  serialize,
  UnreadableDataError,
  type Listener,
} from "./shared";

// Native: SQLite tables c_<collection>(id, data, position), meta(key, data) for scalar fields,
// internal(key, value) for the revision counter and migration marker.
type Db = SQLite.SQLiteDatabase;
type Cache = { revision: number; snapshot: Snapshot; state: FinanceState | null };
const table = (key: string) => {
  if (!validKey(key)) throw new Error(`Unsupported collection "${key}".`);
  return `"c_${key}"`;
};
let opening: Promise<Db> | undefined;
let cache: Cache | undefined;
const listeners = new Set<Listener>();

function open() {
  opening ??= SQLite.openDatabaseAsync("jav-budget.db")
    .then(async (db) => {
      await db.execAsync(
        `PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS internal (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
      );
      return db;
    })
    .catch((error: unknown) => {
      opening = undefined;
      throw error;
    });
  return opening;
}
const internal = (db: Db, key: string) =>
  db
    .getFirstAsync<{ value: string }>("SELECT value FROM internal WHERE key = ?", key)
    .then((row) => row?.value);
const setInternal = (db: Db, key: string, value: string) =>
  db.runAsync(
    "INSERT INTO internal (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );

async function read(db: Db, revision: number): Promise<Cache> {
  const snapshot = emptySnapshot();
  for (const row of await db.getAllAsync<{ key: string; data: string }>("SELECT key, data FROM meta"))
    snapshot.meta.set(row.key, row.data);
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'c\\_%' ESCAPE '\\'",
  );
  let rows = 0;
  for (const { name } of tables) {
    const key = name.slice(2);
    const entries = new Map<string, { data: string; position: number }>();
    for (const row of await db.getAllAsync<{ id: string; data: string; position: number }>(
      `SELECT id, data, position FROM ${table(key)} ORDER BY position`,
    ))
      entries.set(row.id, { data: row.data, position: row.position });
    rows += entries.size;
    snapshot.collections.set(key, entries);
  }
  const empty = !snapshot.meta.size && !rows;
  return { revision, snapshot, state: empty ? null : parseState(stateOf(snapshot)) };
}

async function apply(db: Db, diff: StateDiff) {
  for (const key of diff.dropped) await db.execAsync(`DROP TABLE IF EXISTS ${table(key)}`);
  for (const key of diff.created)
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS ${table(key)} (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, position REAL NOT NULL)`,
    );
  for (const { collection, id } of diff.deletes)
    await db.runAsync(`DELETE FROM ${table(collection)} WHERE id = ?`, id);
  const byCollection = new Map<string, typeof diff.upserts>();
  for (const row of diff.upserts)
    byCollection.set(row.collection, [...(byCollection.get(row.collection) ?? []), row]);
  for (const [collection, rows] of byCollection) {
    const statement = await db.prepareAsync(
      `INSERT INTO ${table(collection)} (id, data, position) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, position = excluded.position`,
    );
    try {
      for (const row of rows) await statement.executeAsync(row.id, row.data, row.position);
    } finally {
      await statement.finalizeAsync();
    }
  }
  for (const key of diff.metaDeletes) await db.runAsync("DELETE FROM meta WHERE key = ?", key);
  for (const { key, data } of diff.meta)
    await db.runAsync(
      "INSERT INTO meta (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data",
      key,
      data,
    );
}

// Reads the latest stored state (null when nothing is stored), applies `change`, and persists the
// diff in one exclusive transaction. `change` must validate its result; returning null skips the write.
export function transact<R extends FinanceState | null>(
  change: (base: FinanceState | null) => R,
): Promise<R> {
  return serialize(async () => {
    const db = await open();
    let result!: R;
    let committed: Cache | undefined;
    let wrote = false;
    await db.withExclusiveTransactionAsync(async (txn) => {
      const revision = Number((await internal(txn, "revision")) ?? 0);
      const current = cache?.revision === revision ? cache : await read(txn, revision);
      let base = current.state;
      let migrated = false;
      if (!base && !(await internal(txn, "migrated"))) {
        const raw = await AsyncStorage.getItem(LEGACY_KEY);
        if (raw) {
          try {
            base = parseState(JSON.parse(raw));
          } catch (error) {
            // Keep an untouched copy (the legacy key itself is never deleted)
            // and let the user choose to continue with empty data.
            await keepRecoveryCopy(AsyncStorage, raw);
            throw new UnreadableDataError(
              error instanceof Error ? error.message : String(error),
            );
          }
          migrated = true;
        }
      }
      result = change(base);
      if (!result) return void (committed = current);
      const { diff, snapshot } = diffState(current.snapshot, result);
      if (isEmptyDiff(diff) && !migrated) return void (committed = { ...current, state: result });
      await apply(txn, diff);
      await setInternal(txn, "revision", String(revision + 1));
      if (migrated || !current.state) await setInternal(txn, "migrated", new Date().toISOString());
      committed = { revision: revision + 1, snapshot, state: result };
      wrote = true;
    });
    cache = committed;
    if (result && wrote) for (const listener of listeners) listener(result);
    return result;
  });
}
// Continues with empty data after an UnreadableDataError: skips the legacy
// migration from now on. The legacy value and its recovery copy are kept.
export function discardUnreadableData(): Promise<void> {
  return serialize(async () => {
    const db = await open();
    if (await internal(db, "migrated")) return;
    await setInternal(db, "migrated", `skipped-unreadable:${new Date().toISOString()}`);
  });
}
export function subscribe(listener: Listener, _onError: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
