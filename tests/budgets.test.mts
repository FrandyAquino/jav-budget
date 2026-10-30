import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableState,
  budgetStatus,
  categoryInUse,
  formatAmountInput,
  netWorth,
  parseAmountInput,
  copyBudgets,
  defaultCategories,
  emptyState,
  monthlyBudget,
  monthlyBudgetStatus,
  periodKey,
  periodRange,
  saveTransaction,
  shiftPeriod,
  validPeriod,
  setMonthlyBudget,
  type Budget,
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
let n = 0;
function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: `t${n++}`,
    kind: "expense",
    accountId: "bank",
    amount: 1000,
    categoryId: "food",
    title: "Groceries",
    note: "",
    date: "2020-02-10",
    ...overrides,
  };
}
const budget = (overrides: Partial<Budget>): Budget => ({
  id: `b-${overrides.month ?? "2020-02"}-${overrides.categoryId ?? "food"}`,
  categoryId: "food",
  currency: "DOP",
  month: "2020-02",
  limit: 10000,
  rollover: false,
  ...overrides,
});

test("rollover carries last month's surplus and overspending", () => {
  let state = fixture();
  state = saveTransaction(state, tx({ date: "2020-01-05", amount: 4000 }));
  state = saveTransaction(state, tx({ date: "2020-02-05", amount: 3000 }));
  const jan = budget({ month: "2020-01" });
  const feb = budget({ rollover: true });
  state.budgets = [jan, feb];
  assert.deepEqual(budgetStatus(state, feb), {
    limit: 10000,
    spent: 3000,
    carried: 6000,
    available: 13000,
    progress: 3000 / 16000,
    over: false,
  });
  assert.equal(budgetStatus(state, { ...feb, rollover: false }).carried, 0);
  state = saveTransaction(state, tx({ date: "2020-01-06", amount: 12000 }));
  const overspent = budgetStatus(state, feb);
  assert.equal(overspent.carried, -6000);
  assert.equal(overspent.available, 1000);
  assert.equal(budgetStatus(state, jan).over, true);
});
test("rollover looks back only one month and only at the same category and currency", () => {
  let state = fixture();
  state = saveTransaction(state, tx({ date: "2019-12-05", amount: 500 }));
  const dec = budget({ month: "2019-12" });
  const feb = budget({ rollover: true });
  const janOther = budget({ month: "2020-01", categoryId: "home" });
  const janUsd = budget({ month: "2020-01", currency: "USD", id: "usd" });
  state.budgets = [dec, feb, janOther, janUsd];
  assert.equal(budgetStatus(state, feb).carried, 0);
  const jan = budget({ month: "2020-01", rollover: true });
  state.budgets.push(jan);
  // February carries January's own remainder only, not December's.
  assert.equal(budgetStatus(state, feb).carried, 10000);
  assert.equal(budgetStatus(state, jan).carried, 9500);
});
test("zero available with spending reports full progress", () => {
  let state = saveTransaction(
    fixture(),
    tx({ date: "2020-01-05", amount: 10000 }),
  );
  state = saveTransaction(state, tx({ amount: 500 }));
  state.budgets = [budget({ month: "2020-01" }), budget({ rollover: true })];
  const status = budgetStatus(state, state.budgets[1]);
  assert.equal(status.progress, 0.05);
  state.budgets[1].limit = 1;
  state = saveTransaction(state, tx({ date: "2020-01-07", amount: 1 }));
  assert.equal(budgetStatus(state, state.budgets[1]).progress, 1);
});
test("overall budget caps every expense category for one month and currency", () => {
  let state = fixture();
  state = saveTransaction(state, tx({ amount: 1000 }));
  state = saveTransaction(state, tx({ categoryId: "home", amount: 2000 }));
  state = saveTransaction(state, tx({ accountId: "usd", amount: 9999 }));
  state = saveTransaction(
    state,
    tx({ kind: "income", categoryId: "salary", amount: 50000 }),
  );
  state = saveTransaction(state, tx({ date: "2020-03-01", amount: 7000 }));
  state.budgets = [budget({ limit: 4000 })];
  state = setMonthlyBudget(state, "2020-02", "DOP", 10000);
  const overall = monthlyBudget(state, "2020-02", "DOP")!;
  assert.deepEqual(monthlyBudgetStatus(state, overall), {
    limit: 10000,
    spent: 3000,
    carried: 0,
    available: 7000,
    progress: 0.3,
    over: false,
    allocated: 4000,
    unallocated: 6000,
  });
  const updated = setMonthlyBudget(state, "2020-02", "DOP", 2000);
  assert.equal(updated.monthlyBudgets.length, 1);
  assert.equal(updated.monthlyBudgets[0].id, overall.id);
  assert.equal(
    monthlyBudgetStatus(updated, updated.monthlyBudgets[0]).over,
    true,
  );
  assert.equal(
    setMonthlyBudget(state, "2020-02", "DOP", null).monthlyBudgets.length,
    0,
  );
  assert.equal(
    setMonthlyBudget(state, "2020-02", "USD", 100).monthlyBudgets.length,
    2,
  );
  assert.throws(() => setMonthlyBudget(state, "2020-02", "DOP", 0));
  assert.throws(() => setMonthlyBudget(state, "2020-2", "DOP", 10));
  assert.deepEqual(
    parseState(JSON.parse(JSON.stringify(state))).monthlyBudgets,
    state.monthlyBudgets,
  );
});
test("copyBudgets copies only missing category and overall budgets", () => {
  let state = fixture();
  state.budgets = [
    budget({ month: "2020-01", rollover: true }),
    budget({ month: "2020-01", categoryId: "home", limit: 5000 }),
    budget({ month: "2020-01", currency: "USD", id: "usd-jan" }),
    budget({ month: "2020-02", categoryId: "home", limit: 7000 }),
  ];
  state = setMonthlyBudget(state, "2020-01", "DOP", 50000);
  state = setMonthlyBudget(state, "2020-01", "USD", 900);
  state = setMonthlyBudget(state, "2020-02", "USD", 1200);
  const result = copyBudgets(state, "2020-01", "2020-02");
  assert.equal(result.copied, 3);
  const feb = result.state.budgets.filter((b) => b.month === "2020-02");
  assert.equal(feb.length, 3);
  assert.equal(feb.find((b) => b.categoryId === "home")?.limit, 7000);
  assert.equal(
    feb.find((b) => b.categoryId === "food" && b.currency === "DOP")?.rollover,
    true,
  );
  assert.equal(monthlyBudget(result.state, "2020-02", "DOP")?.limit, 50000);
  assert.equal(monthlyBudget(result.state, "2020-02", "USD")?.limit, 1200);
  assert.equal(
    new Set(result.state.budgets.map((b) => b.id)).size,
    result.state.budgets.length,
  );
  assert.doesNotThrow(() => parseState(result.state));
  const again = copyBudgets(result.state, "2020-01", "2020-02");
  assert.equal(again.copied, 0);
  assert.equal(again.state, result.state);
  assert.equal(copyBudgets(state, "2020-01", "2020-01").copied, 0);
  assert.throws(() => copyBudgets(state, "bad", "2020-02"));
});

