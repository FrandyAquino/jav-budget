import { screen } from "expo-router/testing-library";
import { en, renderApp } from "./helpers/app";

test("activity renders rows through FlashList and search filters them", async () => {
  const { user } = await renderApp("/activity");
  expect(await screen.findByText("Coffee beans")).toBeOnTheScreen();
  expect(screen.getByText("Team dinner")).toBeOnTheScreen();
  expect(screen.getByText("October paycheck")).toBeOnTheScreen();
  expect(screen.getByText(en("activity.count", { count: 3 }))).toBeOnTheScreen();

  await user.type(screen.getByLabelText(en("activity.searchA11y")), "dinner");
  expect(await screen.findByText(en("activity.count", { count: 1 }))).toBeOnTheScreen();
  expect(screen.getByText("Team dinner")).toBeOnTheScreen();
  expect(screen.queryByText("Coffee beans")).not.toBeOnTheScreen();
  expect(screen.queryByText("October paycheck")).not.toBeOnTheScreen();

  await user.clear(screen.getByLabelText(en("activity.searchA11y")));
  await user.type(screen.getByLabelText(en("activity.searchA11y")), "no such entry");
  expect(await screen.findByText(en("activity.emptyTitle"))).toBeOnTheScreen();
});

test("kind chips filter by transaction type", async () => {
  const { user } = await renderApp("/activity");
  await screen.findByText("Coffee beans");
  await user.press(screen.getByRole("button", { name: en("kindPlural.income") }));
  expect(await screen.findByText(en("activity.count", { count: 1 }))).toBeOnTheScreen();
  expect(screen.getByText("October paycheck")).toBeOnTheScreen();
  expect(screen.queryByText("Team dinner")).not.toBeOnTheScreen();
});
