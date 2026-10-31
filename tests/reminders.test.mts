import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planReminders,
  REMINDER_CAP,
  type ReminderInput,
} from "../src/features/finance/storage/reminders.ts";

const now = new Date(2026, 0, 10, 12, 0, 0);
const rule = (id: string, over: Partial<ReminderInput["recurring"][number]> = {}) => ({
  id,
  title: `Bill ${id}`,
  kind: "expense" as const,
  active: true,
  nextDate: "2026-01-15",
  frequency: "monthly" as const,
  anchorDay: 15,
  ...over,
});
const input = (over: Partial<ReminderInput> = {}): ReminderInput => ({
  settings: { notifications: true },
  recurring: [],
  accounts: [],
  ...over,
});

test("disabled notifications schedule nothing", () => {
  assert.deepEqual(
    planReminders(input({ settings: { notifications: false }, recurring: [rule("r")] }), now),
    [],
  );
});

test("schedules several upcoming occurrences per expense rule at 9:00", () => {
  const plan = planReminders(input({ recurring: [rule("rent")] }), now);
  assert.deepEqual(
    plan.map((r) => r.identifier),
    ["jav:rent:2026-01-15", "jav:rent:2026-02-15", "jav:rent:2026-03-15", "jav:rent:2026-04-15"],
  );
  assert.equal(plan[0].date.getHours(), 9);
  assert.equal(plan[0].body, "Bill rent");
});

test("skips inactive, income and past occurrences", () => {
  const plan = planReminders(
    input({
      recurring: [
        rule("off", { active: false }),
        rule("pay", { kind: "income" }),
        rule("daily", { nextDate: "2026-01-10", frequency: "daily", anchorDay: 10 }),
      ],
    }),
    now,
    { perSource: 2 },
  );
  assert.deepEqual(plan.map((r) => r.identifier), ["jav:daily:2026-01-11", "jav:daily:2026-01-12"]);
});

test("credit card due dates clamp to month end", () => {
  const plan = planReminders(
    input({ accounts: [{ id: "card", name: "Visa", type: "credit", dueDay: 31 }, { id: "c", name: "Cash", type: "cash" }] }),
    now,
    { perSource: 3 },
  );
  assert.deepEqual(plan.map((r) => r.identifier), ["jav:card:2026-01-31", "jav:card:2026-02-28", "jav:card:2026-03-31"]);
  assert.equal(plan[0].body, "Visa payment");
});

test("nearest first within the global cap and below iOS's 64 limit", () => {
  const recurring = Array.from({ length: 30 }, (_, i) =>
    rule(`r${i}`, { nextDate: "2026-01-11", frequency: "weekly", anchorDay: 11 }),
  );
  const plan = planReminders(input({ recurring }), now);
  assert.equal(plan.length, REMINDER_CAP);
  assert.ok(REMINDER_CAP < 64);
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i - 1].date <= plan[i].date);
  assert.equal(new Set(plan.map((r) => r.identifier)).size, plan.length);
  assert.equal(plan.at(-1)!.date.getDate(), 18);
});

test("planning is deterministic for idempotent rescheduling", () => {
  const state = input({ recurring: [rule("a"), rule("b", { nextDate: "2026-01-12", frequency: "weekly", anchorDay: 12 })] });
  assert.deepEqual(planReminders(state, now), planReminders(state, now));
});

test("with the app lock on, lock-screen reminders don't name the bill or card", () => {
  const accounts = [{ id: "visa", name: "Visa Gold", type: "credit" as const, dueDay: 20 }];
  const open = planReminders(input({ recurring: [rule("rent")], accounts }), now);
  assert.ok(open.some((r) => r.body === "Bill rent"));
  assert.ok(open.some((r) => r.body.includes("Visa Gold")));
  const locked = planReminders(
    input({ settings: { notifications: true, biometrics: true }, recurring: [rule("rent")], accounts }),
    now,
  );
  assert.equal(locked.length, open.length);
  for (const reminder of locked) {
    assert.equal(reminder.body, "");
    assert.equal(reminder.title, open[0].title);
  }
});
