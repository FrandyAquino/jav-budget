import { t as tr } from "../../shared/i18n/core.ts";
import { dateString, today } from "./dates.ts";
import { validateTransaction } from "./transactions.ts";
import type { FinanceState, Recurring, Transaction } from "./types.ts";

export function nextDate(
  date: string,
  frequency: Recurring["frequency"],
  anchorDay: number,
  intervalDays = 1,
) {
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365)
    throw new Error(tr("errors.intervalRange"));
  const d = new Date(`${date}T12:00:00`);
  if (frequency !== "monthly")
    d.setDate(
      d.getDate() +
        (frequency === "custom"
          ? intervalDays
          : frequency === "daily"
            ? 1
            : frequency === "weekly"
              ? 7
              : 14),
    );
  else {
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(
      Math.min(
        anchorDay,
        new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
      ),
    );
  }
  return dateString(d);
}
export function nextFutureDate(
  date: string,
  frequency: Recurring["frequency"],
  anchorDay: number,
  after = today(),
  intervalDays = 1,
) {
  let next = nextDate(date, frequency, anchorDay, intervalDays);
  while (next <= after)
    next = nextDate(next, frequency, anchorDay, intervalDays);
  return next;
}
export function recurringTemplate(
  rule: Recurring,
  date: string,
  transactionId = `${rule.id}:${date}`,
): Transaction {
  const {
    nextDate: _next,
    frequency: _frequency,
    intervalDays: _interval,
    anchorDay: _anchor,
    active: _active,
    subscription: _subscription,
    ...template
  } = rule;
  return {
    ...template,
    tags: [...(rule.tags ?? [])],
    id: transactionId,
    date,
    recurringId: rule.id,
  };
}
export function processRecurring(
  state: FinanceState,
  through = today(),
): FinanceState {
  let transactions = [...state.transactions];
  let changed = false;
  const recurring = state.recurring.map((rule) => {
    if (!rule.active) return rule;
    let date = rule.nextDate;
    let count = 0;
    while (date <= through && count < 600) {
      const transactionId = `${rule.id}:${date}`;
      if (!transactions.some((t) => t.id === transactionId)) {
        const tx = recurringTemplate(rule, date, transactionId);
        validateTransaction(state, tx);
        transactions = [...transactions, tx];
      }
      date = nextDate(date, rule.frequency, rule.anchorDay, rule.intervalDays);
      changed = true;
      count++;
    }
    return { ...rule, nextDate: date };
  });
  return changed ? { ...state, transactions, recurring } : state;
}
