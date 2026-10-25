import { screen } from "expo-router/testing-library";
import { en, fmt, renderApp, stored } from "./helpers/app";

const rowName = (title: string, cents: number) =>
  `${en("transaction.editA11y", { title })}, ${fmt(cents)}`;

async function openRow(title: string, cents: number) {
  const { user } = await renderApp("/activity");
  // The swipe action duplicates the row's label; the first match is the row itself.
  await user.press((await screen.findAllByRole("button", { name: rowName(title, cents) }))[0]);
  expect(await screen.findByText(en("txForm.editTitle"))).toBeOnTheScreen();
  return user;
}

test("editing a transaction updates it in place without duplicating", async () => {
  const user = await openRow("Coffee beans", 45_000);
  const amount = screen.getByLabelText(en("txForm.amount"));
  expect(amount).toHaveDisplayValue("450");
  await user.clear(amount);
  await user.type(amount, "500");
  const title = screen.getByLabelText(en("txForm.description"));
  await user.clear(title);
  await user.type(title, "Espresso beans");
  await user.press(screen.getByRole("button", { name: en("common.saveChanges") }));

  expect(await screen.findAllByRole("button", { name: rowName("Espresso beans", 50_000) })).not.toHaveLength(0);
  expect(screen.queryByText("Coffee beans")).not.toBeOnTheScreen();
  const { transactions } = await stored();
  expect(transactions).toHaveLength(3);
  expect(transactions.find((t) => t.id === "t-beans")).toMatchObject({ title: "Espresso beans", amount: 50_000 });
});

test("duplicate creates a separate copy of the transaction", async () => {
  const user = await openRow("Team dinner", 120_000);
  await user.press(screen.getByRole("button", { name: en("txForm.duplicate") }));

  expect(await screen.findByText(en("txForm.duplicated"))).toBeOnTheScreen();
  expect(await screen.findAllByText("Team dinner")).toHaveLength(2);
  const copies = (await stored()).transactions.filter((t) => t.title === "Team dinner");
  expect(copies).toHaveLength(2);
  expect(new Set(copies.map((t) => t.id)).size).toBe(2);
  expect(copies.every((t) => t.amount === 120_000 && t.categoryId === "dining")).toBe(true);
});
