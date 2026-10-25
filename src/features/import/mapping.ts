import {
  detectColumns,
  guessDateFormat,
  isHeaderRow,
  parseAmount,
  parseCsv,
  parseDate,
  type ColumnMapping,
  type DateFormat,
} from "@/features/finance/csv";
import {
  getLanguage,
  t,
  translate,
  type Language,
} from "@/shared/i18n/core";

export type Delimiter = "," | ";" | "\t";
// Column indices are strings so they fit SelectField; "" means "not used".
export type MappingDraft = {
  delimiter: Delimiter;
  hasHeader: boolean;
  date: string;
  description: string;
  mode: "amount" | "split";
  amount: string;
  debit: string;
  credit: string;
  dateFormat: DateFormat;
};
export const MAX_ROWS = 20_000;
const SAMPLE = 200;

// Counts candidates on the first line, ignoring quoted text.
export function sniffDelimiter(text: string): Delimiter {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch as Delimiter]++;
  }
  return (Object.keys(counts) as Delimiter[]).reduce((best, d) =>
    counts[d] > counts[best] ? d : best,
  );
}

export function readRows(text: string, delimiter: Delimiter) {
  // parseCsv's type only names "," and ";", but it splits on any single character.
  const rows = parseCsv(text, delimiter as "," | ";");
  if (rows.length > MAX_ROWS + 1)
    throw new Error(t("import.tooManyRows", { max: MAX_ROWS }));
  return rows;
}

export function columnCount(rows: readonly string[][]) {
  return rows.slice(0, 50).reduce((n, row) => Math.max(n, row.length), 0);
}

const formats = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] as const;
const looksLikeDate = (cell: string) => formats.some((f) => parseDate(cell, f));
// Strict guess first; otherwise the format that parses most samples (at least half),
// so a few malformed rows don't hide the column's real format.
function bestDateFormat(values: string[]): DateFormat | undefined {
  const strict = guessDateFormat(values);
  if (strict || !values.length) return strict;
  let best: DateFormat | undefined;
  let bestCount = Math.ceil(values.length / 2) - 1;
  for (const f of formats) {
    const count = values.filter((v) => parseDate(v, f)).length;
    if (count > bestCount) {
      best = f;
      bestCount = count;
    }
  }
  return best;
}

function samples(rows: readonly string[][], column: number) {
  return rows
    .slice(0, SAMPLE)
    .map((r) => (r[column] ?? "").trim())
    .filter(Boolean);
}

// Header names first; falls back to inspecting cell contents for missing columns.
export function initialDraft(
  rows: readonly string[][],
  delimiter: Delimiter,
): MappingDraft {
  // A row with any date or amount cell is data, even when another cell
  // happens to contain a header word ("Total", "Cargo"...): treating it as a
  // header would silently drop the first transaction.
  const hasHeader = isHeaderRow(rows[0] ?? []);
  const detected = hasHeader && rows[0] ? detectColumns(rows[0]) : {};
  const data = hasHeader ? rows.slice(1) : rows;
  const columns = columnCount(rows);
  const taken = new Set(
    Object.values(detected).filter((v): v is number => typeof v === "number"),
  );
  const find = (test: (values: string[]) => boolean) => {
    for (let i = 0; i < columns; i++) {
      if (taken.has(i)) continue;
      const values = samples(data, i);
      if (values.length && test(values)) {
        taken.add(i);
        return i;
      }
    }
    return undefined;
  };
  const date = detected.date ?? find((v) => !!bestDateFormat(v));
  const split = detected.debit !== undefined || detected.credit !== undefined;
  const amount = split
    ? undefined
    : (detected.amount ??
      find((v) => v.every((cell) => parseAmount(cell) !== undefined)));
  const description =
    detected.description ??
    find((v) =>
      v.some((cell) => !looksLikeDate(cell) && parseAmount(cell) === undefined),
    );
  const text = (n?: number) => (n === undefined ? "" : String(n));
  return {
    delimiter,
    hasHeader,
    date: text(date),
    description: text(description),
    mode: split ? "split" : "amount",
    amount: text(amount),
    debit: text(detected.debit),
    credit: text(detected.credit),
    dateFormat:
      (date !== undefined && bestDateFormat(samples(data, date))) ||
      "DD/MM/YYYY",
  };
}

export function guessFormatFor(
  rows: readonly string[][],
  column: string,
  fallback: DateFormat,
) {
  return column === ""
    ? fallback
    : (bestDateFormat(samples(rows, Number(column))) ?? fallback);
}

export function toMapping(
  draft: MappingDraft,
  lang: Language = getLanguage(),
): { mapping: ColumnMapping } | { error: string } {
  const col = (v: string) => (v === "" ? undefined : Number(v));
  if (draft.date === "") return { error: translate(lang, "import.needDate") };
  if (draft.description === "")
    return { error: translate(lang, "import.needDescription") };
  if (draft.mode === "amount" && draft.amount === "")
    return { error: translate(lang, "import.needAmount") };
  if (draft.mode === "split" && draft.debit === "" && draft.credit === "")
    return { error: translate(lang, "import.needDebitCredit") };
  return {
    mapping: {
      date: Number(draft.date),
      description: Number(draft.description),
      ...(draft.mode === "amount"
        ? { amount: col(draft.amount) }
        : { debit: col(draft.debit), credit: col(draft.credit) }),
      dateFormat: draft.dateFormat,
    },
  };
}

export function columnOptions(
  rows: readonly string[][],
  hasHeader: boolean,
  lang: Language = getLanguage(),
) {
  const header = hasHeader ? rows[0] : undefined;
  const data = hasHeader ? rows.slice(1) : rows;
  return Array.from({ length: columnCount(rows) }, (_, i) => {
    const name = header?.[i]?.trim();
    const sample = data
      .slice(0, 20)
      .find((r) => r[i]?.trim())
      ?.[i]?.trim();
    return {
      value: String(i),
      label: name || translate(lang, "import.column", { number: i + 1 }),
      detail: sample
        ? translate(lang, "common.example", { value: sample.slice(0, 40) })
        : translate(lang, "import.emptyColumn"),
    };
  });
}
