import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffState,
  emptySnapshot,
  isEmptyDiff,
  stateOf,
} from "../src/features/finance/storage/diff.ts";

const base = {
  version: 1,
  demo: false,
  settings: { currency: "DOP", notifications: true },
  accounts: [
    { id: "a", name: "Cash" },
    { id: "b", name: "Bank" },
  ],
  transactions: [
    { id: "t1", amount: 100 },
    { id: "t2", amount: 250 },
    { id: "t3", amount: 900 },
  ],
  goals: [],
};
const seed = () => diffState(emptySnapshot(), base);

test("initial diff inserts every record and meta field", () => {
  const { diff, snapshot } = seed();
  assert.deepEqual(diff.created.sort(), ["accounts", "goals", "transactions"]);
  assert.equal(diff.upserts.length, 5);
  assert.deepEqual(
    diff.meta.map((m) => m.key).sort(),
    ["demo", "settings", "version"],
  );
  assert.deepEqual(diff.deletes, []);
  assert.deepEqual(stateOf(snapshot), base);
});

test("unchanged state produces an empty diff", () => {
  const { snapshot } = seed();
  const { diff } = diffState(snapshot, structuredClone(base));
  assert.ok(isEmptyDiff(diff));
});

test("updates, inserts and deletes only touch the affected rows", () => {
  const { snapshot } = seed();
  const next = {
    ...base,
    accounts: [base.accounts[0], { id: "b", name: "Savings" }],
    transactions: [base.transactions[0], base.transactions[2], { id: "t4", amount: 5 }],
  };
  const { diff, snapshot: after } = diffState(snapshot, next);
  assert.deepEqual(
    diff.upserts.map((u) => `${u.collection}:${u.id}`).sort(),
    ["accounts:b", "transactions:t4"],
  );
  assert.deepEqual(diff.deletes, [{ collection: "transactions", id: "t2" }]);
  assert.deepEqual(diff.meta, []);
  assert.deepEqual(stateOf(after), next);
});

test("moving an edited record to the end rewrites only that record", () => {
  const { snapshot } = seed();
  const moved = { id: "t1", amount: 101 };
  const next = { ...base, transactions: [base.transactions[1], base.transactions[2], moved] };
  const { diff, snapshot: after } = diffState(snapshot, next);
  assert.deepEqual(diff.upserts.map((u) => u.id), ["t1"]);
  assert.deepEqual(stateOf(after), next);
});

test("inserting in the middle keeps neighbours and preserves order", () => {
  let { snapshot } = seed();
  let transactions = [...base.transactions];
  for (let i = 0; i < 80; i++) {
    transactions = [transactions[0], { id: `n${i}`, amount: i }, ...transactions.slice(1)];
    const result = diffState(snapshot, { ...base, transactions });
    snapshot = result.snapshot;
    assert.deepEqual(stateOf(snapshot).transactions, transactions);
  }
});

test("meta changes and removed keys", () => {
  const { snapshot } = seed();
  const { goals: _goals, demo: _demo, ...rest } = base;
  const next = { ...rest, settings: { ...base.settings, currency: "USD" } };
  const { diff } = diffState(snapshot, next);
  assert.deepEqual(diff.meta, [
    { key: "settings", data: JSON.stringify(next.settings) },
  ]);
  assert.deepEqual(diff.metaDeletes, ["demo"]);
  assert.deepEqual(diff.dropped, ["goals"]);
});

test("unknown array collections are discovered generically", () => {
  const { snapshot } = seed();
  const next = { ...base, version: 2, tags: [{ id: "x", name: "Food" }], labels: ["a", "b"] };
  const { diff, snapshot: after } = diffState(snapshot, next);
  assert.deepEqual(diff.created, ["tags"]);
  assert.deepEqual(diff.upserts.map((u) => `${u.collection}:${u.id}`), ["tags:x"]);
  assert.deepEqual(
    diff.meta.map((m) => m.key).sort(),
    ["labels", "version"],
  );
  assert.deepEqual(stateOf(after), next);
});

test("a key switching between collection and meta is moved cleanly", () => {
  const { snapshot } = seed();
  const next = { ...base, goals: "none" };
  const { diff, snapshot: after } = diffState(snapshot, next);
  assert.deepEqual(diff.dropped, ["goals"]);
  assert.deepEqual(diff.meta, [{ key: "goals", data: '"none"' }]);
  const back = diffState(after, base).diff;
  assert.deepEqual(back.created, ["goals"]);
  assert.deepEqual(back.metaDeletes, ["goals"]);
});

test("rejects keys that cannot be table names", () => {
  assert.throws(() => diffState(emptySnapshot(), { 'x"; DROP': [] }));
});
