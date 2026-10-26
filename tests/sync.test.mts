import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acknowledged,
  afterCursor,
  allKeys,
  applyRemote,
  buildPush,
  canonical,
  decideFirstSync,
  DEVICE_LOCAL_SETTINGS,
  EPOCH,
  keepDeviceSettings,
  lastCursor,
  localKind,
  mergeParked,
  parseKey,
  planReceipts,
  pullStart,
  PULL_OVERLAP_MS,
  recordChanges,
  recordKey,
  seedOutbox,
  settingKey,
  syncChanges,
  type RecordRow,
} from "../src/features/sync/core.ts";
import { demoState, emptyState } from "../src/features/finance/demo.ts";
import { parseState } from "../src/features/finance/schema.ts";
import type { FinanceState, Transaction } from "../src/features/finance/types.ts";

function ledger(): FinanceState {
  const base = emptyState();
  return parseState({
    ...base,
    settings: { ...base.settings, onboarded: true, name: "Ana" },
    accounts: [
      { id: "main", name: "Main", type: "bank", currency: "DOP", opening: 100_000, color: "#356C56" },
    ],
    categories: [
      { id: "groceries", name: "Groceries", icon: "shopping-bag", color: "#555B65", kind: "expense" },
    ],
    transactions: [
      { id: "t1", kind: "expense", amount: 500, accountId: "main", categoryId: "groceries", title: "Beans", note: "", date: "2026-10-01", tags: [] },
      { id: "t2", kind: "expense", amount: 700, accountId: "main", categoryId: "groceries", title: "Rice", note: "", date: "2026-10-02", tags: [] },
    ],
  });
}
const tx = (id: string, patch: Partial<Transaction> = {}): Transaction => ({
  id, kind: "expense", amount: 900, accountId: "main", categoryId: "groceries", title: id, note: "", date: "2026-10-03", tags: [], ...patch,
});
const row = (patch: Partial<RecordRow> & Pick<RecordRow, "collection" | "id">): RecordRow => ({
  data: null, position: 0, deleted: false, client_updated_at: "2026-10-25T10:00:00.000Z", server_updated_at: "2026-10-25T10:00:01.000000+00:00", ...patch,
});

test("change tracking records only synced data that really changed", () => {
  const prev = ledger();
  // Nothing before (first launch / migration): nothing to record.
  assert.deepEqual(syncChanges(null, prev), []);
  const edited = { ...prev, transactions: prev.transactions.map((t) => (t.id === "t2" ? { ...t, amount: 800 } : t)) };
  assert.deepEqual(syncChanges(prev, edited), [recordKey("transactions", "t2")]);
  const deleted = { ...prev, transactions: prev.transactions.filter((t) => t.id !== "t1") };
  assert.deepEqual(syncChanges(prev, deleted), [recordKey("transactions", "t1")]);
  // Moving a record (position only) isn't a data change.
  const moved = { ...prev, transactions: [...prev.transactions].reverse() };
  assert.deepEqual(syncChanges(prev, moved), []);
  const currency = { ...prev, settings: { ...prev.settings, currency: "USD" as const } };
  assert.deepEqual(syncChanges(prev, currency), [settingKey("currency")]);
});

test("device-local settings, demo data and unfinished onboarding never enter the outbox", () => {
  const prev = ledger();
  for (const next of [
    { ...prev, settings: { ...prev.settings, appearance: "dark" as const } },
    { ...prev, settings: { ...prev.settings, biometrics: true, notifications: true } },
    { ...prev, settings: { ...prev.settings, language: "es" as const, appIcon: "chalk" as const } },
    { ...prev, settings: { ...prev.settings, autoBackup: false, lastExportAt: "2026-10-25T00:00:00.000Z" } },
    { ...prev, starterPruned: !prev.starterPruned },
  ])
    assert.deepEqual(syncChanges(prev, next), []);
  const demo = demoState();
  assert.deepEqual(syncChanges(demo, { ...demo, transactions: demo.transactions.slice(1) }), []);
  assert.deepEqual(syncChanges(prev, { ...demo }), []);
  const unfinished = { ...prev, settings: { ...prev.settings, onboarded: false } };
  assert.deepEqual(syncChanges(prev, unfinished), []);
  // Finishing onboarding / leaving the demo: everything in the new state is new.
  assert.deepEqual(syncChanges(unfinished, prev).sort(), allKeys(prev).sort());
  assert.deepEqual(syncChanges(demo, prev).sort(), allKeys(prev).sort());
  for (const field of DEVICE_LOCAL_SETTINGS)
    assert.ok(!allKeys(prev).includes(settingKey(field as never)), field);
});

