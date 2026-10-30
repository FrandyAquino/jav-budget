import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entryAmount,
  reportEntries,
  dateString,
  weekStart,
  accountBalance,
  balanceSeries,
  cents,
  defaultCategories,
  emptyState,
  monthKey,
  money,
  nextDate,
  nextFutureDate,
  rangeTotals,
  processRecurring,
  removeAccount,
  saveTransaction,
  spent,
  today,
  totals,
  validDate,
  withoutUnusedDefaults,
  type FinanceState,
  type Transaction,
} from "../src/features/finance/model.ts";
import { parseState } from "../src/features/finance/schema.ts";

test("daily and biweekly schedules advance across year and month boundaries", () => {
  assert.equal(nextDate("2025-12-31", "daily", 31), "2026-01-01");
  assert.equal(nextDate("2026-01-25", "biweekly", 25), "2026-02-08");
  assert.equal(
    nextFutureDate("2026-01-01", "biweekly", 1, "2026-01-29"),
    "2026-02-12",
  );
});
test("negative peso balances retain their currency label", () => {
  assert.equal(money(-12345, "DOP"), "-RD$123.45");
  assert.equal(money(-12345, "USD"), "-$123.45");
});
test("custom ranges include both endpoints and exclude transfers", () => {
  let state = saveTransaction(
    fixture(),
    tx({ date: "2020-01-01", amount: 1000 }),
  );
  state = saveTransaction(
    state,
    tx({ id: "end", date: "2020-01-05", amount: 2000 }),
  );
  state = saveTransaction(
    state,
    tx({ id: "outside", date: "2020-01-06", amount: 3000 }),
  );
  assert.equal(
    rangeTotals(state, { from: "2020-01-01", to: "2020-01-05" }, "DOP").expense,
    3000,
  );
});
test("balance timeline reconciles account totals and cross-currency transfers", () => {
  let state = saveTransaction(
    fixture(),
    tx({ date: "2020-01-01", amount: 1000 }),
  );
  state = saveTransaction(
    state,
    tx({
      id: "fx",
      kind: "transfer",
      toAccountId: "usd",
      received: 2000,
      date: "2020-01-03",
      amount: 4000,
      categoryId: "",
    }),
  );
  const range = { from: "2020-01-02", to: "2020-01-04" };
  assert.deepEqual(
    balanceSeries(state, "DOP", range).map((p) => p.value),
    [89000, 85000, 85000],
  );
  assert.equal(balanceSeries(state, "USD", range).at(-1)?.value, 32000);
});
test("all recurring frequencies catch up once and never duplicate entries", () => {
  for (const frequency of ["daily", "weekly", "biweekly", "monthly"] as const) {
    const state = fixture();
    state.recurring = [
      {
        ...tx(),
        id: frequency,
        nextDate: "2020-01-01",
        frequency,
        anchorDay: 1,
        active: true,
        subscription: false,
      },
    ];
    const result = processRecurring(state, "2020-02-01");
    assert.equal(
      result.transactions.length,
      { daily: 32, weekly: 5, biweekly: 3, monthly: 2 }[frequency],
    );
    assert.deepEqual(processRecurring(result, "2020-02-01"), result);
  }
});

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
        opening: 10000,
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
      {
        id: "card",
        name: "Card",
        currency: "DOP",
        type: "credit",
        opening: -20000,
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
    ...overrides,
  };
}

