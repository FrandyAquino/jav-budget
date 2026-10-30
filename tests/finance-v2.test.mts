import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convert,
  defaultCategories,
  duplicateTransaction,
  emptyState,
  exchangeRate,
  monthKey,
  netWorth,
  normalizeTags,
  processRecurring,
  saveTransaction,
  today,
  type FinanceState,
  type Transaction,
} from "../src/features/finance/model.ts";
import { parseState } from "../src/features/finance/schema.ts";

function fixture(): FinanceState {
  return {
    ...emptyState(),
    categories: defaultCategories,
    accounts: [
      {
        id: "bank",
        name: "Bank",
        currency: "DOP",
        type: "bank",
        opening: 100000,
        color: "#548B75",
      },
      {
        id: "usd",
        name: "USD",
        currency: "USD",
        type: "bank",
        opening: 30000,
        color: "#548B75",
      },
    ],
  };
}
function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "entry",
    kind: "expense",
    accountId: "bank",
    amount: 2500,
    categoryId: "food",
    title: "Groceries",
    note: "",
    date: today(),
    tags: [],
    ...overrides,
  };
}
// Shape of a real v1 backup: no tags/rollover/monthlyBudgets/exchangeRate, old settings.
function v1Backup() {
  return {
    version: 1,
    demo: false,
    accounts: [
      {
        id: "bank",
        name: "Bank",
        type: "bank",
        currency: "DOP",
        opening: 100000,
        color: "#548B75",
      },
    ],
    categories: defaultCategories,
    transactions: [
      {
        id: "t1",
        kind: "expense",
        amount: 2500,
        accountId: "bank",
        categoryId: "food",
        title: "Groceries",
        note: "",
        date: "2024-03-02",
      },
    ],
    budgets: [
      {
        id: "b1",
        categoryId: "food",
        currency: "DOP",
        month: "2024-03",
        limit: 10000,
      },
    ],
    recurring: [
      {
        id: "r1",
        kind: "expense",
        amount: 999,
        accountId: "bank",
        categoryId: "fun",
        title: "Music",
        note: "",
        nextDate: "2024-04-01",
        frequency: "monthly",
        anchorDay: 1,
        active: false,
        subscription: true,
      },
    ],
    goals: [],
    settings: {
      name: "Ana",
      currency: "DOP",
      appearance: "system",
      biometrics: false,
      notifications: false,
    },
  };
}

