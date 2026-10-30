import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backupFileName,
  hasRealData,
  isBackupDue,
  isExportReminderDue,
  parseBackupName,
  selectRetained,
  serializeBackup,
} from "../src/features/backup/policy.ts";
import { emptyState } from "../src/features/finance/defaults.ts";
import { parseState } from "../src/features/finance/schema.ts";

test("backup file names round-trip and only strict names parse", () => {
  assert.equal(backupFileName("2026-10-25"), "jav-budget-2026-10-25.json");
  assert.equal(parseBackupName("jav-budget-2026-10-25.json"), "2026-10-25");
  for (const name of [
    "jav-budget-2026-02-30.json", // not a real date
    "jav-budget-2026-10-25.json.tmp",
    ".jav-budget-2026-10-25.json.tmp",
    "jav-budget-2026-10-25 (1).json",
    "Jav-budget-2026-10-25.json",
    "jav-budget-26-10-25.json",
    "../jav-budget-2026-10-25.json",
    "notes.json",
  ])
    assert.equal(parseBackupName(name), undefined, name);
  assert.throws(() => backupFileName("2026-13-01"));
});

test("a backup is due once per day for enabled real data", () => {
  const base = { today: "2026-10-25", enabled: true, realData: true };
  assert.equal(isBackupDue({ ...base, dates: [] }), true);
  assert.equal(isBackupDue({ ...base, dates: ["2026-10-24"] }), true);
  assert.equal(isBackupDue({ ...base, dates: ["2026-10-25", "2026-10-24"] }), false);
  // Clock moved back: today's file is still missing, so back up.
  assert.equal(isBackupDue({ ...base, dates: ["2026-11-02"] }), true);
  assert.equal(isBackupDue({ ...base, enabled: false, dates: [] }), false);
  assert.equal(isBackupDue({ ...base, realData: false, dates: [] }), false);
});

test("empty ledgers are not real data", () => {
  const empty = emptyState();
  assert.equal(hasRealData(empty), false);
  const account = { id: "a", name: "Cash", type: "cash", currency: "DOP", opening: 0, color: "#000000" } as const;
  assert.equal(hasRealData({ ...empty, accounts: [account] }), true);
});

test("retention keeps 7 recent backups plus the newest of the 3 previous months", () => {
  const dates: string[] = [];
  for (let d = new Date(2026, 5, 1); d <= new Date(2026, 9, 25); d.setDate(d.getDate() + 1))
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  const { keep, remove } = selectRetained(dates);
  assert.deepEqual(keep, [
    "2026-10-25",
    "2026-10-24",
    "2026-10-23",
    "2026-10-22",
    "2026-10-21",
    "2026-10-20",
    "2026-10-19",
    "2026-09-30",
    "2026-08-31",
    "2026-07-31",
  ]);
  assert.equal(keep.length + remove.length, dates.length);
  assert.ok(remove.includes("2026-06-30"));
  assert.ok(remove.includes("2026-10-18"));
});

test("retention is count-based, so sparse or old backups survive", () => {
  const sparse = ["2025-01-10", "2025-03-02", "2026-10-25"];
  assert.deepEqual(selectRetained(sparse), {
    keep: ["2026-10-25", "2025-03-02", "2025-01-10"],
    remove: [],
  });
  assert.deepEqual(selectRetained([]), { keep: [], remove: [] });
  // Invalid entries are ignored, duplicates collapsed.
  assert.deepEqual(selectRetained(["2026-10-25", "2026-10-25", "bad"]).keep, ["2026-10-25"]);
});

test("the backup serializer round-trips through parseState", () => {
  const state = parseState(emptyState());
  const restored = parseState(JSON.parse(serializeBackup(state)));
  assert.deepEqual(restored, state);
  assert.equal(restored.settings.autoBackup, true);
});

test("autoBackup defaults to true for data saved before it existed", () => {
  const legacy = JSON.parse(serializeBackup(parseState(emptyState())));
  delete legacy.settings.autoBackup;
  delete legacy.settings.lastExportAt;
  const state = parseState(legacy);
  assert.equal(state.settings.autoBackup, true);
  assert.equal(state.settings.lastExportAt, undefined);
  assert.throws(() =>
    parseState({ ...legacy, settings: { ...legacy.settings, lastExportAt: "never" } }),
  );
});

test("the web export reminder waits 30 days from the last export, first use or dismissal", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const days = (n: number) => new Date(now.valueOf() - n * 86_400_000).toISOString();
  assert.equal(isExportReminderDue({ now, realData: true }), false);
  assert.equal(isExportReminderDue({ now, realData: true, firstSeenAt: days(29) }), false);
  assert.equal(isExportReminderDue({ now, realData: true, firstSeenAt: days(30) }), true);
  assert.equal(isExportReminderDue({ now, realData: false, firstSeenAt: days(90) }), false);
  assert.equal(
    isExportReminderDue({ now, realData: true, firstSeenAt: days(90), lastExportAt: days(3) }),
    false,
  );
  assert.equal(
    isExportReminderDue({ now, realData: true, lastExportAt: days(45), dismissedAt: days(2) }),
    false,
  );
  assert.equal(isExportReminderDue({ now, realData: true, lastExportAt: days(45) }), true);
});
