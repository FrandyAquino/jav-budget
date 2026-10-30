// Regression tests for the review findings (stored dates, starter categories,
// CSV parsing, number entry, receipts, storage recovery, app lock).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amountText,
  dateString,
  defaultCategories,
  emptyState,
  entryAmount,
  pruneStarterCategoriesOnce,
  saveTransaction,
  today,
  type FinanceState,
  type Transaction,
} from "../src/features/finance/model.ts";
import { parseState } from "../src/features/finance/schema.ts";
import {
  isHeaderRow,
  parseAmount,
  parseDate,
} from "../src/features/finance/csv.ts";
import {
  isReceiptName,
  orphanReceipts,
  receiptName,
} from "../src/features/transactions/receipt-names.ts";
import {
  keepRecoveryCopy,
  optimisticUpdate,
  RECOVERY_KEY,
} from "../src/features/finance/storage/shared.ts";
import { lockExpired, LOCK_GRACE_MS } from "../src/shared/app-lock.ts";

function fixture(): FinanceState {
  return {
    ...emptyState(),
    accounts: [
      {
        id: "cash",
        name: "Cash",
        type: "cash",
        currency: "DOP",
        opening: 0,
        color: "#555B65",
      },
    ],
    categories: defaultCategories.map((c) => ({ ...c })),
  };
}
const tx = (changes: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  kind: "expense",
  amount: 1000,
  accountId: "cash",
  categoryId: "food",
  title: "Lunch",
  note: "",
  date: today(),
  tags: [],
  ...changes,
});
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return dateString(d);
};

test("stored transactions dated after today still load; user entry rejects them", () => {
  const state = { ...fixture(), transactions: [tx({ date: tomorrow() })] };
  const loaded = parseState(JSON.parse(JSON.stringify(state)));
  assert.equal(loaded.transactions[0].date, tomorrow());
  assert.throws(() => saveTransaction(fixture(), tx({ date: tomorrow() })));
  // Date validity is still enforced for stored data.
  assert.throws(() =>
    parseState({ ...state, transactions: [tx({ date: "2026-02-30" })] }),
  );
});

test("starter category cleanup runs once and is persisted", () => {
  const old = JSON.parse(JSON.stringify(fixture()));
  delete old.starterPruned;
  const parsed = parseState(old);
  assert.equal(parsed.starterPruned, false);
  const pruned = parseState(pruneStarterCategoriesOnce(parsed));
  assert.deepEqual(pruned.categories, []);
  assert.equal(pruned.starterPruned, true);
  // Later launches never remove anything, even starter-looking categories.
  const recreated = { ...pruned, categories: [{ ...defaultCategories[0] }] };
  assert.equal(pruneStarterCategoriesOnce(recreated), recreated);
  assert.equal(emptyState().starterPruned, true);
});

test("a headerless CSV row with header-like words is data", () => {
  assert.equal(isHeaderRow(["15/01/2026", "Total payment", "500.00"]), false);
  assert.equal(isHeaderRow(["Cargo", "Total", "1,250.00"]), false);
  assert.equal(isHeaderRow(["Fecha", "Descripción", "Monto"]), true);
});

test("amounts with a zero thousands group are invalid, not grouped", () => {
  assert.equal(parseAmount("0.001"), undefined);
  assert.equal(parseAmount("0,500"), undefined);
  assert.equal(parseAmount("0,500.25"), undefined);
  assert.equal(parseAmount("1,500"), 150000);
  assert.equal(parseAmount("1.500"), 150000);
  assert.equal(parseAmount("0.50"), 50);
});

test("two-digit years use 19yy when 20yy would be in the future", () => {
  const yy = Number(today().slice(2, 4));
  const past = String((yy + 1) % 100).padStart(2, "0");
  assert.equal(parseDate("01/02/05", "DD/MM/YYYY"), "2005-02-01");
  if (yy < 99)
    assert.equal(parseDate(`01/02/${past}`, "DD/MM/YYYY"), `19${past}-02-01`);
});

test("amount inputs follow the digits-as-cents setting", () => {
  assert.equal(entryAmount("1250", "cents"), 1250);
  assert.equal(entryAmount("12.50", "decimal"), 1250);
  assert.equal(amountText(1250, "cents"), "1250");
  assert.equal(amountText(1250, "decimal"), "12.5");
  // Opening balances and goal progress may be zero.
  assert.equal(entryAmount("0", "cents", true), 0);
  assert.throws(() => entryAmount("0", "cents"));
});

test("receipt names are strict and orphans are found", () => {
  for (const bad of [".", "..", "a/b", "..jpg", "%2e%2e", ""])
    assert.equal(isReceiptName(bad), false, bad);
  assert.equal(isReceiptName("mabc12-x9f3.jpg"), true);
  assert.equal(receiptName("file:///doc/receipts/.."), undefined);
  assert.equal(receiptName("file:///doc/receipts/abc-1.png"), "abc-1.png");
  const state = {
    transactions: [tx({ receipt: "file:///old/container/receipts/keep-1.jpg" })],
  };
  assert.deepEqual(orphanReceipts(["keep-1.jpg", "gone-2.jpg", ".."], state), [
    "gone-2.jpg",
  ]);
});

test("unreadable data is copied to the recovery key without clobbering", async () => {
  const store = new Map<string, string>();
  const kv = {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
  };
  await keepRecoveryCopy(kv, "broken-1");
  await keepRecoveryCopy(kv, "broken-1");
  assert.equal(store.get(RECOVERY_KEY), "broken-1");
  assert.equal(store.size, 1);
  await keepRecoveryCopy(kv, "broken-2");
  assert.equal(store.get(RECOVERY_KEY), "broken-1");
  assert.equal(store.size, 2);
});

test("optimistic writes retry against a value another tab changed", async () => {
  let stored = "1";
  let reads = 0;
  const read = async () => {
    reads++;
    // Another tab writes between our first read and the check.
    if (reads === 2) stored = "10";
    return stored;
  };
  const result = await optimisticUpdate(
    read,
    async (v) => void (stored = v),
    (raw) => {
      const next = String(Number(raw) + 1);
      return { result: next, data: next };
    },
  );
  assert.equal(result, "11");
  assert.equal(stored, "11");
  // Constant conflicts give up instead of overwriting.
  let n = 0;
  await assert.rejects(
    optimisticUpdate(
      async () => String(n++),
      async () => assert.fail("must not write"),
      (raw) => ({ result: raw, data: `${raw}!` }),
      3,
    ),
  );
});

test("the app lock only engages after the grace period", () => {
  const start = 1_000_000;
  assert.equal(lockExpired(undefined, start), false);
  assert.equal(lockExpired(start, start + 5_000), false);
  assert.equal(lockExpired(start, start + LOCK_GRACE_MS), true);
});
