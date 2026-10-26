import { screen } from "expo-router/testing-library";
import { en, renderApp, stored } from "./helpers/app";

// Budget cards read "Edit <name> budget, <kind of budget>".
const budgetRow = (name: string) => new RegExp(`^${en("budgets.editA11y", { name })}, `);

const categorySelect = (value: string) =>
  ({ name: en("common.selectValue", { label: en("txForm.category"), value }) });

test("a category created from the budget form picker is selected and saved", async () => {
  const { user } = await renderApp("/budgets");
  await user.press(await screen.findByRole("button", { name: en("budgets.create") }));
  await user.press(await screen.findByRole("button", categorySelect("Groceries")));
  // The row label also contains the icon glyph, so target its text.
  await user.press(await screen.findByText(en("common.createCategory")));

  expect(await screen.findByText(en("categoryForm.newTitle"))).toBeOnTheScreen();
  await user.type(screen.getByLabelText(en("categoryForm.name")), "Pet care");
  await user.press(screen.getByRole("button", { name: en("categoryForm.save") }));

  expect(await screen.findByRole("button", categorySelect("Pet care"))).toBeOnTheScreen();
  const created = (await stored()).categories.find((c) => c.name === "Pet care");
  expect(created).toMatchObject({ kind: "expense" });

  await user.type(screen.getByLabelText(en("budgetForm.limitA11y")), "1500");
  await user.press(screen.getByRole("button", { name: en("budgetForm.save") }));
  expect(await screen.findByRole("button", { name: budgetRow("Pet care") })).toBeOnTheScreen();
  expect((await stored()).budgets).toEqual([expect.objectContaining({ categoryId: created!.id, limit: 150_000 })]);
});

test("a category created from the transaction form keeps the draft", async () => {
  const { user } = await renderApp("/add");
  await user.type(await screen.findByLabelText(en("txForm.amount")), "42");
  await user.press(screen.getByRole("button", categorySelect("Groceries")));
  // The row label also contains the icon glyph, so target its text.
  await user.press(await screen.findByText(en("common.createCategory")));
  await user.type(await screen.findByLabelText(en("categoryForm.name")), "Books");
  await user.press(screen.getByRole("button", { name: en("categoryForm.save") }));

  expect(await screen.findByRole("button", categorySelect("Books"))).toBeOnTheScreen();
  expect(screen.getByLabelText(en("txForm.amount"))).toHaveDisplayValue("42");
});
