import { fireEvent, screen } from "expo-router/testing-library";
import { shiftMonth } from "@/features/finance/model";
import { en, enI18n, fixture, fmt, MONTH, renderApp, stored } from "./helpers/app";

// Budget cards read "Edit <name> budget, <kind of budget>".
const budgetRow = (name: string) => new RegExp(`^${en("budgets.editA11y", { name })}, `);

const LAST_MONTH = shiftMonth(MONTH, -1);
const SPENT = 45_000 + 120_000; // fixture expenses this month

test("creating a category budget with rollover enabled", async () => {
  const { user } = await renderApp("/budgets");
  expect(await screen.findByText(en("budgets.emptyTitle"))).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: en("budgets.create") }));
  expect(await screen.findByText(en("budgetForm.newTitle"))).toBeOnTheScreen();

  expect(
    screen.getByRole("button", { name: en("common.selectValue", { label: en("txForm.category"), value: "Groceries" }) }),
  ).toBeOnTheScreen();
  await user.type(screen.getByLabelText(en("budgetForm.limitA11y")), "3000");
  const rollover = screen.getByRole("switch", { name: en("budgetForm.rollover") });
  expect(rollover).not.toBeChecked();
  await fireEvent(rollover, "valueChange", true);
  expect(rollover).toBeChecked();
  await user.press(screen.getByRole("button", { name: en("budgetForm.save") }));

  expect(await screen.findByRole("button", { name: budgetRow("Groceries") })).toBeOnTheScreen();
  expect((await stored()).budgets).toEqual([
    expect.objectContaining({ categoryId: "groceries", month: MONTH, currency: "DOP", limit: 300_000, rollover: true }),
  ]);
});

test("copy from last month brings over last month's budgets", async () => {
  const state = fixture({
    budgets: [
      { id: "b-groc", categoryId: "groceries", currency: "DOP", month: LAST_MONTH, limit: 500_000, rollover: false },
      { id: "b-rent", categoryId: "rent", currency: "DOP", month: LAST_MONTH, limit: 2_000_000, rollover: true },
    ],
  });
  const { user } = await renderApp("/budgets", state);
  const month = enI18n.monthName(LAST_MONTH);
  await user.press(await screen.findByRole("button", { name: en("budgets.copyFrom", { month }) }));

  expect(await screen.findByText(en("budgets.copied", { count: 2, month }))).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: budgetRow("Groceries") })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: budgetRow("Rent") })).toBeOnTheScreen();
  const copied = (await stored()).budgets.filter((b) => b.month === MONTH);
  expect(copied).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ categoryId: "groceries", limit: 500_000, rollover: false }),
      expect.objectContaining({ categoryId: "rent", limit: 2_000_000, rollover: true }),
    ]),
  );
  expect(copied).toHaveLength(2);
});

test("overall monthly budget card switches to the cap once set", async () => {
  const { user } = await renderApp("/budgets");
  expect(await screen.findByText(en("monthlyCard.leftPlan"))).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: en("monthlyForm.newTitle") }));
  await user.type(await screen.findByLabelText(en("monthlyForm.limitA11y")), "20000");
  await user.press(screen.getByRole("button", { name: en("monthlyForm.save") }));

  expect(await screen.findByText(en("monthlyCard.left"))).toBeOnTheScreen();
  expect(screen.getByText(fmt(2_000_000 - SPENT))).toBeOnTheScreen();
  expect(screen.getByText(en("monthlyCard.spentTotal", { amount: fmt(SPENT) }))).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: en("monthlyCard.edit") })).toBeOnTheScreen();
  expect((await stored()).monthlyBudgets).toEqual([
    expect.objectContaining({ month: MONTH, currency: "DOP", limit: 2_000_000 }),
  ]);
});
