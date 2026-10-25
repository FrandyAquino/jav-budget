import { z } from "zod";
import { t as tr } from "../../shared/i18n/core.ts";
import { validDate, validMonth } from "./dates.ts";
import { validRate } from "./money.ts";
import {
  normalizeTags,
  validateTransaction,
  withPrimaryCategory,
} from "./transactions.ts";
import type { FinanceState } from "./types.ts";

export const SCHEMA_VERSION = 2;
const currency = z.enum(["DOP", "USD"]);
const amount = z.number().int().safe().nonnegative();
const date = z.string().refine(validDate, "Invalid date");
const month = z.string().refine(validMonth, "Invalid month");
const split = z.object({ categoryId: z.string(), amount: amount.positive() });
const transaction = z.object({
  id: z.string().min(1),
  kind: z.enum(["expense", "income", "transfer"]),
  amount: amount.positive(),
  accountId: z.string(),
  toAccountId: z.string().optional(),
  received: amount.positive().optional(),
  categoryId: z.string(),
  title: z.string().trim().min(1).max(120),
  note: z.string().max(2000),
  date,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  recurringId: z.string().optional(),
  tags: z
    .array(z.string())
    .default([])
    .transform((t) => normalizeTags(t)),
  receipt: z.string().min(1).max(2048).optional(),
  splits: z.array(split).optional(),
  importId: z.string().min(1).max(200).optional(),
});
const schema = z.object({
  version: z.literal(SCHEMA_VERSION),
  demo: z.boolean(),
  // Added after v2 shipped; old data defaults to false so the one-time starter
  // category cleanup (pruneStarterCategoriesOnce) runs for it exactly once.
  starterPruned: z.boolean().default(false),
  accounts: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(80),
      type: z.enum(["bank", "cash", "credit"]),
      currency,
      opening: z.number().int().safe(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      limit: amount.positive().optional(),
      dueDay: z.number().int().min(1).max(28).optional(),
    }),
  ),
  categories: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(60),
      icon: z.string(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      kind: z.enum(["income", "expense"]),
    }),
  ),
  transactions: z.array(transaction),
  budgets: z.array(
    z.object({
      id: z.string().min(1),
      categoryId: z.string(),
      currency,
      month,
      limit: amount.positive(),
      rollover: z.boolean().default(false),
    }),
  ),
  monthlyBudgets: z.array(
    z.object({
      id: z.string().min(1),
      currency,
      month,
      limit: amount.positive(),
    }),
  ),
  recurring: z.array(
    transaction
      .omit({ date: true, recurringId: true, receipt: true, importId: true })
      .extend({
        nextDate: date,
        frequency: z.enum(["daily", "weekly", "biweekly", "monthly", "custom"]),
        intervalDays: z.number().int().min(1).max(365).optional(),
        anchorDay: z.number().int().min(1).max(31),
        active: z.boolean(),
        subscription: z.boolean(),
      }),
  ),
  goals: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(80),
      currency,
      target: amount.positive(),
      saved: amount,
    }),
  ),
  settings: z.object({
    name: z.string().max(60),
    email: z.string().max(120).default(""),
    numberEntry: z.enum(["decimal", "cents"]).default("decimal"),
    appIcon: z.enum(["graphite", "chalk"]).default("graphite"),
    // Added after v2 shipped; the default keeps older data and backups valid.
    language: z.enum(["system", "es", "en"]).default("system"),
    currency,
    appearance: z.enum(["system", "light", "dark"]),
    biometrics: z.boolean(),
    notifications: z.boolean(),
    exchangeRate: z
      .object({
        dopPerUsd: z.number().refine(validRate, "Invalid exchange rate"),
        updatedAt: z
          .string()
          .min(1)
          .max(40)
          .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid timestamp"),
      })
      .optional(),
  }),
});
type Raw = Record<string, unknown>;
// Each step upgrades version n to n + 1; fields with schema defaults need no step.
const migrations: Record<number, (data: Raw) => Raw> = {
  1: (data) => ({
    ...data,
    version: 2,
    monthlyBudgets: Array.isArray(data.monthlyBudgets)
      ? data.monthlyBudgets
      : [],
  }),
};
export function migrateState(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  let data = input as Raw;
  while (
    typeof data.version === "number" &&
    data.version < SCHEMA_VERSION &&
    migrations[data.version]
  )
    data = migrations[data.version](data);
  return data;
}
export function parseState(input: unknown): FinanceState {
  const migrated = migrateState(input);
  const version = (migrated as Raw | null)?.version;
  if (typeof version === "number" && version > SCHEMA_VERSION)
    throw new Error(
      tr("errors.backupNewer"),
    );
  const result = schema.safeParse(migrated);
  if (!result.success)
    throw new Error(
      tr("errors.backupInvalid", { version: SCHEMA_VERSION }),
    );
  const state: FinanceState = {
    ...result.data,
    transactions: result.data.transactions.map(withPrimaryCategory),
    recurring: result.data.recurring.map(withPrimaryCategory),
  };
  for (const rows of [
    state.accounts,
    state.categories,
    state.transactions,
    state.budgets,
    state.monthlyBudgets,
    state.recurring,
    state.goals,
  ])
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw new Error(tr("errors.backupDuplicateIds"));
  // Stored records may be dated after today() after a clock/timezone change.
  for (const tx of state.transactions)
    validateTransaction(state, tx, { allowFuture: true });
  for (const rule of state.recurring) {
    if (rule.frequency === "custom" && !rule.intervalDays)
      throw new Error(tr("errors.customInterval"));
    validateTransaction(
      state,
      { ...rule, date: "2000-01-01" },
      { allowFuture: true },
    );
  }
  const budgetKeys = state.budgets.map(
    (b) => `${b.month}:${b.categoryId}:${b.currency}`,
  );
  if (new Set(budgetKeys).size !== budgetKeys.length)
    throw new Error(
      tr("errors.budgetDuplicate"),
    );
  const monthlyKeys = state.monthlyBudgets.map(
    (b) => `${b.month}:${b.currency}`,
  );
  if (new Set(monthlyKeys).size !== monthlyKeys.length)
    throw new Error(
      tr("errors.monthlyBudgetDuplicate"),
    );
  if (
    state.budgets.some(
      (b) =>
        !state.categories.some(
          (c) => c.id === b.categoryId && c.kind === "expense",
        ),
    )
  )
    throw new Error(tr("errors.budgetCategoryMissing"));
  return state;
}
