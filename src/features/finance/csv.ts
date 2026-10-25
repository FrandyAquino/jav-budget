import {
  getLanguage,
  translate,
  type Language,
} from "../../shared/i18n/core.ts";
import { today, validDate } from "./dates.ts";
import { id, validateTransaction } from "./transactions.ts";
import type { FinanceState, Transaction } from "./types.ts";

export type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";
export type ColumnMapping = {
  date: number;
  description: number;
  amount?: number; // Signed: negative = expense, positive = income.
  debit?: number; // Used instead of amount when debit or credit is set.
  credit?: number;
  dateFormat: DateFormat;
};
export type ImportTarget = {
  accountId: string;
  expenseCategoryId: string;
  incomeCategoryId: string;
};
export type ImportCandidate =
  | { ok: true; index: number; transaction: Transaction; duplicate: boolean }
  | { ok: false; index: number; reason: string };

function detectDelimiter(text: string): "," | ";" {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch === ",") commas++;
    else if (!quoted && ch === ";") semicolons++;
  }
  return semicolons > commas ? ";" : ",";
}
// RFC 4180-style parser; drops blank lines.
export function parseCsv(input: string, delimiter = detectDelimiter(input)) {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && !field.trim()) {
      field = "";
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += ch;
  }
  if (field || row.length) endRow();
  return rows;
}
function normalizeHeader(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const headerWords = {
  date: ["fecha", "date", "posting date", "fecha transaccion", "dia"],
  description: [
    "descripcion",
    "description",
    "concepto",
    "detalle",
    "details",
    "memo",
    "narrative",
    "payee",
    "beneficiario",
    "comercio",
    "merchant",
    "referencia",
    "reference",
  ],
  debit: [
    "debito",
    "debit",
    "debitos",
    "cargo",
    "cargos",
    "retiro",
    "retiros",
    "withdrawal",
    "withdrawals",
    "money out",
    "paid out",
  ],
  credit: [
    "credito",
    "credit",
    "creditos",
    "abono",
    "abonos",
    "deposito",
    "depositos",
    "deposit",
    "deposits",
    "money in",
    "paid in",
  ],
  amount: ["monto", "importe", "amount", "valor", "value", "cantidad", "total"],
} as const;
function findColumn(
  headers: string[],
  words: readonly string[],
  taken: Set<number>,
) {
  for (const word of words) {
    const exact = headers.findIndex((h, i) => !taken.has(i) && h === word);
    if (exact >= 0) return exact;
  }
  for (const word of words) {
    const partial = headers.findIndex(
      (h, i) => !taken.has(i) && ` ${h} `.includes(` ${word} `),
    );
    if (partial >= 0) return partial;
  }
  return undefined;
}
// Guesses columns from English or Spanish headers; dateFormat comes from guessDateFormat.
export function detectColumns(header: string[]): Partial<ColumnMapping> {
  const headers = header.map(normalizeHeader);
  const taken = new Set<number>();
  const result: Partial<ColumnMapping> = {};
  for (const key of [
    "date",
    "debit",
    "credit",
    "amount",
    "description",
  ] as const) {
    if (
      key === "amount" &&
      (result.debit !== undefined || result.credit !== undefined)
    )
      continue;
    const index = findColumn(headers, headerWords[key], taken);
    if (index === undefined) continue;
    result[key] = index;
    taken.add(index);
  }
  return result;
}
// Returns signed cents, or undefined when the text is not an amount.
export function parseAmount(input: string): number | undefined {
  let text = input.replace(/[\s ]/g, "");
  if (!text) return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text
    .replace(/^(USD|DOP|RD|US)?\$?/i, "")
    .replace(/(RD\$|US\$|\$|USD|DOP)$/i, "");
  if (/^[-−]/.test(text)) {
    negative = !negative;
    text = text.slice(1);
  } else if (/[-−]$/.test(text)) {
    negative = !negative;
    text = text.slice(0, -1);
  } else if (text.startsWith("+")) text = text.slice(1);
  text = text.replace(/^(USD|DOP|RD|US)?\$?/i, "");
  if (!/^\d[\d.,]*$/.test(text) || /[.,]$/.test(text)) return undefined;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let decimal: "," | "." | "" = "";
  if (lastComma >= 0 && lastDot >= 0) decimal = lastComma > lastDot ? "," : ".";
  // Grouping never starts with 0: "0.001" / "0,500" are 3-decimal values
  // (rejected below), not 1 and 500.
  else if (lastComma >= 0)
    decimal = /^[1-9]\d{0,2}(,\d{3})+$/.test(text) ? "" : ",";
  else if (lastDot >= 0)
    decimal = /^[1-9]\d{0,2}(\.\d{3})+$/.test(text) ? "" : ".";
  const thousands =
    decimal === "," ? "." : decimal === "." ? "," : /,/.test(text) ? "," : ".";
  const [whole, fraction = "", extra] = (
    decimal ? text.split(decimal) : [text]
  ) as (string | undefined)[];
  if (extra !== undefined || fraction.length > 2 || !whole) return undefined;
  if (whole.includes(decimal || "\0")) return undefined;
  const groups = whole.split(thousands);
  if (groups.length > 1 && !/^[1-9]\d{0,2}$/.test(groups[0])) return undefined;
  if (groups.slice(1).some((g) => !/^\d{3}$/.test(g))) return undefined;
  const digits = groups.join("");
  if (!/^\d+$/.test(digits) || (fraction && !/^\d+$/.test(fraction)))
    return undefined;
  const value = Number(digits) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(value)) return undefined;
  return negative && value ? -value : value;
}
// Returns YYYY-MM-DD, or undefined. Accepts "/", "-" or "." separators and a trailing time.
export function parseDate(
  input: string,
  format: DateFormat,
): string | undefined {
  const text = input.trim().split(/[\sT]/)[0];
  const parts = text.split(/[/.-]/);
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p)))
    return undefined;
  let [y, m, d] =
    format === "YYYY-MM-DD"
      ? parts
      : format === "DD/MM/YYYY"
        ? [parts[2], parts[1], parts[0]]
        : [parts[2], parts[0], parts[1]];
  if (
    format === "YYYY-MM-DD" ? y.length !== 4 : y.length !== 4 && y.length !== 2
  )
    return undefined;
  if (m.length > 2 || d.length > 2) return undefined;
  const day = `${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  // Two-digit years are 20yy unless that lands in the future, then 19yy.
  if (y.length === 2) y = `20${y}-${day}` > today() ? `19${y}` : `20${y}`;
  const date = `${y}-${day}`;
  return validDate(date) ? date : undefined;
}
// Row 0 is a header only when no cell holds a value: a headerless file whose
// first row has a header-like word ("Total", "Cargo") must keep that row.
export function isHeaderRow(row: readonly string[]) {
  return !row.some(
    (cell) =>
      !!cell.trim() &&
      (parseAmount(cell) !== undefined ||
        (["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] as const).some((f) =>
          parseDate(cell, f),
        )),
  );
}
// Picks the first format that parses every sample; DD/MM wins ties over MM/DD.
export function guessDateFormat(
  samples: readonly string[],
): DateFormat | undefined {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (!values.length) return undefined;
  return (["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] as const).find((f) =>
    values.every((v) => parseDate(v, f)),
  );
}
export function normalizeTitle(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function hash(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function signature(
  t: Pick<Transaction, "accountId" | "date" | "amount" | "kind" | "title">,
) {
  return `${t.accountId}|${t.date}|${t.kind === "income" ? "" : "-"}${t.amount}|${normalizeTitle(t.title)}`;
}
// `rows` excludes the header. Each valid row gets an importId fingerprint (row content plus
// its occurrence number within the file), so re-importing the same file is flagged as duplicate.
export function buildImport(
  rows: readonly string[][],
  mapping: ColumnMapping,
  target: ImportTarget,
  state: FinanceState,
  lang: Language = getLanguage(),
): ImportCandidate[] {
  if (!state.accounts.some((a) => a.id === target.accountId))
    throw new Error(translate(lang, "errors.chooseAccount"));
  const existing = new Map<string, number>();
  const importIds = new Set<string>();
  for (const t of state.transactions) {
    if (t.kind === "transfer") continue;
    existing.set(signature(t), (existing.get(signature(t)) ?? 0) + 1);
    if (t.importId) importIds.add(t.importId);
  }
  const seen = new Map<string, number>();
  const signed = mapping.debit !== undefined || mapping.credit !== undefined;
  return rows.map((row, index): ImportCandidate => {
    const fail = (reason: string): ImportCandidate => ({
      ok: false,
      index,
      reason,
    });
    const cell = (i?: number) => (i === undefined ? "" : (row[i] ?? "").trim());
    const date = parseDate(cell(mapping.date), mapping.dateFormat);
    if (!date) return fail(translate(lang, "import.reason.date"));
    if (date > today()) return fail(translate(lang, "import.reason.future"));
    const title = cell(mapping.description)
      .replace(/\s+/g, " ")
      .slice(0, 120)
      .trim();
    if (!title) return fail(translate(lang, "import.reason.description"));
    let value: number | undefined;
    if (signed) {
      const debit = cell(mapping.debit) ? parseAmount(cell(mapping.debit)) : 0;
      const credit = cell(mapping.credit)
        ? parseAmount(cell(mapping.credit))
        : 0;
      if (debit === undefined || credit === undefined)
        return fail(translate(lang, "import.reason.amount"));
      if (debit && credit) return fail(translate(lang, "import.reason.both"));
      value = credit ? Math.abs(credit) : -Math.abs(debit);
    } else {
      if (mapping.amount === undefined)
        return fail(translate(lang, "import.reason.noAmountColumn"));
      value = parseAmount(cell(mapping.amount));
      if (value === undefined) return fail(translate(lang, "import.reason.amount"));
    }
    if (!value) return fail(translate(lang, "import.reason.zero"));
    const kind = value < 0 ? "expense" : "income";
    const base = {
      kind,
      amount: Math.abs(value),
      accountId: target.accountId,
      date,
      title,
    } as const;
    const key = signature(base);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    const importId = `csv:${hash(`${key}|${occurrence}`)}`;
    const transaction: Transaction = {
      ...base,
      id: id(),
      categoryId:
        kind === "expense" ? target.expenseCategoryId : target.incomeCategoryId,
      note: "",
      tags: [],
      importId,
    };
    try {
      validateTransaction(state, transaction);
    } catch (error) {
      return fail(error instanceof Error ? error.message : translate(lang, "import.reason.row"));
    }
    return {
      ok: true,
      index,
      transaction,
      duplicate:
        importIds.has(importId) || occurrence < (existing.get(key) ?? 0),
    };
  });
}
// Adds valid candidates, skipping duplicates unless includeDuplicates is set.
export function applyImport(
  state: FinanceState,
  candidates: readonly ImportCandidate[],
  includeDuplicates = false,
): { state: FinanceState; added: number } {
  const transactions = candidates.flatMap((c) =>
    c.ok && (includeDuplicates || !c.duplicate) ? [c.transaction] : [],
  );
  return transactions.length
    ? {
        state: {
          ...state,
          transactions: [...state.transactions, ...transactions],
        },
        added: transactions.length,
      }
    : { state, added: 0 };
}
