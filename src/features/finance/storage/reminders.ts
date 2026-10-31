import { t } from "../../../shared/i18n/core.ts";
import { nextDate, type Account, type Recurring } from "../model.ts";

// iOS keeps at most 64 pending local notifications per app; stay below it.
export const REMINDER_CAP = 60;
export const REMINDER_PREFIX = "jav:";
export type ReminderInput = {
  // biometrics: the app lock is on (see `add` below).
  settings: { notifications: boolean; biometrics?: boolean };
  recurring: Pick<
    Recurring,
    | "id"
    | "title"
    | "kind"
    | "active"
    | "nextDate"
    | "frequency"
    | "anchorDay"
    | "intervalDays"
  >[];
  accounts: Pick<Account, "id" | "name" | "type" | "dueDay">[];
};
export type PlannedReminder = {
  identifier: string;
  title: string;
  body: string;
  date: Date;
};
export type ReminderOptions = {
  cap?: number;
  perSource?: number;
  horizonDays?: number;
};

const at9 = (date: string) => new Date(`${date}T09:00:00`);
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function planReminders(
  state: ReminderInput,
  now = new Date(),
  { cap = REMINDER_CAP, perSource = 6, horizonDays = 120 }: ReminderOptions = {},
): PlannedReminder[] {
  if (!state.settings.notifications) return [];
  const end = new Date(now);
  end.setDate(end.getDate() + horizonDays);
  const planned: PlannedReminder[] = [];
  // Notifications show on the lock screen: with the app lock on, never name
  // the payee or card (the generic title alone still says a bill is due).
  const locked = state.settings.biometrics === true;
  const add = (source: string, title: string, date: Date) =>
    planned.push({
      identifier: `${REMINDER_PREFIX}${source}:${ymd(date)}`,
      title: t("reminders.billDue"),
      body: locked ? "" : title,
      date,
    });
  for (const rule of state.recurring) {
    if (!rule.active || rule.kind !== "expense") continue;
    let date = rule.nextDate;
    for (let found = 0, guard = 0; found < perSource && guard < 1000; guard++) {
      const when = at9(date);
      if (Number.isNaN(when.valueOf()) || when > end) break;
      if (when > now) {
        add(rule.id, rule.title, when);
        found++;
      }
      date = nextDate(date, rule.frequency, rule.anchorDay, rule.intervalDays);
    }
  }
  for (const account of state.accounts) {
    if (account.type !== "credit" || !account.dueDay) continue;
    for (let month = 0, found = 0; found < perSource && month <= perSource; month++) {
      const last = new Date(now.getFullYear(), now.getMonth() + month + 1, 0);
      const when = new Date(last.getFullYear(), last.getMonth(), Math.min(account.dueDay, last.getDate()), 9);
      if (when > end) break;
      if (when <= now) continue;
      add(account.id, t("reminders.cardPayment", { name: account.name }), when);
      found++;
    }
  }
  return planned
    .sort((a, b) => a.date.valueOf() - b.date.valueOf() || a.identifier.localeCompare(b.identifier))
    .slice(0, cap);
}
