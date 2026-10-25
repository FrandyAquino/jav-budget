import { screen, testRouter } from "expo-router/testing-library";
import { en, es, fmt, renderApp, stored } from "./helpers/app";

const DOP = 1_000_000 - 45_000 - 120_000 + 300_000;
const USD = 50_000;

test("switching the language to Español translates the UI", async () => {
  const { user } = await renderApp("/settings");
  expect(await screen.findByText(en("settings.title"))).toBeOnTheScreen();
  await user.press(
    screen.getByRole("button", { name: en("common.selectValue", { label: en("preferences.language"), value: "English" }) }),
  );
  await user.press(await screen.findByText("Español"));

  expect(await screen.findByText(es("settings.title"))).toBeOnTheScreen();
  expect(screen.getByText(es("preferences.title"))).toBeOnTheScreen();
  expect((await stored()).settings.language).toBe("es");

  await testRouter.navigate("/");
  expect(await screen.findByRole("tab", { name: es("tabs.home") })).toBeOnTheScreen();
  expect(screen.getByText(es("home.hero.totalBalance"))).toBeOnTheScreen();
  expect(screen.getByText(fmt(DOP, "DOP", "es"))).toBeOnTheScreen();
});

test("setting an exchange rate shows the combined net worth on Home", async () => {
  const { user } = await renderApp("/");
  expect(await screen.findByText(en("home.hero.totalBalance"))).toBeOnTheScreen();
  expect(screen.getByText(fmt(DOP))).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: en("home.hero.setRateA11y") })).toBeOnTheScreen();

  await testRouter.push("/settings");
  await user.press(
    await screen.findByRole("button", { name: `${en("rate.title")}, ${en("rate.notSet")}` }),
  );
  await user.type(await screen.findByLabelText(en("rate.a11y")), "60");
  await user.press(screen.getByRole("button", { name: en("rate.save") }));
  expect(await screen.findByText(en("rate.saved"))).toBeOnTheScreen();
  expect((await stored()).settings.exchangeRate).toMatchObject({ dopPerUsd: 60 });

  await user.press(screen.getByRole("button", { name: en("settings.close") }));
  expect(screen).toHavePathname("/");
  expect(await screen.findByText(en("home.hero.netWorth"))).toBeOnTheScreen();
  expect(screen.getByText(fmt(DOP + USD * 60))).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: en("home.hero.setRateA11y") })).not.toBeOnTheScreen();
});
