import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyImport,
  buildImport,
  detectColumns,
  guessDateFormat,
  parseAmount,
  parseCsv,
  parseDate,
  type ColumnMapping,
} from "../src/features/finance/csv.ts";
import {
  defaultCategories,
  emptyState,
  saveTransaction,
  type FinanceState,
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
        opening: 0,
        color: "#548B75",
      },
    ],
  };
}
const target = {
  accountId: "bank",
  expenseCategoryId: "food",
  incomeCategoryId: "salary",
};

test("parseCsv handles BOM, quotes, embedded delimiters, newlines and CRLF", () => {
  const text =
    '﻿Date,Description,Amount\r\n2024-01-02,"Coffee, large",-1.50\r\n2024-01-03,"Line one\r\nline two",2\r\n2024-01-04,"Say ""hi""",3\r\n\r\n';
  assert.deepEqual(parseCsv(text), [
    ["Date", "Description", "Amount"],
    ["2024-01-02", "Coffee, large", "-1.50"],
    ["2024-01-03", "Line one\r\nline two", "2"],
    ["2024-01-04", 'Say "hi"', "3"],
  ]);
  assert.deepEqual(parseCsv('a;b;c\n1,5;"x;y";3\n'), [
    ["a", "b", "c"],
    ["1,5", "x;y", "3"],
  ]);
  assert.deepEqual(parseCsv("a,b\n,\n1,"), [
    ["a", "b"],
    ["1", ""],
  ]);
  assert.deepEqual(parseCsv(""), []);
  assert.deepEqual(parseCsv('x\n"unterminated'), [["x"], ["unterminated"]]);
});
test("detectColumns understands English and Spanish headers", () => {
  assert.deepEqual(detectColumns(["Fecha", "Descripción", "Monto"]), {
    date: 0,
    description: 1,
    amount: 2,
  });
  assert.deepEqual(
    detectColumns(["Fecha Valor", "Concepto", "Débito", "Crédito", "Balance"]),
    {
      date: 0,
      description: 1,
      debit: 2,
      credit: 3,
    },
  );
  assert.deepEqual(
    detectColumns(["Transaction Date", "Details", "Amount (USD)"]),
    {
      date: 0,
      description: 1,
      amount: 2,
    },
  );
  assert.deepEqual(detectColumns(["FECHA", "DESCRIPCION", "IMPORTE"]), {
    date: 0,
    description: 1,
    amount: 2,
  });
  assert.deepEqual(detectColumns(["foo", "bar"]), {});
});
test("parseAmount handles separators, currency symbols and negatives", () => {
  const cases: [string, number | undefined][] = [
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["1234.5", 123450],
    ["12,5", 1250],
    ["1,234", 123400],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["1,234,567.89", 123456789],
    ["RD$ 1,500.00", 150000],
    ["US$25", 2500],
    ["$-3.10", -310],
    ["-RD$1,000", -100000],
    ["(45.20)", -4520],
    ["100.00-", -10000],
    ["+7", 700],
    ["1 234,50", 123450],
    ["0", 0],
    ["", undefined],
    ["abc", undefined],
    ["1.2.3", undefined],
    ["12.345,6.7", undefined],
    ["1.001,5,5", undefined],
    ["1.005", 100500],
    ["1.0055", undefined],
    ["12,34,56", undefined],
    ["5.", undefined],
  ];
  for (const [input, expected] of cases)
    assert.equal(parseAmount(input), expected, input);
});
test("parseDate and guessDateFormat cover common bank formats", () => {
  assert.equal(parseDate("2024-02-29", "YYYY-MM-DD"), "2024-02-29");
  assert.equal(parseDate("2024/2/9", "YYYY-MM-DD"), "2024-02-09");
  assert.equal(parseDate("05/03/2024", "DD/MM/YYYY"), "2024-03-05");
  assert.equal(parseDate("05-03-2024", "MM/DD/YYYY"), "2024-05-03");
  assert.equal(parseDate("5/3/24", "DD/MM/YYYY"), "2024-03-05");
  assert.equal(parseDate("2024-01-05 10:22:00", "YYYY-MM-DD"), "2024-01-05");
  assert.equal(parseDate("2024-01-05T10:22:00Z", "YYYY-MM-DD"), "2024-01-05");
  assert.equal(parseDate("31/02/2024", "DD/MM/YYYY"), undefined);
  assert.equal(parseDate("2024-13-01", "YYYY-MM-DD"), undefined);
  assert.equal(parseDate("hello", "YYYY-MM-DD"), undefined);
  assert.equal(guessDateFormat(["2024-01-02", "2024-12-31"]), "YYYY-MM-DD");
  assert.equal(guessDateFormat(["01/02/2024", "25/12/2024"]), "DD/MM/YYYY");
  assert.equal(guessDateFormat(["01/02/2024", "12/25/2024"]), "MM/DD/YYYY");
  assert.equal(guessDateFormat(["01/02/2024"]), "DD/MM/YYYY");
  assert.equal(guessDateFormat(["", "x"]), undefined);
  assert.equal(guessDateFormat([]), undefined);
});
const mapping: ColumnMapping = {
  date: 0,
  description: 1,
  amount: 2,
  dateFormat: "DD/MM/YYYY",
};

