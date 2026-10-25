import { screen, within } from "expo-router/testing-library";
import { en, fixture, fmt, renderApp, stored } from "./helpers/app";

const DOP_START = 1_000_000 - 45_000 - 120_000 + 300_000;

test("adding an expense shows it in Activity and lowers the balance", async () => {
  const { user } = await renderApp("/");
  expect(await screen.findByText(fmt(DOP_START))).toBeOnTheScreen();

  await user.press(screen.getByRole("tab", { name: en("tabs.add") }));
  await user.type(await screen.findByLabelText(en("txForm.amount")), "250");
  await user.type(screen.getByLabelText(en("txForm.description")), "Farmers market");
  await user.press(screen.getByRole("button", { name: en("txForm.save") }));

  expect(await screen.findByText(fmt(DOP_START - 25_000))).toBeOnTheScreen();
  const saved = (await stored()).transactions.find((t) => t.title === "Farmers market");
  expect(saved).toMatchObject({ kind: "expense", amount: 25_000, accountId: "main", categoryId: "groceries" });

  await user.press(screen.getByRole("tab", { name: en("tabs.activity") }));
  expect(await screen.findByText("Farmers market")).toBeOnTheScreen();
});
