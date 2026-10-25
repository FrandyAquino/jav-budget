// Framework-free receipt file-name rules shared by the native receipts module
// and node tests.
import type { FinanceState } from "../finance/types.ts";

export const RECEIPTS_FOLDER = "receipts";
// Names we create: id() plus a short extension. Anything else ("." / "..",
// encoded separators, odd characters) is never resolved or deleted.
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}(\.[A-Za-z0-9]{1,5})?$/;

export function isReceiptName(name: string) {
  return NAME.test(name);
}
// The file name of a URI inside our receipts folder, or undefined.
export function receiptName(uri: string): string | undefined {
  const match = uri.match(new RegExp(`/${RECEIPTS_FOLDER}/([^/?#]+)$`));
  return match && isReceiptName(match[1]) ? match[1] : undefined;
}
// Receipt file names still referenced by a transaction.
export function referencedReceipts(state: Pick<FinanceState, "transactions">) {
  const names = new Set<string>();
  for (const tx of state.transactions) {
    const name = tx.receipt ? receiptName(tx.receipt) : undefined;
    if (name) names.add(name);
  }
  return names;
}
// Files in the receipts folder that nothing references any more.
export function orphanReceipts(
  files: readonly string[],
  state: Pick<FinanceState, "transactions">,
) {
  const keep = referencedReceipts(state);
  return files.filter((name) => isReceiptName(name) && !keep.has(name));
}
