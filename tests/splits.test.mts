import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocations,
  categoryAmount,
  categoryBreakdown,
  categoryInUse,
  categoryTotals,
  defaultCategories,
  emptyState,
  reportEntries,
  saveTransaction,
  spent,
  today,
  withoutUnusedDefaults,
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
        id: "cash",
        name: "Cash",
        currency: "DOP",
        type: "cash",
        opening: 0,
        color: "#548B75",
      },
    ],
  };
}
function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "split",
    kind: "expense",
    accountId: "bank",
    amount: 10000,
    categoryId: "food",
    title: "Supermarket",
    note: "",
    date: today(),
    splits: [
      { categoryId: "food", amount: 3000 },
      { categoryId: "home", amount: 7000 },
    ],
    ...overrides,
  };
}
const range = { from: "2000-01-01", to: today() };

test("saving a split points categoryId at the largest part", () => {
  const state = saveTransaction(fixture(), tx());
  assert.equal(state.transactions[0].categoryId, "home");
  assert.deepEqual(allocations(state.transactions[0]), tx().splits);
  const tie = saveTransaction(
    fixture(),
    tx({
      amount: 2000,
      splits: [
        { categoryId: "fun", amount: 1000 },
        { categoryId: "food", amount: 1000 },
      ],
    }),
  );
  assert.equal(tie.transactions[0].categoryId, "fun");
  const empty = saveTransaction(fixture(), tx({ splits: [] }));
  assert.equal("splits" in empty.transactions[0], false);
  assert.equal(empty.transactions[0].categoryId, "food");
});
test("invalid splits are rejected", () => {
  for (const splits of [
    [{ categoryId: "food", amount: 10000 }],
    [
      { categoryId: "food", amount: 3000 },
      { categoryId: "home", amount: 6000 },
    ],
    [
      { categoryId: "food", amount: 0 },
      { categoryId: "home", amount: 10000 },
    ],
    [
      { categoryId: "food", amount: -1000 },
      { categoryId: "home", amount: 11000 },
    ],
    [
      { categoryId: "food", amount: 5000 },
      { categoryId: "food", amount: 5000 },
    ],
    [
      { categoryId: "food", amount: 5000 },
      { categoryId: "salary", amount: 5000 },
    ],
    [
      { categoryId: "food", amount: 5000 },
      { categoryId: "missing", amount: 5000 },
    ],
    [
      { categoryId: "food", amount: 4999.5 },
      { categoryId: "home", amount: 5000.5 },
    ],
  ])
    assert.throws(
      () => saveTransaction(fixture(), tx({ splits })),
      undefined,
      JSON.stringify(splits),
    );
  assert.throws(() =>
    saveTransaction(
      fixture(),
      tx({
        kind: "transfer",
        toAccountId: "cash",
        received: 10000,
        categoryId: "",
      }),
    ),
  );
  const income = saveTransaction(
    fixture(),
    tx({
      kind: "income",
      categoryId: "salary",
      splits: [
        { categoryId: "salary", amount: 8000 },
        { categoryId: "freelance", amount: 2000 },
      ],
    }),
  );
  assert.equal(income.transactions[0].categoryId, "salary");
});
test("budgets, reports and breakdowns use split allocations", () => {
  let state = saveTransaction(fixture(), tx());
  state = saveTransaction(
    state,
    tx({ id: "plain", splits: undefined, amount: 500 }),
  );
  const month = today().slice(0, 7);
  assert.equal(
    spent(state, { categoryId: "food", currency: "DOP", month }),
    3500,
  );
  assert.equal(
    spent(state, { categoryId: "home", currency: "DOP", month }),
    7000,
  );
  assert.deepEqual(categoryBreakdown(state, range, "DOP"), [
    { categoryId: "home", amount: 7000 },
    { categoryId: "food", amount: 3500 },
  ]);
  assert.deepEqual(categoryTotals(state.transactions, "income"), []);
  const food = reportEntries(state, "DOP", range, "category", "food");
  assert.deepEqual(food.map((t) => t.id).sort(), ["plain", "split"]);
  assert.equal(
    food.reduce((v, t) => v + categoryAmount(t, "food"), 0),
    3500,
  );
  assert.equal(
    reportEntries(state, "DOP", range, "category", "home").length,
    1,
  );
  assert.equal(categoryInUse(state, "food"), true);
  assert.equal(categoryInUse(state, "fun"), false);
});
test("split categories count as used and survive backups", () => {
  const state = saveTransaction(
    fixture(),
    tx({
      splits: [
        { categoryId: "food", amount: 3000 },
        { categoryId: "health", amount: 7000 },
      ],
    }),
  );
  const kept = withoutUnusedDefaults(state).categories.map((c) => c.id);
  assert.ok(kept.includes("food") && kept.includes("health"));
  const restored = parseState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(
    restored.transactions[0].splits,
    state.transactions[0].splits,
  );
  const stale = JSON.parse(JSON.stringify(state));
  stale.transactions[0].categoryId = "food";
  assert.equal(parseState(stale).transactions[0].categoryId, "health");
  const broken = JSON.parse(JSON.stringify(state));
  broken.transactions[0].splits[0].amount = 1;
  assert.throws(() => parseState(broken), /add up/);
});
test("upcoming recurring splits match their categories", () => {
  const state = fixture();
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const next = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const { id: _id, date: _date, ...rest } = tx({ categoryId: "home" });
  state.recurring = [
    {
      ...rest,
      id: "rule",
      nextDate: next,
      frequency: "monthly",
      anchorDay: 1,
      active: true,
      subscription: false,
    },
  ];
  const upcoming = { from: next, to: next };
  assert.equal(
    reportEntries(state, "DOP", upcoming, "upcoming", "food").length,
    1,
  );
  assert.equal(
    reportEntries(state, "DOP", upcoming, "upcoming", "fun").length,
    0,
  );
});
