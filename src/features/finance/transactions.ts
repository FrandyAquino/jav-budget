import { t as tr } from "../../shared/i18n/core.ts";
import { today, validDate } from "./dates.ts";
import type { FinanceState, Split, Transaction } from "./types.ts";

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

export function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
export function normalizeTag(tag: string) {
  return tag.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase();
}
// Trims, lowercases and dedupes; length limits are enforced by validateTransaction.
export function normalizeTags(tags: readonly string[] = []) {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}
export function allTags(state: FinanceState) {
  const counts = new Map<string, number>();
  for (const t of [...state.transactions, ...state.recurring])
    for (const tag of t.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}
// Category/amount pairs a transaction contributes to; transfers have none.
export function allocations(
  tx: Pick<Transaction, "kind" | "amount" | "categoryId" | "splits">,
): Split[] {
  if (tx.kind === "transfer") return [];
  return tx.splits?.length
    ? tx.splits.map((s) => ({ categoryId: s.categoryId, amount: s.amount }))
    : [{ categoryId: tx.categoryId, amount: tx.amount }];
}
export function categoryAmount(
  tx: Pick<Transaction, "kind" | "amount" | "categoryId" | "splits">,
  categoryId: string,
) {
  return allocations(tx)
    .filter((a) => a.categoryId === categoryId)
    .reduce((v, a) => v + a.amount, 0);
}
export function hasCategory(
  tx: Pick<Transaction, "kind" | "amount" | "categoryId" | "splits">,
  categoryId: string,
) {
  // Transfers have no allocations but may carry an optional label category.
  if (tx.kind === "transfer") return !!categoryId && tx.categoryId === categoryId;
  return allocations(tx).some((a) => a.categoryId === categoryId);
}
export function primaryCategory(splits: readonly Split[]) {
  return splits.reduce((best, s) => (s.amount > best.amount ? s : best))
    .categoryId;
}
export function categoryInUse(state: FinanceState, categoryId: string) {
  return (
    state.transactions.some((t) => hasCategory(t, categoryId)) ||
    state.recurring.some((r) => hasCategory(r, categoryId)) ||
    state.budgets.some((b) => b.categoryId === categoryId)
  );
}
type Validatable = Omit<Transaction, "id"> & { id?: string };
function validateSplits(state: FinanceState, tx: Validatable) {
  const splits = tx.splits;
  if (!splits) return;
  if (tx.kind === "transfer") throw new Error(tr("errors.splitTransfer"));
  if (splits.length < 2) throw new Error(tr("errors.splitTwoParts"));
  if (new Set(splits.map((s) => s.categoryId)).size !== splits.length)
    throw new Error(tr("errors.splitDistinct"));
  for (const s of splits) {
    if (!Number.isSafeInteger(s.amount) || s.amount <= 0)
      throw new Error(tr("errors.splitPositive"));
    if (
      !state.categories.some((c) => c.id === s.categoryId && c.kind === tx.kind)
    )
      throw new Error(tr("errors.splitCategory"));
  }
  if (splits.reduce((v, s) => v + s.amount, 0) !== tx.amount)
    throw new Error(tr("errors.splitTotal"));
  if (!splits.some((s) => s.categoryId === tx.categoryId))
    throw new Error(tr("errors.splitPrimary"));
}
// `allowFuture` is for stored data (load, backups): a clock or timezone change
// must never make saved records unreadable. User entry and imports keep the
// default, which rejects dates after today.
export function validateTransaction(
  state: FinanceState,
  tx: Validatable,
  { allowFuture = false }: { allowFuture?: boolean } = {},
) {
  if (tx.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(tx.time))
    throw new Error(tr("errors.timeInvalid"));
  if (!tx.title.trim()) throw new Error(tr("errors.titleRequired"));
  if (!Number.isSafeInteger(tx.amount) || tx.amount <= 0)
    throw new Error(tr("errors.amountZero"));
  if (!validDate(tx.date) || (!allowFuture && tx.date > today()))
    throw new Error(
      tr("errors.dateInvalid"),
    );
  const tags = tx.tags ?? [];
  if (tags.length > MAX_TAGS) throw new Error(tr("errors.tagsMax", { max: MAX_TAGS }));
  if (tags.some((t) => !t || t.length > MAX_TAG_LENGTH))
    throw new Error(tr("errors.tagLength", { max: MAX_TAG_LENGTH }));
  const account = state.accounts.find((a) => a.id === tx.accountId);
  if (!account) throw new Error(tr("errors.chooseAccount"));
  if (tx.kind === "transfer") {
    const destination = state.accounts.find((a) => a.id === tx.toAccountId);
    if (!destination || destination.id === account.id)
      throw new Error(tr("errors.transferSameAccount"));
    if (!tx.received || !Number.isSafeInteger(tx.received) || tx.received <= 0)
      throw new Error(tr("errors.transferReceived"));
    if (destination.currency === account.currency && tx.received !== tx.amount)
      throw new Error(tr("errors.transferMismatch"));
    if (
      tx.categoryId &&
      !state.categories.some(
        (c) => c.id === tx.categoryId && c.kind === "transfer",
      )
    )
      throw new Error(tr("errors.categoryMismatch"));
  } else if (
    !state.categories.some((c) => c.id === tx.categoryId && c.kind === tx.kind)
  )
    throw new Error(tr("errors.categoryMismatch"));
  validateSplits(state, tx);
}
// Drops empty splits and points categoryId at the largest part.
export function withPrimaryCategory<
  T extends Pick<Transaction, "kind" | "categoryId" | "splits">,
>(tx: T): T {
  if (!tx.splits) return tx;
  const next = { ...tx };
  if (!next.splits?.length) delete next.splits;
  else if (next.kind !== "transfer")
    next.categoryId = primaryCategory(next.splits);
  return next;
}
// Normalizes tags and splits; saveTransaction applies it before validating.
export function normalizeTransaction<
  T extends Pick<Transaction, "kind" | "categoryId" | "splits" | "tags">,
>(tx: T): T {
  return withPrimaryCategory({ ...tx, tags: normalizeTags(tx.tags) });
}
export function saveTransaction(
  state: FinanceState,
  tx: Transaction,
): FinanceState {
  const next = normalizeTransaction(tx);
  validateTransaction(state, next);
  return {
    ...state,
    transactions: [...state.transactions.filter((t) => t.id !== next.id), next],
  };
}
export function duplicateTransaction(
  state: FinanceState,
  transactionId: string,
  date = today(),
): FinanceState {
  const source = state.transactions.find((t) => t.id === transactionId);
  if (!source) throw new Error(tr("errors.transactionMissing"));
  const {
    recurringId: _recurring,
    receipt: _receipt,
    importId: _import,
    ...copy
  } = source;
  return saveTransaction(state, {
    ...copy,
    id: id(),
    date,
    tags: [...(source.tags ?? [])],
    splits: source.splits?.map((s) => ({ ...s })),
  });
}
export function accountBalance(
  state: FinanceState,
  accountId: string,
  through = today(),
) {
  return state.transactions
    .filter((t) => t.date <= through)
    .reduce(
      (balance, t) =>
        balance +
        (t.accountId === accountId
          ? t.kind === "income"
            ? t.amount
            : -t.amount
          : 0) +
        (t.toAccountId === accountId && t.kind === "transfer"
          ? (t.received ?? t.amount)
          : 0),
      state.accounts.find((a) => a.id === accountId)?.opening ?? 0,
    );
}
export function removeAccount(
  state: FinanceState,
  accountId: string,
): FinanceState {
  if (
    state.transactions.some(
      (t) => t.accountId === accountId || t.toAccountId === accountId,
    ) ||
    state.recurring.some(
      (t) => t.accountId === accountId || t.toAccountId === accountId,
    )
  )
    throw new Error(
      tr("errors.accountInUse"),
    );
  return {
    ...state,
    accounts: state.accounts.filter((a) => a.id !== accountId),
  };
}