test("outbox keys parse back and unknown ones are rejected", () => {
  assert.deepEqual(parseKey("r/transactions/a/b"), { kind: "record", collection: "transactions", id: "a/b" });
  assert.deepEqual(parseKey("m/settings_currency"), { kind: "meta", key: "settings_currency", field: "currency" });
  assert.equal(parseKey("m/settings_biometrics"), undefined);
  assert.equal(parseKey("r/secrets/1"), undefined);
  assert.equal(parseKey("x"), undefined);
  const outbox = recordChanges({ a: "1" }, ["a", "b"], "2");
  assert.deepEqual(outbox, { a: "2", b: "2" });
  const state = ledger();
  const seeded = seedOutbox(state, { [recordKey("transactions", "t1")]: "2026-10-01T00:00:00.000Z" }, EPOCH);
  assert.equal(seeded[recordKey("transactions", "t1")], undefined);
  assert.equal(seeded[recordKey("transactions", "t2")], EPOCH);
  assert.equal(seeded[settingKey("name")], EPOCH);
});

test("push batches carry current data, tombstones and shared settings", () => {
  const state = ledger();
  const outbox = {
    [recordKey("transactions", "t2")]: "2026-10-25T10:00:00.000Z",
    [recordKey("transactions", "gone")]: "2026-10-25T10:00:01.000Z",
    [settingKey("exchangeRate")]: "2026-10-25T10:00:02.000Z",
    [settingKey("name")]: "2026-10-25T10:00:03.000Z",
    "r/unknown/1": "2026-10-25T10:00:04.000Z",
  };
  const [batch] = buildPush(state, outbox);
  assert.deepEqual(batch.records.map((r) => [r.id, r.deleted, r.position]), [["t2", false, 1], ["gone", true, 0]]);
  assert.equal((batch.records[0].data as Transaction).title, "Rice");
  assert.equal(batch.records[1].data, null);
  assert.deepEqual(batch.meta.map((m) => [m.key, m.data]), [["settings_exchangeRate", null], ["settings_name", "Ana"]]);
  assert.deepEqual(batch.invalid, ["r/unknown/1"]);
  // Changed again while in flight: not acknowledged.
  const later = { ...outbox, [recordKey("transactions", "t2")]: "2026-10-25T11:00:00.000Z" };
  assert.deepEqual(acknowledged(later, batch).sort(), [
    recordKey("transactions", "gone"), settingKey("exchangeRate"), settingKey("name"), "r/unknown/1",
  ].sort());
  const many = Object.fromEntries(allKeys(state).map((k) => [k, EPOCH]));
  const batches = buildPush(state, many, 3);
  assert.equal(batches.reduce((n, b) => n + b.records.length + b.meta.length, 0), allKeys(state).length);
  assert.ok(batches.every((b) => b.records.length + b.meta.length <= 3));
});

test("pulled rows apply with last-write-wins against pending local changes", () => {
  const state = ledger();
  const newer = "2026-10-25T12:00:00.000Z";
  const older = "2026-10-25T08:00:00.000Z";
  const outbox = {
    [recordKey("transactions", "t1")]: newer, // local change newer than the cloud copy
    [recordKey("transactions", "t2")]: older, // cloud copy newer
  };
  const result = applyRemote(
    state,
    [
      row({ collection: "transactions", id: "t1", data: tx("t1", { title: "Cloud t1" }) }),
      row({ collection: "transactions", id: "t2", data: tx("t2", { title: "Cloud t2" }) }),
      row({ collection: "transactions", id: "t3", data: tx("t3"), position: 5 }),
    ],
    [],
    outbox,
  );
  assert.ok(result.changed);
  assert.deepEqual(result.state.transactions.map((t) => t.title), ["Beans", "Cloud t2", "t3"]);
  assert.deepEqual(result.superseded, [recordKey("transactions", "t2")]);
  // Ties go to the cloud copy.
  const tie = applyRemote(state, [row({ collection: "transactions", id: "t1", deleted: true })], [], {
    [recordKey("transactions", "t1")]: "2026-10-25T10:00:00.000Z",
  });
  assert.deepEqual(tie.state.transactions.map((t) => t.id), ["t2"]);
});

