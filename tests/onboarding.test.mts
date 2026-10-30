// First-run onboarding: schema default/migration and the pure state builder.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultCategories,
  emptyState,
  pruneStarterCategoriesOnce,
  withoutUnusedDefaults,
  type FinanceState,
} from "../src/features/finance/model.ts";
import { parseState } from "../src/features/finance/schema.ts";
import { setLanguage, translate } from "../src/shared/i18n/core.ts";
import {
  completeOnboarding,
  customCategory,
  parseRate,
  suggestedCategories,
  type OnboardingAnswers,
} from "../src/features/onboarding/setup.ts";

let n = 0;
const makeId = () => `id-${++n}`;
const NOW = "2026-10-25T12:00:00.000Z";

function answers(patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers {
  const picked = suggestedCategories().filter((s) => s.preselected);
  return {
    currency: "USD",
    dopPerUsd: 60.25,
    account: { name: "  Banco Popular ", type: "bank", currency: "DOP", balance: 1_250_000 },
    categories: picked.map(({ name, icon, color, kind }) => ({ name, icon, color, kind })),
    ...patch,
  };
}

test("brand-new data is not onboarded", () => {
  assert.equal(emptyState().settings.onboarded, false);
  assert.equal(parseState(emptyState()).settings.onboarded, false);
});

test("stored data and backups without the field default to onboarded", () => {
  const legacy = JSON.parse(JSON.stringify(emptyState())) as FinanceState;
  delete legacy.settings.onboarded;
  assert.equal(parseState(legacy).settings.onboarded, true);
  // A v1 backup is migrated and also counts as an existing user.
  const v1 = { ...JSON.parse(JSON.stringify(emptyState())), version: 1 };
  delete v1.settings.onboarded;
  delete v1.monthlyBudgets;
  assert.equal(parseState(v1).settings.onboarded, true);
  // An explicit false survives a round trip.
  assert.equal(
    parseState(JSON.parse(JSON.stringify(emptyState()))).settings.onboarded,
    false,
  );
  assert.throws(() =>
    parseState({ ...emptyState(), settings: { ...emptyState().settings, onboarded: "yes" } }),
  );
});

test("suggestions mirror the starter set, localized, with a few preselected", () => {
  setLanguage("es");
  const es = suggestedCategories();
  setLanguage("en");
  assert.equal(es.length, defaultCategories.length);
  assert.equal(es[0].name, translate("es", "starter.category.food"));
  assert.deepEqual(
    es.map(({ key, icon, color, kind }) => ({ id: key, icon, color, kind })),
    defaultCategories.map(({ id, icon, color, kind }) => ({ id, icon, color, kind })),
  );
  const pre = es.filter((s) => s.preselected);
  assert.ok(pre.some((s) => s.kind === "expense"));
  assert.ok(pre.some((s) => s.kind === "income"));
  assert.ok(pre.length < es.length);
});

test("completeOnboarding builds a valid ledger and marks it onboarded", () => {
  n = 0;
  const state = parseState(completeOnboarding(emptyState(), answers(), makeId, NOW));
  assert.equal(state.settings.onboarded, true);
  assert.equal(state.settings.currency, "USD");
  assert.deepEqual(state.settings.exchangeRate, { dopPerUsd: 60.25, updatedAt: NOW });
  assert.equal(state.accounts.length, 1);
  assert.deepEqual(state.accounts[0], {
    id: "id-1",
    name: "Banco Popular",
    type: "bank",
    currency: "DOP",
    opening: 1_250_000,
    color: "#356C56",
  });
  assert.equal(state.categories.length, 4);
  // Fresh ids: none collides with a starter id.
  const starterIds = new Set(defaultCategories.map((c) => c.id));
  assert.ok(state.categories.every((c) => !starterIds.has(c.id)));
  assert.equal(new Set(state.categories.map((c) => c.id)).size, 4);
});

test("onboarding categories are the user's own: never pruned or relabeled", () => {
  setLanguage("es");
  const state = parseState(completeOnboarding(emptyState(), answers(), makeId, NOW));
  setLanguage("en");
  // Unused, with starter (Spanish) names, but not starters: they stay.
  assert.equal(withoutUnusedDefaults(state), state);
  assert.equal(pruneStarterCategoriesOnce({ ...state, starterPruned: false }).categories.length, 4);
  assert.equal(state.starterPruned, true);
});

test("credit balances are debt, rate and categories are optional/deduped", () => {
  const state = parseState(
    completeOnboarding(
      emptyState(),
      answers({
        dopPerUsd: undefined,
        account: { name: "Visa", type: "credit", currency: "DOP", balance: 50_000 },
        categories: [
          customCategory("  Pets ", "expense"),
          customCategory("pets", "expense", 1),
          customCategory("Pets", "income"),
          customCategory("   ", "expense"),
        ],
      }),
      makeId,
      NOW,
    ),
  );
  assert.equal(state.accounts[0].opening, -50_000);
  assert.equal(state.accounts[0].color, "#7C78A5");
  assert.equal(state.settings.exchangeRate, undefined);
  assert.deepEqual(
    state.categories.map((c) => [c.name, c.kind, c.icon]),
    [
      ["Pets", "expense", "tag"],
      ["Pets", "income", "tag"],
    ],
  );
});

test("completeOnboarding validates its answers", () => {
  setLanguage("en");
  assert.throws(
    () => completeOnboarding(emptyState(), answers({ account: { ...answers().account, name: " " } })),
    { message: translate("en", "onboarding.error.accountName") },
  );
  assert.throws(
    () => completeOnboarding(emptyState(), answers({ categories: [customCategory("Salary", "income")] })),
    { message: translate("en", "onboarding.error.expenseRequired") },
  );
  assert.throws(() => completeOnboarding(emptyState(), answers({ dopPerUsd: 0 })), {
    message: translate("en", "errors.rateInvalid"),
  });
  assert.ok(Number.isNaN(parseRate("abc")));
  assert.equal(parseRate(" 58,5 "), 58.5);
});

