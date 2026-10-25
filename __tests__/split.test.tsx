import { screen } from "expo-router/testing-library";
import { en, fmt, renderApp, stored } from "./helpers/app";

test("split shows remaining-to-allocate and blocks a mismatched total", async () => {
  const { user } = await renderApp("/add");
  await user.type(await screen.findByLabelText(en("txForm.amount")), "1000");
  await user.type(screen.getByLabelText(en("txForm.description")), "Warehouse run");
  await user.press(screen.getByRole("button", { name: en("txForm.split") }));

  expect(screen.getByText(en("split.remaining", { amount: fmt(100_000) }))).toBeOnTheScreen();
  await user.type(screen.getByLabelText(en("split.amount", { part: 1 })), "600");
  expect(screen.getByText(en("split.remaining", { amount: fmt(40_000) }))).toBeOnTheScreen();
  await user.type(screen.getByLabelText(en("split.amount", { part: 2 })), "500");
  expect(screen.getByText(en("split.over", { amount: fmt(10_000) }))).toBeOnTheScreen();

  await user.press(screen.getByRole("button", { name: en("txForm.save") }));
  expect(await screen.findByText(en("errors.splitTotal"))).toBeOnTheScreen();
  expect((await stored()).transactions).toHaveLength(3);

  const second = screen.getByLabelText(en("split.amount", { part: 2 }));
  await user.clear(second);
  await user.type(second, "400");
  expect(screen.getByText(en("split.allocated"))).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: en("txForm.save") }));

  expect(await screen.findByText(en("txForm.added"))).toBeOnTheScreen();
  const saved = (await stored()).transactions.find((t) => t.title === "Warehouse run");
  expect(saved).toMatchObject({
    amount: 100_000,
    categoryId: "groceries",
    splits: [
      { categoryId: "groceries", amount: 60_000 },
      { categoryId: "dining", amount: 40_000 },
    ],
  });
});

test("use remaining fills the open part", async () => {
  const { user } = await renderApp("/add");
  await user.type(await screen.findByLabelText(en("txForm.amount")), "80");
  await user.press(screen.getByRole("button", { name: en("txForm.split") }));
  await user.type(screen.getByLabelText(en("split.amount", { part: 1 })), "30");
  await user.press(screen.getByRole("button", { name: en("split.useRemaining") }));
  expect(screen.getByLabelText(en("split.amount", { part: 2 }))).toHaveDisplayValue("50");
  expect(screen.getByText(en("split.allocated"))).toBeOnTheScreen();
});
