import {
  categoryTotals,
  type FinanceState,
  type Transaction,
} from "@/features/finance/model";

export type SpendingSlice = {
  id: string;
  label: string;
  color: string;
  value: number;
};
// Expense totals per category for SpendingRing, honoring split transactions.
export function spendingSlices(
  state: FinanceState,
  rows: readonly Transaction[],
): SpendingSlice[] {
  const categories = new Map(
    state.categories.filter((c) => c.kind === "expense").map((c) => [c.id, c]),
  );
  const slices: SpendingSlice[] = [];
  for (const { categoryId, amount } of categoryTotals(rows, "expense")) {
    const c = categories.get(categoryId);
    if (c && amount > 0)
      slices.push({ id: c.id, label: c.name, color: c.color, value: amount });
  }
  return slices;
}