test("money parses cents exactly, without floating point rounding", () => {
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("123.4"), 12340);
  // Spanish decimal comma; group separators stay invalid ("1,234" is ambiguous).
  assert.equal(cents("1,23"), 123);
  assert.equal(cents("12,5"), 1250);
  for (const input of ["-10", "1.001", "NaN", "1e5", "1,234", "1.234,56", "1,2,3", ""])
    assert.throws(() => cents(input));
});
test("dates reject impossible days and handle leap years", () => {
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2025-02-29"), false);
  assert.equal(validDate("2026-04-31"), false);
});
test("expense and income affect balances in opposite directions", () => {
  const state = saveTransaction(
    saveTransaction(fixture(), tx()),
    tx({ id: "salary", kind: "income", categoryId: "salary", amount: 10000 }),
  );
  assert.equal(accountBalance(state, "bank"), 107500);
});
test("editing replaces an existing entry rather than duplicating it", () => {
  let state = saveTransaction(fixture(), tx());
  state = saveTransaction(state, tx({ amount: 5000 }));
  assert.equal(state.transactions.length, 1);
  assert.equal(accountBalance(state, "bank"), 95000);
});
test("deleting an expense restores its effect on the account", () => {
  const state = saveTransaction(fixture(), tx());
  assert.equal(accountBalance({ ...state, transactions: [] }, "bank"), 100000);
});
test("transfers preserve same-currency total and are excluded from cash flow", () => {
  const state = saveTransaction(
    fixture(),
    tx({
      kind: "transfer",
      toAccountId: "cash",
      received: 2500,
      categoryId: "",
    }),
  );
  assert.equal(accountBalance(state, "bank"), 97500);
  assert.equal(accountBalance(state, "cash"), 12500);
  const result = totals(state, monthKey(), "DOP");
  assert.equal(result.balance, 90000);
  assert.equal(result.income, 0);
  assert.equal(result.expense, 0);
});
test("cross-currency transfers use explicit destination amount", () => {
  const state = saveTransaction(
    fixture(),
    tx({
      kind: "transfer",
      toAccountId: "usd",
      received: 4000,
      categoryId: "",
    }),
  );
  assert.equal(accountBalance(state, "usd"), 34000);
  assert.equal(accountBalance(state, "bank"), 97500);
});
test("invalid transfers cannot partially mutate state", () => {
  const state = fixture();
  for (const changes of [
    { toAccountId: "bank", received: 2500 },
    { toAccountId: "cash", received: 2600 },
    { toAccountId: "missing", received: 2500 },
    { toAccountId: "usd", received: 0 },
  ])
    assert.throws(() =>
      saveTransaction(state, tx({ kind: "transfer", ...changes })),
    );
  assert.equal(state.transactions.length, 0);
});
test("card payment reduces debt without becoming an expense", () => {
  const state = saveTransaction(
    fixture(),
    tx({
      kind: "transfer",
      toAccountId: "card",
      received: 2500,
      categoryId: "",
    }),
  );
  assert.equal(accountBalance(state, "card"), -17500);
  assert.equal(totals(state, monthKey(), "DOP").expense, 0);
});
test("budgets include only matching month, category, and currency", () => {
  let state = saveTransaction(fixture(), tx());
  state = saveTransaction(
    state,
    tx({ id: "dollars", accountId: "usd", amount: 5000 }),
  );
  state = saveTransaction(
    state,
    tx({ id: "other", categoryId: "home", amount: 3000 }),
  );
  assert.equal(
    spent(state, {
      id: "budget",
      categoryId: "food",
      currency: "DOP",
      month: monthKey(),
      limit: 10000,
    }),
    2500,
  );
});
test("referenced accounts cannot be removed", () => {
  const state = saveTransaction(fixture(), tx());
  assert.throws(() => removeAccount(state, "bank"));
  assert.equal(removeAccount(state, "cash").accounts.length, 3);
});
test("month-end schedules preserve the original day through February", () => {
  assert.equal(nextDate("2026-01-31", "monthly", 31), "2026-02-28");
  assert.equal(nextDate("2026-02-28", "monthly", 31), "2026-03-31");
  assert.equal(nextDate("2024-01-31", "monthly", 31), "2024-02-29");
});
test("recurring catch-up is idempotent and updates the next due date", () => {
  const state = fixture();
  state.recurring = [
    {
      ...tx(),
      id: "rent",
      nextDate: "2020-01-31",
      frequency: "monthly",
      anchorDay: 31,
      active: true,
      subscription: false,
    },
  ];
  const first = processRecurring(state, "2020-03-31");
  assert.equal(first.transactions.length, 3);
  assert.equal(first.recurring[0].nextDate, "2020-04-30");
  assert.deepEqual(processRecurring(first, "2020-03-31"), first);
});
test("paused recurring items do not post transactions", () => {
  const state = fixture();
  state.recurring = [
    {
      ...tx(),
      nextDate: "2020-01-01",
      frequency: "weekly",
      anchorDay: 1,
      active: false,
      subscription: false,
    },
  ];
  assert.equal(processRecurring(state).transactions.length, 0);
});
// One of every entity, as parseState fills it.
function fullState(): FinanceState {
  const state = fixture();
  const { id: _id, date: _date, ...template } = tx({ tags: ["home"] });
  return {
    ...state,
    transactions: [
      tx({ id: "t1", tags: [] }),
      tx({ id: "t2", kind: "transfer", toAccountId: "cash", received: 2500, categoryId: "", tags: [] }),
    ],
    budgets: [{ id: "b1", categoryId: "food", currency: "DOP", month: "2026-10-Q1", limit: 5000, rollover: true }],
    monthlyBudgets: [{ id: "m1", currency: "DOP", month: "2026-10", limit: 90000 }],
    recurring: [{ ...template, id: "r1", nextDate: "2099-01-31", frequency: "monthly", anchorDay: 31, active: true, subscription: false }],
    goals: [{ id: "g1", name: "Trip", currency: "USD", target: 100000, saved: 2000 }],
  };
}
test("validated backup round-trips every entity", () => {
  const state = parseState(fullState());
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(state))), state);
});
test("backup rejects unsupported versions, dangling references, duplicate IDs and budgets", () => {
  const state = fixture();
  assert.throws(() => parseState({ ...state, version: 3 }), /newer version/);
  assert.throws(() => parseState({ ...state, version: 0 }), /version 1 to 2/);
  assert.throws(() =>
    parseState({ ...state, transactions: [tx({ accountId: "missing" })] }),
  );
  assert.throws(() =>
    parseState({ ...state, accounts: [...state.accounts, state.accounts[0]] }),
  );
  const b = {
    id: "one",
    categoryId: "food",
    currency: "DOP",
    month: monthKey(),
    limit: 2000,
  };
  assert.throws(() =>
    parseState({ ...state, budgets: [b, { ...b, id: "two" }] }),
  );
});
test("invalid, zero, future and mismatched category entries are rejected", () => {
  for (const changes of [
    { amount: 0 },
    { amount: 1.1 },
    { date: "2999-01-01" },
    { categoryId: "salary" },
    { title: "" },
  ])
    assert.throws(() => saveTransaction(fixture(), tx(changes)));
});