test("pulled settings never touch device-local preferences and echoes are no-ops", () => {
  const state = ledger();
  const result = applyRemote(
    state,
    [],
    [
      { key: "settings_currency", data: "USD", client_updated_at: EPOCH },
      { key: "settings_biometrics", data: true, client_updated_at: EPOCH },
      { key: "settings_appearance", data: "dark", client_updated_at: EPOCH },
      { key: "settings_language", data: "es", client_updated_at: EPOCH },
      { key: "demo", data: true, client_updated_at: EPOCH },
    ],
    {},
  );
  assert.equal(result.state.settings.currency, "USD");
  assert.equal(result.state.settings.biometrics, false);
  assert.equal(result.state.settings.appearance, "system");
  assert.equal(result.state.settings.language, "system");
  assert.equal(result.state.demo, false);
  // The same record back from the cloud (jsonb reorders keys): nothing changes.
  const t1 = state.transactions[0];
  const reordered = Object.fromEntries(Object.entries(t1).reverse());
  const echo = applyRemote(state, [row({ collection: "transactions", id: "t1", data: reordered })], [{ key: "settings_name", data: "Ana", client_updated_at: EPOCH }], {});
  assert.equal(echo.changed, false);
  assert.equal(echo.state, state);
  assert.equal(canonical({ b: 1, a: [1, { d: 2, c: undefined }] }), canonical({ a: [1, { d: 2 }], b: 1 }));
});

test("rows that don't validate are parked while the rest applies, in dependency order", () => {
  const state = ledger();
  const result = applyRemote(
    state,
    [
      // Arrives before its account in the page: fine, the batch validates as a whole.
      row({ collection: "transactions", id: "t4", data: tx("t4", { accountId: "savings" }) }),
      row({ collection: "accounts", id: "savings", data: { id: "savings", name: "Savings", type: "bank", currency: "DOP", opening: 0, color: "#356C56" } }),
      // References an account that doesn't exist (yet): parked.
      row({ collection: "transactions", id: "t5", data: tx("t5", { accountId: "later" }) }),
      // Not a synced collection: ignored.
      row({ collection: "secrets", id: "x", data: { id: "x" } }),
    ],
    [],
    {},
  );
  assert.deepEqual(result.state.accounts.map((a) => a.id), ["main", "savings"]);
  assert.deepEqual(result.state.transactions.map((t) => t.id), ["t1", "t2", "t4"]);
  assert.deepEqual(result.parked.map((r) => r.id), ["t5"]);
  // Next pull: the account arrives, the parked row applies.
  const retry = applyRemote(
    result.state,
    [...result.parked, row({ collection: "accounts", id: "later", data: { id: "later", name: "Later", type: "cash", currency: "DOP", opening: 0, color: "#BA965C" } })],
    [],
    {},
  );
  assert.deepEqual(retry.parked, []);
  assert.ok(retry.state.transactions.some((t) => t.id === "t5"));
  // Deleting an account still in use is parked too (the ledger stays valid).
  const blocked = applyRemote(state, [row({ collection: "accounts", id: "main", deleted: true })], [], {});
  assert.equal(blocked.changed, false);
  assert.deepEqual(blocked.parked.map((r) => r.id), ["main"]);
  assert.deepEqual(mergeParked([row({ collection: "transactions", id: "a" })], [row({ collection: "transactions", id: "a", position: 9 })]).map((r) => r.position), [9]);
});

