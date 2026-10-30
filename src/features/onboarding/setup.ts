// Pure first-run setup: what the onboarding suggests and the state it builds.
// React-free (node tests import it); callers persist through update(), which
// validates with parseState.
import { t as tr, type Translate } from "../../shared/i18n/core.ts";
import { defaultCategories, starterKeys } from "../finance/defaults.ts";
import { exchangeRate } from "../finance/money.ts";
import { id } from "../finance/transactions.ts";
import type {
  Account,
  Category,
  Currency,
  FinanceState,
} from "../finance/types.ts";

// A suggestion's `key` identifies it in the UI only. Chosen suggestions get
// fresh ids, so they are the user's own categories and never pruned as unused
// starters (withoutUnusedDefaults).
export type CategoryDraft = Omit<Category, "id">;
export type Suggestion = CategoryDraft & { key: string; preselected: boolean };

const preselected = new Set(["food", "transport", "home", "salary"]);

// The starter set (icons/colors from defaults.ts), named in the given language
// (components pass useT().t so the names follow language changes).
export function suggestedCategories(translate: Translate = tr): Suggestion[] {
  return defaultCategories.map(({ id: key, icon, color, kind }) => ({
    key,
    name: starterKeys[key] ? translate(starterKeys[key]) : key,
    icon,
    color,
    kind,
    preselected: preselected.has(key),
  }));
}

const customColors = ["#555B65", "#466477", "#687666", "#7F6A7E", "#8A7264"];
// A custom category typed inline during onboarding.
export function customCategory(
  name: string,
  kind: Category["kind"],
  index = 0,
): CategoryDraft {
  return {
    name: name.trim().replace(/\s+/g, " "),
    icon: "tag",
    color: customColors[index % customColors.length],
    kind,
  };
}
const sameCategory = (a: CategoryDraft, b: CategoryDraft) =>
  a.kind === b.kind &&
  a.name.trim().toLocaleLowerCase() === b.name.trim().toLocaleLowerCase();
export function hasCategory(list: readonly CategoryDraft[], c: CategoryDraft) {
  return list.some((item) => sameCategory(item, c));
}

export function accountColor(type: Account["type"]) {
  return type === "credit" ? "#7C78A5" : type === "cash" ? "#BA965C" : "#356C56";
}

// Accepts "58.5" or "58,5"; NaN for anything that is not a plain decimal.
export function parseRate(text: string) {
  const value = text.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
}

export type OnboardingAnswers = {
  currency: Currency;
  // DOP per USD; undefined keeps whatever rate is already set (usually none).
  dopPerUsd?: number;
  account: {
    name: string;
    type: Account["type"];
    currency: Currency;
    // Integer cents; for a credit card, the amount owed (stored negative).
    balance: number;
  };
  categories: CategoryDraft[];
};

// Applies the onboarding answers on top of `base` and marks onboarding as done. Throws a localized error.
export function completeOnboarding(
  base: FinanceState,
  answers: OnboardingAnswers,
  makeId: () => string = id,
  now = new Date().toISOString(),
): FinanceState {
  const name = answers.account.name.trim();
  if (!name) throw new Error(tr("onboarding.error.accountName"));
  const balance = Math.abs(answers.account.balance);
  const account: Account = {
    id: makeId(),
    name,
    type: answers.account.type,
    currency: answers.account.currency,
    opening: answers.account.type === "credit" ? -balance : balance,
    color: accountColor(answers.account.type),
  };
  const added: Category[] = [];
  for (const draft of answers.categories) {
    const category = { ...draft, name: draft.name.trim() };
    if (!category.name || hasCategory([...base.categories, ...added], category))
      continue;
    added.push({ ...category, id: makeId() });
  }
  const categories = [...base.categories, ...added];
  if (!categories.some((c) => c.kind === "expense"))
    throw new Error(tr("onboarding.error.expenseRequired"));
  return {
    ...base,
    starterPruned: true,
    accounts: [...base.accounts, account],
    categories,
    settings: {
      ...base.settings,
      currency: answers.currency,
      exchangeRate:
        answers.dopPerUsd === undefined
          ? base.settings.exchangeRate
          : exchangeRate(answers.dopPerUsd, now),
      onboarded: true,
    },
  };
}