test("half-month periods cover days 1-15 and 16 to the month end", () => {
  assert.equal(periodKey("biweekly", "2024-02-15"), "2024-02-Q1");
  assert.equal(periodKey("biweekly", "2024-02-16"), "2024-02-Q2");
  assert.equal(periodKey("monthly", "2024-02-16"), "2024-02");
  assert.deepEqual(periodRange("2024-02-Q2"), { from: "2024-02-16", to: "2024-02-29" });
  assert.deepEqual(periodRange("2024-02"), { from: "2024-02-01", to: "2024-02-29" });
  assert.equal(shiftPeriod("2024-12-Q2", 1), "2025-01-Q1");
  assert.equal(shiftPeriod("2025-01-Q1", -1), "2024-12-Q2");
  assert.equal(shiftPeriod("2025-01-Q1", -3), "2024-11-Q2");
  assert.ok(validPeriod("2025-01-Q2") && !validPeriod("2025-01-Q3"));
});

test("half-month budgets count only their own days and roll over from the previous half", () => {
  const state: FinanceState = {
    ...fixture(),
    transactions: [
      tx({ date: "2020-02-10", amount: 3000 }),
      tx({ date: "2020-02-20", amount: 5000 }),
    ],
    budgets: [
      budget({ id: "q1", month: "2020-02-Q1", limit: 4000 }),
      budget({ id: "q2", month: "2020-02-Q2", limit: 4000, rollover: true }),
    ],
  };
  assert.equal(budgetStatus(state, state.budgets[0]).spent, 3000);
  const second = budgetStatus(state, state.budgets[1]);
  assert.equal(second.spent, 5000);
  assert.equal(second.carried, 1000);
  assert.equal(second.over, false);
  assert.equal(parseState(state).budgets.length, 2);
  const copied = copyBudgets(state, "2020-02-Q2", "2020-03-Q1");
  assert.equal(copied.state.budgets.at(-1)?.month, "2020-03-Q1");
});

test("amount inputs group thousands while keeping the canonical text", () => {
  assert.equal(formatAmountInput("1234567.5", "decimal"), "1,234,567.5");
  assert.equal(formatAmountInput("0.", "decimal"), "0.");
  assert.equal(parseAmountInput("1,234,567.5", "decimal"), "1234567.5");
  assert.equal(parseAmountInput("1,2345", "decimal"), "12345");
  assert.equal(parseAmountInput("12,", "decimal"), "12.");
  assert.equal(parseAmountInput("12,50", "decimal"), "12.50");
  assert.equal(parseAmountInput("1,234", "decimal"), "1234");
  assert.equal(parseAmountInput("0012.345", "decimal"), "12.34");
  assert.equal(parseAmountInput(".5", "decimal"), "0.5");
  assert.equal(formatAmountInput("123456", "cents"), "1,234.56");
  assert.equal(formatAmountInput("5", "cents"), "0.05");
  assert.equal(parseAmountInput("1,234.5", "cents"), "12345");
  assert.equal(parseAmountInput("0.0", "cents"), "");
});

test("transfers accept only transfer categories and count as category usage", () => {
  const savings = { id: "savings", name: "Savings", icon: "box", color: "#356C56", kind: "transfer" as const };
  const state: FinanceState = {
    ...fixture(),
    accounts: [...fixture().accounts, { id: "save", name: "Save", currency: "DOP", type: "bank", opening: 0, color: "#356C56", excludeFromTotal: true }],
    categories: [...defaultCategories, savings],
  };
  const move = tx({ kind: "transfer", accountId: "bank", toAccountId: "save", received: 1000, categoryId: "savings", title: "To savings" });
  const saved = saveTransaction(state, move);
  assert.equal(saved.transactions[0].categoryId, "savings");
  assert.ok(categoryInUse(saved, "savings"));
  assert.throws(() => saveTransaction(state, { ...move, categoryId: "food" }));
  assert.equal(saveTransaction(state, { ...move, categoryId: "" }).transactions[0].categoryId, "");
  assert.equal(netWorth(availableState(saved), "DOP").byCurrency.DOP, 99000);
  assert.equal(netWorth(saved, "DOP").byCurrency.DOP, 100000);
  assert.equal(parseState(saved).accounts[2].excludeFromTotal, true);
});