test("first sign-in decision matrix", () => {
  const user = "u1";
  const cases: [Parameters<typeof decideFirstSync>[0], string][] = [
    [{ local: "empty", remoteHasData: true, user }, "pull"],
    [{ local: "empty", remoteHasData: false, user }, "pull"],
    [{ local: "data", remoteHasData: false, user }, "push"],
    [{ local: "data", remoteHasData: true, user }, "merge"],
    [{ local: "data", remoteHasData: true, user, previousUser: user }, "merge"],
    [{ local: "demo", remoteHasData: true, user }, "demo"],
    [{ local: "demo", remoteHasData: false, user }, "demo"],
    [{ local: "data", remoteHasData: false, user, previousUser: "u0" }, "switch"],
    [{ local: "demo", remoteHasData: true, user, previousUser: "u0" }, "switch"],
    // Nothing on this device: another account's leftovers don't matter.
    [{ local: "empty", remoteHasData: true, user, previousUser: "u0" }, "pull"],
  ];
  for (const [input, expected] of cases) assert.equal(decideFirstSync(input), expected, JSON.stringify(input));
  assert.equal(localKind(null), "empty");
  assert.equal(localKind(emptyState()), "empty");
  assert.equal(localKind(demoState()), "demo");
  assert.equal(localKind(ledger()), "data");
  // Only categories left (e.g. after Start fresh): still empty.
  assert.equal(localKind({ ...emptyState(), settings: { ...emptyState().settings, onboarded: true }, categories: ledger().categories }), "empty");
});

test("replacing this device keeps its device-local preferences", () => {
  const device = ledger();
  device.settings = { ...device.settings, biometrics: true, appearance: "dark", language: "es", autoBackup: false };
  const next = keepDeviceSettings({ ...emptyState(), settings: { ...emptyState().settings, name: "Cloud" } }, device);
  assert.equal(next.settings.biometrics, true);
  assert.equal(next.settings.appearance, "dark");
  assert.equal(next.settings.language, "es");
  assert.equal(next.settings.autoBackup, false);
  assert.equal(next.settings.name, "Cloud");
  assert.equal(next.settings.onboarded, false);
});

test("pull cursor paging: keyset filter, overlap window and last row", () => {
  const cursor = { at: "2026-10-25T10:00:00.123456+00:00", collection: "transactions", id: 'a"b' };
  assert.equal(
    afterCursor(cursor),
    'server_updated_at.gt."2026-10-25T10:00:00.123456+00:00",' +
      'and(server_updated_at.eq."2026-10-25T10:00:00.123456+00:00",collection.gt."transactions"),' +
      'and(server_updated_at.eq."2026-10-25T10:00:00.123456+00:00",collection.eq."transactions",id.gt."a\\"b")',
  );
  assert.equal(pullStart(null), null);
  const start = pullStart(cursor)!;
  assert.equal(Date.parse(cursor.at) - Date.parse(start.at), PULL_OVERLAP_MS);
  assert.deepEqual([start.collection, start.id], ["", ""]);
  const rows = [row({ collection: "accounts", id: "a", server_updated_at: "t1" }), row({ collection: "transactions", id: "b", server_updated_at: "t2" })];
  assert.deepEqual(lastCursor(rows, null), { at: "t2", collection: "transactions", id: "b" });
  assert.deepEqual(lastCursor([], cursor), cursor);
});

test("receipt plan: upload local photos, download missing ones, remove unreferenced", () => {
  const state = ledger();
  state.transactions = [
    tx("r1", { receipt: "file:///data/Documents/receipts/a1.jpg" }),
    tx("r2", { receipt: "file:///other/device/Documents/receipts/b2.png" }),
    tx("r3", { receipt: "blob:http://localhost/xyz" }),
  ];
  const plan = planReceipts(state, { cloud: ["b2.png", "old.jpg"] }, (name) => name === "a1.jpg");
  assert.deepEqual(plan.upload, ["a1.jpg"]);
  assert.deepEqual(plan.download, ["b2.png"]);
  assert.deepEqual(plan.remove, ["old.jpg"]);
});