test("old backups acquire preference defaults without inventing transaction times", () => {
  const state = saveTransaction(fixture(), tx());
  delete state.settings.numberEntry;
  delete state.settings.appIcon;
  delete state.settings.email;
  const restored = parseState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.settings.numberEntry, "decimal");
  assert.equal(restored.settings.appIcon, "graphite");
  assert.equal(restored.transactions[0].time, undefined);
});
test("recorded wall-clock time survives saving and backup restore", () => {
  const state = saveTransaction(fixture(), tx({ time: "23:59" }));
  assert.equal(
    parseState(JSON.parse(JSON.stringify(state))).transactions[0].time,
    "23:59",
  );
  assert.throws(() => saveTransaction(fixture(), tx({ time: "24:00" })));
});
test("number entry interprets cents explicitly without changing decimal behavior", () => {
  assert.equal(entryAmount("1250", "cents"), 1250);
  assert.equal(entryAmount("12.50", "decimal"), 1250);
  assert.equal(entryAmount("1250", "decimal"), 125000);
  assert.throws(() => entryAmount("12.50", "cents"));
  assert.throws(() => entryAmount("-1", "cents"));
});
test("custom recurrence advances, catches up once, and rejects invalid intervals", () => {
  const state = fixture();
  state.recurring = [
    {
      ...tx(),
      id: "custom-rule",
      frequency: "custom",
      intervalDays: 3,
      nextDate: "2020-01-01",
      anchorDay: 1,
      active: true,
      subscription: false,
    },
  ];
  const processed = processRecurring(state, "2020-01-10");
  assert.equal(processed.transactions.length, 4);
  assert.equal(processed.recurring[0].nextDate, "2020-01-13");
  assert.deepEqual(processRecurring(processed, "2020-01-10"), processed);
  assert.equal(
    nextFutureDate("2020-01-01", "custom", 1, "2020-01-10", 3),
    "2020-01-13",
  );
  assert.throws(() => nextDate("2020-01-01", "custom", 1, 0));
  delete state.recurring[0].intervalDays;
  assert.throws(() => parseState(state));
});
test("reports isolate categories, recurring records and currency", () => {
  let state = saveTransaction(
    fixture(),
    tx({ id: "one", amount: 100, recurringId: "rule" }),
  );
  state = saveTransaction(state, tx({ id: "two", amount: 200 }));
  const range = { from: "2000-01-01", to: today() };
  assert.equal(reportEntries(state, "DOP", range, "all").length, 2);
  assert.equal(reportEntries(state, "DOP", range, "recurring").length, 1);
  assert.equal(reportEntries(state, "USD", range, "all").length, 0);
  assert.equal(
    reportEntries(state, "DOP", range, "category", "missing").length,
    0,
  );
  assert.equal(weekStart("2026-01-01"), "2025-12-29");
});
test("upcoming entries are projections, exclude paused rules and never change balances", () => {
  const state = fixture();
  const start = nextDate(today(), "daily", 1);
  const end = new Date(`${start}T12:00:00`);
  end.setDate(end.getDate() + 6);
  state.recurring = [
    {
      ...tx(),
      id: "projection",
      frequency: "custom",
      intervalDays: 3,
      nextDate: start,
      anchorDay: 1,
      active: true,
      subscription: false,
    },
  ];
  const before = JSON.stringify(state);
  assert.equal(
    reportEntries(
      state,
      "DOP",
      { from: start, to: dateString(end) },
      "upcoming",
    ).length,
    3,
  );
  assert.equal(JSON.stringify(state), before);
  state.recurring[0].active = false;
  assert.equal(
    reportEntries(
      state,
      "DOP",
      { from: start, to: dateString(end) },
      "upcoming",
    ).length,
    0,
  );
});