test("buildImport classifies signed amounts and reports invalid rows", () => {
  const rows = parseCsv(
    'Fecha,Descripción,Monto\n02/01/2024,Supermercado,"-1.250,00"\n03/01/2024,Nómina,"50.000,00"\n31/02/2024,Bad date,-5\n04/01/2024,,-5\n05/01/2024,No amount,abc\n06/01/2024,Zero,0\n01/01/2999,Future,-1\n',
  ).slice(1);
  const result = buildImport(rows, mapping, target, fixture());
  const [expense, income, ...invalid] = result;
  assert.ok(expense.ok && income.ok);
  assert.equal(expense.transaction.kind, "expense");
  assert.equal(expense.transaction.amount, 125000);
  assert.equal(expense.transaction.categoryId, "food");
  assert.equal(expense.transaction.date, "2024-01-02");
  assert.equal(income.transaction.kind, "income");
  assert.equal(income.transaction.categoryId, "salary");
  assert.equal(expense.duplicate, false);
  assert.deepEqual(
    invalid.map((r) => (r.ok ? "ok" : r.reason)),
    [
      "Invalid or missing date.",
      "Missing description.",
      "Invalid amount.",
      "Amount is zero.",
      "The date is in the future.",
    ],
  );
  assert.deepEqual(
    invalid.map((r) => r.index),
    [2, 3, 4, 5, 6],
  );
  assert.throws(() =>
    buildImport(rows, mapping, { ...target, accountId: "missing" }, fixture()),
  );
  const wrongCategory = buildImport(
    rows.slice(0, 1),
    mapping,
    { ...target, expenseCategoryId: "salary" },
    fixture(),
  );
  assert.equal(wrongCategory[0].ok, false);
});
test("debit and credit columns decide the kind", () => {
  const rows = [
    ["2024-01-02", "Card", "100.00", ""],
    ["2024-01-03", "Deposit", "", "250.00"],
    ["2024-01-04", "Both", "1", "2"],
    ["2024-01-05", "Neither", "", ""],
    ["2024-01-06", "Negative debit", "-30", ""],
  ];
  const result = buildImport(
    rows,
    { date: 0, description: 1, debit: 2, credit: 3, dateFormat: "YYYY-MM-DD" },
    target,
    fixture(),
  );
  assert.deepEqual(
    result.map((r) =>
      r.ok ? `${r.transaction.kind}:${r.transaction.amount}` : r.reason,
    ),
    [
      "expense:10000",
      "income:25000",
      "Row has both a debit and a credit.",
      "Amount is zero.",
      "expense:3000",
    ],
  );
});
test("re-importing the same file is flagged as duplicate, including identical rows", () => {
  const rows = [
    ["02/01/2024", "Coffee", "-100"],
    ["02/01/2024", "Coffee", "-100"],
    ["03/01/2024", "Taxi", "-250"],
  ];
  const first = buildImport(rows, mapping, target, fixture());
  assert.ok(first.every((r) => r.ok && !r.duplicate));
  const ids = first.map((r) => (r.ok ? r.transaction.importId : ""));
  assert.equal(new Set(ids).size, 3);
  const { state, added } = applyImport(fixture(), first);
  assert.equal(added, 3);
  assert.doesNotThrow(() => parseState(JSON.parse(JSON.stringify(state))));
  const second = buildImport(rows, mapping, target, state);
  assert.ok(second.every((r) => r.ok && r.duplicate));
  assert.equal(applyImport(state, second).added, 0);
  assert.equal(applyImport(state, second, true).added, 3);
  const extended = buildImport(
    [...rows, ["02/01/2024", "Coffee", "-100"]],
    mapping,
    target,
    state,
  );
  assert.deepEqual(
    extended.map((r) => r.ok && r.duplicate),
    [true, true, true, false],
  );
});
test("manual entries with the same account, date, amount and title are duplicates", () => {
  const state = saveTransaction(fixture(), {
    id: "manual",
    kind: "expense",
    accountId: "bank",
    amount: 4550,
    categoryId: "home",
    title: "  Farmacia  CAROL ",
    note: "",
    date: "2024-01-02",
  });
  const rows = [
    ["02/01/2024", "farmacia carol", "-45.50"],
    ["02/01/2024", "Farmacia Carol", "-45.50"],
    ["02/01/2024", "Farmacia Carol", "45.50"],
    ["03/01/2024", "Farmacia Carol", "-45.50"],
  ];
  assert.deepEqual(
    buildImport(rows, mapping, target, state).map((r) => r.ok && r.duplicate),
    [true, false, false, false],
  );
});
