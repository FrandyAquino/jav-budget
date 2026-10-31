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
  latestMeta,
  localKind,
  mergeParked,
  metaSince,
  normalizeStamp,
  parseKey,
  planReceipts,
  pullStart,
  PULL_OVERLAP_MS,
  recordChanges,
  recordKey,
  seedOutbox,
  settingKey,
  stampTime,
  syncChanges,
  type RecordRow,
} from "../src/features/sync/core.ts";
import { emptyState } from "../src/features/finance/defaults.ts";
import { outboxGained } from "../src/features/finance/storage/shared.ts";
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

test("device-local settings and unfinished onboarding never enter the outbox", () => {
  const prev = ledger();
  for (const next of [
    { ...prev, settings: { ...prev.settings, appearance: "dark" as const } },
    { ...prev, settings: { ...prev.settings, biometrics: true, notifications: true } },
    { ...prev, settings: { ...prev.settings, language: "es" as const, appIcon: "chalk" as const } },
    { ...prev, settings: { ...prev.settings, autoBackup: false, lastExportAt: "2026-10-25T00:00:00.000Z" } },
    { ...prev, starterPruned: !prev.starterPruned },
  ])
    assert.deepEqual(syncChanges(prev, next), []);
  const unfinished = { ...prev, settings: { ...prev.settings, onboarded: false } };
  assert.deepEqual(syncChanges(prev, unfinished), []);
  // Finishing onboarding: everything in the new state is new.
  assert.deepEqual(syncChanges(unfinished, prev).sort(), allKeys(prev).sort());
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
  // Merge/pull: settings stamped by onboarding on this device lose to the cloud.
  const fresh = { [settingKey("name")]: "2026-10-30T10:00:00.000Z", [recordKey("transactions", "t1")]: "2026-10-30T10:00:00.000Z" };
  const merged = seedOutbox(state, fresh, EPOCH);
  assert.equal(merged[settingKey("name")], EPOCH);
  assert.equal(merged[settingKey("primaryAccountId")], EPOCH);
  assert.equal(merged[recordKey("transactions", "t1")], undefined);
  // Uploading into an empty cloud keeps them.
  assert.equal(seedOutbox(state, fresh, "2026-10-31T00:00:00.000Z")[settingKey("name")], undefined);
  const synced = applyRemote(state, [], [{ key: "settings_name", data: "Cloud Ana", client_updated_at: "2026-10-01T00:00:00.000Z" }], { ...fresh, ...merged });
  assert.equal(synced.state.settings.name, "Cloud Ana");
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
  assert.equal("demo" in result.state, false);
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
    [{ local: "data", remoteHasData: false, user, previousUser: "u0" }, "switch"],
    // Nothing on this device: another account's leftovers don't matter.
    [{ local: "empty", remoteHasData: true, user, previousUser: "u0" }, "pull"],
  ];
  for (const [input, expected] of cases) assert.equal(decideFirstSync(input), expected, JSON.stringify(input));
  assert.equal(localKind(null), "empty");
  assert.equal(localKind(emptyState()), "empty");
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

test("Postgres timestamps parse the same everywhere (Safari-safe)", () => {
  const expected = Date.UTC(2026, 9, 30, 16, 16, 42, 466);
  for (const stamp of [
    "2026-10-30 16:16:42.466225+00",
    "2026-10-30T16:16:42.466225+00:00",
    "2026-10-30T16:16:42.466Z",
    "2026-10-30 18:16:42.466225+0200",
  ])
    assert.equal(stampTime(stamp), expected, stamp);
  assert.equal(normalizeStamp("2026-10-30 16:16:42+00"), "2026-10-30T16:16:42.000+00:00");
  assert.equal(stampTime("2026-10-30T16:16:42+05:30"), Date.UTC(2026, 9, 30, 10, 46, 42));
  assert.equal(stampTime("nonsense"), 0);
  assert.equal(stampTime(undefined), 0);
  // pullStart understands them too.
  assert.equal(pullStart({ at: "2026-10-30 16:16:42.466225+00", collection: "a", id: "b" })?.at, new Date(expected - PULL_OVERLAP_MS).toISOString());
});

test("settings cursor keeps the newest stamp and re-reads an overlap window", () => {
  const meta = (at: string) => ({ key: "settings_name", data: "x", client_updated_at: EPOCH, server_updated_at: at });
  assert.equal(latestMeta([], null), null);
  assert.equal(latestMeta([meta("2026-10-30 16:00:00.5+00"), meta("2026-10-30 15:00:00+00")], null), "2026-10-30 16:00:00.5+00");
  assert.equal(latestMeta([meta("2026-10-30 15:00:00+00")], "2026-10-30T16:00:00.000Z"), "2026-10-30T16:00:00.000Z");
  assert.equal(metaSince("2026-10-30 16:01:00.123456+00"), "2026-10-30T16:00:00.123Z");
});

test("two devices creating the same budget converge on one (older id) and tombstone the other", () => {
  const now = "2026-10-31T00:00:00.000Z";
  const base = ledger();
  const budget = (id: string, limit: number) => ({ id, categoryId: "groceries", currency: "DOP" as const, month: "2026-10", limit, rollover: false });
  const monthly = (id: string, limit: number) => ({ id, currency: "DOP" as const, month: "2026-10", limit });
  // Device A has "b", pulls the older "a": the remote one wins.
  const a = parseState({ ...base, budgets: [budget("b", 100)], monthlyBudgets: [monthly("mb", 1)] });
  const onA = applyRemote(a, [
    row({ collection: "budgets", id: "a", data: budget("a", 200) }),
    row({ collection: "monthlyBudgets", id: "ma", data: monthly("ma", 2) }),
  ], [], {}, parseState, now);
  assert.deepEqual(onA.state.budgets.map((x) => [x.id, x.limit]), [["a", 200]]);
  assert.deepEqual(onA.state.monthlyBudgets.map((x) => x.id), ["ma"]);
  assert.deepEqual(onA.outbox, { [recordKey("budgets", "b")]: now, [recordKey("monthlyBudgets", "mb")]: now });
  assert.deepEqual(onA.parked, []);
  // Device B has the older "a", pulls "b": keeps its own and tombstones "b".
  const b = parseState({ ...base, budgets: [budget("a", 200)] });
  const onB = applyRemote(b, [row({ collection: "budgets", id: "b", data: budget("b", 100) })], [], {}, parseState, now);
  assert.equal(onB.state, b);
  assert.deepEqual(onB.outbox, { [recordKey("budgets", "b")]: now });
  assert.deepEqual(onB.parked, []);
  // The tombstone pushed by either device then applies cleanly.
  const gone = applyRemote(onB.state, [row({ collection: "budgets", id: "b", deleted: true })], [], {});
  assert.equal(gone.changed, false);
  // A clash that also has another problem (category missing) is still parked.
  const broken = applyRemote(a, [row({ collection: "budgets", id: "c", data: { ...budget("c", 1), categoryId: "nope" } })], [], {}, parseState, now);
  assert.deepEqual(broken.parked.map((r) => r.id), ["c"]);
  assert.deepEqual(broken.outbox, {});
});

test("other tabs only sync when the outbox gained or re-stamped entries", () => {
  const doc = (outbox: Record<string, string>, values: Record<string, string> = {}) => JSON.stringify({ outbox, values });
  // A cycle in the other tab: cursor/lastSyncedAt and acknowledgements only.
  assert.equal(outboxGained(doc({ a: "1" }), doc({ a: "1" }, { lastSyncedAt: "x" })), false);
  assert.equal(outboxGained(doc({ a: "1", b: "1" }), doc({ a: "1" })), false);
  assert.equal(outboxGained(null, null), false);
  // An edit there.
  assert.equal(outboxGained(doc({ a: "1" }), doc({ a: "1", b: "2" })), true);
  assert.equal(outboxGained(doc({ a: "1" }), doc({ a: "2" })), true);
  assert.equal(outboxGained(null, doc({ a: "1" })), true);
  assert.equal(outboxGained("{bad", doc({})), false);
});

test("an oversized record is dropped from the push instead of blocking it", () => {
  const state = ledger();
  const huge = { ...state, transactions: state.transactions.map((t, i) => (i ? t : { ...t, note: "x".repeat(70_000) })) };
  const id = huge.transactions[0].id;
  const [batch] = buildPush(huge, { [recordKey("transactions", id)]: "2026-10-25T10:00:00.000Z" });
  assert.deepEqual(batch.records, []);
  assert.deepEqual(batch.invalid, [recordKey("transactions", id)]);
});

test("a rejected setting is reported so the pull doesn't skip past it", () => {
  const state = ledger();
  const bad = applyRemote(state, [], [{ key: "settings_budgetPeriod", data: "fortnightly-ish", client_updated_at: "2026-10-01T00:00:00.000Z" }], {});
  assert.equal(bad.metaRejected, true);
  const good = applyRemote(state, [], [{ key: "settings_name", data: "Cloud", client_updated_at: "2026-10-01T00:00:00.000Z" }], {});
  assert.notEqual(good.metaRejected, true);
});
