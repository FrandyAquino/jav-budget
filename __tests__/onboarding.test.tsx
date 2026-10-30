import { renderRouter, screen } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import type { FinanceState } from "@/features/finance/model";
import { en, fixture, fmt, renderApp, seed, stored } from "./helpers/app";

// First launch: nothing is stored, so the app opens on onboarding.
async function firstLaunch(initialUrl = "/") {
  const user = userEvent.setup();
  await renderRouter("./src/app", { initialUrl });
  expect(
    await screen.findByText(en("onboarding.welcome.title"), {}, { timeout: 5000 }),
  ).toBeOnTheScreen();
  return user;
}

test("first launch: set up currency, account and categories, then land on Home", async () => {
  const user = await firstLaunch();
  expect(screen).toHavePathname("/onboarding");
  await user.press(screen.getByRole("button", { name: "English" }));
  await user.press(screen.getByRole("button", { name: en("onboarding.start") }));

  // Currency: USD by default, with an optional exchange rate.
  await user.press(await screen.findByRole("radio", { name: en("currency.USD") }));
  await user.type(screen.getByLabelText(en("onboarding.rate.a11y")), "60");
  await user.press(screen.getByRole("button", { name: en("onboarding.continue") }));

  // First account: the name is required.
  expect(await screen.findByText(en("onboarding.account.title"))).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: en("onboarding.continue") }));
  expect(await screen.findByText(en("onboarding.error.accountName"))).toBeOnTheScreen();
  await user.type(screen.getByLabelText(en("onboarding.account.name")), "Banco Popular");
  await user.press(screen.getByRole("button", { name: "DOP" }));
  await user.type(screen.getByLabelText(en("onboarding.account.balanceA11y")), "1500");
  await user.press(screen.getByRole("button", { name: en("onboarding.continue") }));

  // Categories: a few are preselected; pick one more and add a custom one.
  expect(await screen.findByText(en("onboarding.categories.title"))).toBeOnTheScreen();
  // Chips with an icon: their accessible name includes the glyph; match the text.
  await user.press(screen.getByText(en("starter.category.shopping")));
  await user.type(screen.getByLabelText(en("onboarding.categories.customA11y")), "Pets");
  await user.press(screen.getByRole("button", { name: en("onboarding.categories.add") }));
  expect(screen.getByText("Pets")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: en("onboarding.finish") }));

  expect(await screen.findByRole("tab", { name: en("tabs.home") })).toBeOnTheScreen();
  expect(screen).toHavePathname("/");
  expect(await screen.findByText(en("onboarding.done"))).toBeOnTheScreen();
  // USD default + rate: the DOP opening balance shows in the combined net worth.
  expect(screen.getByText(en("home.hero.netWorth"))).toBeOnTheScreen();
  expect(screen.getByText(fmt(Math.round(150_000 / 60), "USD"))).toBeOnTheScreen();

  const state = await stored();
  expect(state.settings).toMatchObject({ onboarded: true, currency: "USD", language: "en" });
  expect(state.settings.exchangeRate).toMatchObject({ dopPerUsd: 60 });
  expect(state.accounts).toEqual([
    expect.objectContaining({ name: "Banco Popular", type: "bank", currency: "DOP", opening: 150_000 }),
  ]);
  expect(state.categories.map((c) => c.name).sort()).toEqual(
    [
      en("starter.category.food"),
      en("starter.category.transport"),
      en("starter.category.home"),
      en("starter.category.shopping"),
      en("starter.category.salary"),
      "Pets",
    ].sort(),
  );
  expect(state.categories.some((c) => ["food", "shopping", "salary"].includes(c.id))).toBe(false);
});

test("a quick action or deep link before setup opens onboarding", async () => {
  await firstLaunch("/add?kind=expense");
  expect(screen).toHavePathname("/onboarding");
});

test("existing data saved before onboarding existed goes straight to Home", async () => {
  const legacy = fixture();
  delete legacy.settings.onboarded;
  await renderApp("/", legacy);
  expect(await screen.findByText(en("home.hero.totalBalance"))).toBeOnTheScreen();
  expect(screen.queryByText(en("onboarding.welcome.title"))).not.toBeOnTheScreen();
});

test("a ledger saved with the removed sample data starts over in onboarding", async () => {
  const saved = { ...fixture(), demo: true } as FinanceState;
  saved.settings.language = "en";
  await seed(saved);
  await renderRouter("./src/app", { initialUrl: "/" });
  expect(await screen.findByText(en("onboarding.welcome.title"), {}, { timeout: 5000 })).toBeOnTheScreen();
  expect(screen).toHavePathname("/onboarding");
  expect(await stored()).toMatchObject({ accounts: [], transactions: [], settings: { onboarded: false } });
});

test("replacing everything with empty data in Settings goes through onboarding", async () => {
  const { user } = await renderApp("/settings");
  await user.press(await screen.findByRole("button", { name: en("data.erase") }));
  await user.type(await screen.findByLabelText(en("data.confirmA11y")), en("data.confirmWord"));
  await user.press(screen.getByRole("button", { name: en("data.replace") }));
  expect(await screen.findByText(en("onboarding.welcome.title"))).toBeOnTheScreen();
  expect(screen).toHavePathname("/onboarding");
  expect(await stored()).toMatchObject({ accounts: [], settings: { onboarded: false, language: "en" } });
});