test("new users start without starter categories", () => {
  assert.deepEqual(emptyState().categories, []);
});

test("a ledger saved with the removed sample data keeps only preferences", () => {
  const saved = { ...fullState(), demo: true };
  saved.settings = { ...saved.settings, name: "Ana", language: "es" };
  const state = parseState(saved);
  assert.deepEqual(
    [state.accounts, state.categories, state.transactions, state.budgets, state.recurring, state.goals],
    [[], [], [], [], [], []],
  );
  assert.equal(state.settings.onboarded, false);
  assert.equal(state.settings.name, "Ana");
  assert.equal("demo" in state, false);
});

test("unused, untouched starter categories are dropped from saved data", () => {
  const state = fixture();
  const custom = {
    id: "pets",
    name: "Pets",
    icon: "heart",
    color: "#555B65",
    kind: "expense" as const,
  };
  const renamed = { ...defaultCategories[1], name: "Clothes" };
  const result = withoutUnusedDefaults({
    ...state,
    categories: [
      ...defaultCategories.filter((c) => c.id !== renamed.id),
      renamed,
      custom,
    ],
    budgets: [
      {
        id: "b",
        categoryId: "food",
        limit: 1000,
        month: "2026-10",
        currency: "DOP",
      },
    ],
    transactions: [],
    recurring: [],
  });
  assert.deepEqual(result.categories.map((c) => c.id).sort(), [
    "food",
    "pets",
    "shopping",
  ]);
});