test("v1 backups upgrade to v2 with defaults", () => {
  const state = parseState(JSON.parse(JSON.stringify(v1Backup())));
  assert.equal(state.version, 2);
  assert.deepEqual(state.monthlyBudgets, []);
  assert.deepEqual(state.transactions[0].tags, []);
  assert.equal(state.transactions[0].splits, undefined);
  assert.equal(state.transactions[0].receipt, undefined);
  assert.equal(state.budgets[0].rollover, false);
  assert.deepEqual(state.recurring[0].tags, []);
  assert.equal(state.settings.exchangeRate, undefined);
  assert.equal(state.settings.numberEntry, "decimal");
  assert.equal(state.settings.email, "");
  assert.equal(state.settings.language, "system");
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(state))), state);
});
test("v2 data saved before the language setting existed still parses", () => {
  const stored = JSON.parse(JSON.stringify(fixture()));
  delete stored.settings.language;
  assert.equal(parseState(stored).settings.language, "system");
  stored.settings.language = "es";
  assert.equal(parseState(stored).settings.language, "es");
  stored.settings.language = "fr";
  assert.throws(() => parseState(stored), /not a valid/);
});
test("v1 stored state from the previous app version still loads", () => {
  const legacy = v1Backup();
  const state = parseState(legacy);
  assert.equal(state.version, 2);
  assert.equal(state.transactions.length, legacy.transactions.length);
  assert.equal("demo" in state, false);
});
test("migration keeps integrity checks", () => {
  const backup = v1Backup();
  backup.transactions[0].accountId = "missing";
  assert.throws(() => parseState(backup));
  const dupes = v1Backup();
  dupes.budgets.push({ ...dupes.budgets[0], id: "b2" });
  assert.throws(() => parseState(dupes), /one budget per month/);
  assert.throws(() => parseState(null), /not a valid/);
  assert.throws(() => parseState([]), /not a valid/);
});
test("v2 validates exchange rates, overall budgets and tags", () => {
  const state = fixture();
  const ok = {
    ...state,
    settings: {
      ...state.settings,
      exchangeRate: {
        dopPerUsd: 59.1234,
        updatedAt: "2026-01-01T10:00:00.000Z",
      },
    },
  };
  assert.equal(parseState(ok).settings.exchangeRate?.dopPerUsd, 59.1234);
  for (const dopPerUsd of [0, -1, 59.12345, Number.NaN])
    assert.throws(() =>
      parseState({
        ...state,
        settings: {
          ...state.settings,
          exchangeRate: { dopPerUsd, updatedAt: "2026-01-01" },
        },
      }),
    );
  const mb = { id: "m", month: "2026-01", currency: "DOP", limit: 5000 };
  assert.equal(
    parseState({ ...state, monthlyBudgets: [mb] }).monthlyBudgets.length,
    1,
  );
  assert.throws(
    () => parseState({ ...state, monthlyBudgets: [mb, { ...mb, id: "n" }] }),
    /one overall budget/,
  );
  assert.throws(() =>
    parseState({ ...state, monthlyBudgets: [{ ...mb, month: "2026-13" }] }),
  );
  const tagged = parseState({
    ...state,
    transactions: [tx({ tags: [" Trip ", "trip", "#Work"] })],
  });
  assert.deepEqual(tagged.transactions[0].tags, ["trip", "work"]);
  assert.throws(() =>
    parseState({ ...state, transactions: [tx({ tags: ["x".repeat(31)] })] }),
  );
});
test("conversion rounds half away from zero in both directions", () => {
  const rate = exchangeRate(58.5);
  assert.equal(convert(100, "USD", "DOP", rate), 5850);
  assert.equal(convert(5850, "DOP", "USD", rate), 100);
  assert.equal(convert(1, "DOP", "USD", 58.5), 0);
  assert.equal(convert(30, "DOP", "USD", 60), 1); // 0.5 -> 1
  assert.equal(convert(-30, "DOP", "USD", 60), -1);
  assert.equal(convert(1, "USD", "DOP", 0.0001), 0);
  assert.equal(convert(123, "DOP", "DOP"), 123);
  assert.equal(convert(123, "DOP", "USD"), undefined);
  assert.equal(convert(123, "USD", "DOP", 0), undefined);
  assert.equal(
    convert(1_000_000_000_000, "USD", "DOP", 59.1234),
    59_123_400_000_000,
  );
  assert.throws(() => exchangeRate(1.23456));
});
test("net worth never guesses a missing rate", () => {
  const state = fixture();
  const missing = netWorth(state, "DOP");
  assert.equal(missing.total, undefined);
  assert.equal(missing.needsRate, true);
  assert.deepEqual(missing.byCurrency, { DOP: 100000, USD: 30000 });
  state.settings.exchangeRate = exchangeRate(60, "2026-01-01");
  assert.equal(netWorth(state, "DOP").total, 100000 + 1800000);
  assert.equal(netWorth(state, "USD").total, Math.round(100000 / 60) + 30000);
  const single = { ...fixture(), accounts: fixture().accounts.slice(0, 1) };
  assert.deepEqual(
    [netWorth(single, "DOP").total, netWorth(single, "DOP").needsRate],
    [100000, false],
  );
  assert.equal(netWorth(single, "USD").total, undefined);
});
test("tags are trimmed, lowercased, deduped and limited", () => {
  assert.deepEqual(
    normalizeTags(["  Food ", "food", "", "#Trip  2026", "FOOD"]),
    ["food", "trip 2026"],
  );
  const state = saveTransaction(fixture(), tx({ tags: ["A", " a ", "B"] }));
  assert.deepEqual(state.transactions[0].tags, ["a", "b"]);
  assert.throws(() =>
    saveTransaction(
      fixture(),
      tx({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }),
    ),
  );
  assert.throws(() =>
    saveTransaction(fixture(), tx({ tags: ["x".repeat(31)] })),
  );
  assert.doesNotThrow(() =>
    saveTransaction(fixture(), tx({ tags: ["x".repeat(30)] })),
  );
});
test("recurring rules carry their tags onto posted entries", () => {
  const state = fixture();
  state.recurring = [
    {
      ...tx({ tags: ["home"] }),
      id: "rule",
      nextDate: "2020-01-01",
      frequency: "monthly",
      anchorDay: 1,
      active: true,
      subscription: false,
    },
  ];
  const result = processRecurring(state, "2020-01-31");
  assert.deepEqual(result.transactions[0].tags, ["home"]);
});
test("duplicating keeps tags and splits but drops receipt, recurrence and import id", () => {
  const original = tx({
    id: "src",
    date: "2020-01-01",
    tags: ["trip"],
    receipt: "file:///receipt.jpg",
    recurringId: "rule",
    importId: "csv:abc",
    amount: 3000,
    splits: [
      { categoryId: "food", amount: 2000 },
      { categoryId: "fun", amount: 1000 },
    ],
  });
  const state = saveTransaction(fixture(), original);
  const result = duplicateTransaction(state, "src");
  assert.equal(result.transactions.length, 2);
  const copy = result.transactions[1];
  assert.notEqual(copy.id, "src");
  assert.equal(copy.date, today());
  assert.deepEqual(copy.tags, ["trip"]);
  assert.deepEqual(copy.splits, original.splits);
  assert.equal(copy.receipt, undefined);
  assert.equal(copy.recurringId, undefined);
  assert.equal(copy.importId, undefined);
  assert.equal(
    duplicateTransaction(state, "src", "2020-02-02").transactions[1].date,
    "2020-02-02",
  );
  assert.throws(() => duplicateTransaction(state, "missing"));
  assert.throws(() => duplicateTransaction(state, "src", "2999-01-01"));
  assert.equal(state.transactions.length, 1);
  assert.equal(monthKey(copy.date), monthKey());
});
