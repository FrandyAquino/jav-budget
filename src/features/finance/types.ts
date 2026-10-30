export type Currency = "DOP" | "USD";
export type Kind = "expense" | "income" | "transfer";
export type Account = {
  id: string;
  name: string;
  type: "bank" | "cash" | "credit";
  currency: Currency;
  opening: number;
  color: string;
  limit?: number;
  dueDay?: number;
  // Savings and similar accounts left out of the home "available" balance.
  excludeFromTotal?: boolean;
};
export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  // Transfer categories (savings, card payments…) only label transfers.
  kind: "expense" | "income" | "transfer";
};
export type Split = { categoryId: string; amount: number };
export type Transaction = {
  id: string;
  kind: Kind;
  amount: number;
  accountId: string;
  toAccountId?: string;
  received?: number;
  // With splits, categoryId mirrors the largest part (first on ties); use allocations() for totals.
  categoryId: string;
  title: string;
  note: string;
  date: string;
  time?: string; // Local wall-clock time; absent for legacy entries.
  recurringId?: string;
  // Optional in the type so older call sites compile; parseState always fills [].
  tags?: string[];
  receipt?: string; // Local file URI of an attached photo.
  splits?: Split[];
  importId?: string; // CSV import fingerprint, used to skip re-imports.
};
export type Budget = {
  id: string;
  categoryId: string;
  currency: Currency;
  // Budget period: "2026-10" (month) or "2026-10-Q1" / "2026-10-Q2" (halves).
  month: string;
  limit: number;
  rollover?: boolean; // parseState always fills false.
};
// Overall spending cap for every expense category in one month and currency.
export type MonthlyBudget = {
  id: string;
  currency: Currency;
  // Same period format as Budget.month.
  month: string;
  limit: number;
};
export type Recurring = Omit<
  Transaction,
  "id" | "date" | "recurringId" | "receipt" | "importId"
> & {
  id: string;
  nextDate: string;
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "custom";
  intervalDays?: number;
  anchorDay: number;
  active: boolean;
  subscription: boolean;
};
export type Goal = {
  id: string;
  name: string;
  currency: Currency;
  target: number;
  saved: number;
};
export type ExchangeRate = { dopPerUsd: number; updatedAt: string };
export type Settings = {
  name: string;
  email?: string;
  numberEntry?: "decimal" | "cents";
  appIcon?: "graphite" | "chalk";
  // "system" follows the device language; parseState always fills it.
  language?: "system" | "es" | "en";
  // False until the first-run onboarding finishes; parseState fills true for
  // data saved before onboarding existed.
  onboarded?: boolean;
  currency: Currency;
  appearance: "system" | "light" | "dark";
  biometrics: boolean;
  notifications: boolean;
  exchangeRate?: ExchangeRate;
  // Budget period length; parseState fills "monthly".
  budgetPeriod?: "monthly" | "biweekly";
  // Native automatic daily backups; parseState fills true.
  autoBackup?: boolean;
  // ISO timestamp of the last manual export (web export reminder).
  lastExportAt?: string;
};
export type FinanceState = {
  version: 2;
  // One-time migration marker: unused starter categories were removed from
  // pre-existing data. parseState always fills it (false for old data).
  starterPruned?: boolean;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  monthlyBudgets: MonthlyBudget[];
  recurring: Recurring[];
  goals: Goal[];
  settings: Settings;
};
export type DateRange = { from: string; to: string };
