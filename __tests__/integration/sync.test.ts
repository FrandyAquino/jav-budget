/**
 * @jest-environment ./__tests__/integration/environment.js
 */
// Opt-in integration test: the real sync engine against the real Supabase
// project, with two devices of user A and one device of user B.
// Runs only with SUPABASE_IT=1 and the SUPABASE_IT_* variables (environment or
// the gitignored __tests__/integration/credentials.local.json): `npm run test:it`. Skipped otherwise.
import type { SupabaseClient } from "@supabase/supabase-js";
import { demoState, emptyState, monthKey, today, type FinanceState } from "@/features/finance/model";
import { parseState } from "@/features/finance/schema";
import { DEVICE_LOCAL_SETTINGS, SHARED_SETTINGS, SYNCED_COLLECTIONS, metaKey } from "@/features/sync/core";
import {
  IT,
  createDevice,
  enabled,
  newClient,
  receiptUri,
  serverMeta,
  serverReceipts,
  serverRecords,
  signIn,
  wipeUser,
  type Device,
} from "./harness";

const describeIT = enabled ? describe : describe.skip;
jest.setTimeout(120_000);

const TODAY = today();
const MONTH = monthKey();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The synced part of a ledger (collections + shared settings).
function synced(state: FinanceState | null) {
  if (!state) throw new Error("No ledger");
  const parsed = parseState(state);
  return {
    ...Object.fromEntries(SYNCED_COLLECTIONS.map((c) => [c, parsed[c]])),
    settings: Object.fromEntries(SHARED_SETTINGS.map((f) => [f, parsed.settings[f] ?? null])),
  };
}
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
// Same as synced() with every collection sorted by id (order-insensitive).
function syncedSet(state: FinanceState | null) {
  const view = synced(state) as Record<string, unknown>;
  for (const c of SYNCED_COLLECTIONS)
    view[c] = [...(view[c] as { id: string }[])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return view;
}

// Device 1's ledger: every synced collection, a split + tags, shared settings
// and non-default device-local settings.
function ledgerA(): FinanceState {
  const base = emptyState();
  return parseState({
    ...base,
    accounts: [
      { id: "a-main", name: "Main checking", type: "bank", currency: "DOP", opening: 1_000_000, color: "#356C56" },
      { id: "a-usd", name: "Dollar savings", type: "bank", currency: "USD", opening: 50_000, color: "#6F97B2" },
      { id: "a-card", name: "Visa", type: "credit", currency: "DOP", opening: -20_000, color: "#7C78A5", limit: 5_000_000, dueDay: 28 },
    ],
    categories: [
      { id: "c-groceries", name: "Groceries", icon: "shopping-bag", color: "#555B65", kind: "expense" },
      { id: "c-dining", name: "Dining out", icon: "coffee", color: "#7F6A7E", kind: "expense" },
      { id: "c-home", name: "Home", icon: "home", color: "#687666", kind: "expense" },
      { id: "c-salary", name: "Salary", icon: "briefcase", color: "#687666", kind: "income" },
    ],
    transactions: [
      {
        id: "t-split", kind: "expense", amount: 10_000, accountId: "a-main", categoryId: "c-groceries",
        title: "Market + hardware", note: "split", date: TODAY, tags: ["Weekly", "market"],
        splits: [{ categoryId: "c-groceries", amount: 6_000 }, { categoryId: "c-home", amount: 4_000 }],
      },
      { id: "t-dinner", kind: "expense", amount: 2_500, accountId: "a-card", categoryId: "c-dining", title: "Dinner", note: "", date: TODAY, time: "21:15", tags: ["friends"] },
      { id: "t-pay", kind: "income", amount: 300_000, accountId: "a-main", categoryId: "c-salary", title: "Paycheck", note: "", date: TODAY, tags: [] },
      { id: "t-move", kind: "transfer", amount: 59_500, received: 1_000, accountId: "a-main", toAccountId: "a-usd", categoryId: "", title: "To savings", note: "", date: TODAY, tags: [] },
    ],
    budgets: [{ id: "b-groceries", categoryId: "c-groceries", currency: "DOP", month: MONTH, limit: 50_000, rollover: true }],
    monthlyBudgets: [{ id: "mb-dop", currency: "DOP", month: MONTH, limit: 200_000 }],
    recurring: [
      {
        id: "r-rent", kind: "expense", amount: 150_000, accountId: "a-main", categoryId: "c-home", title: "Rent", note: "",
        tags: ["home"], nextDate: TODAY, frequency: "monthly", anchorDay: 1, active: true, subscription: false,
      },
    ],
    goals: [{ id: "g-trip", name: "Trip", currency: "USD", target: 100_000, saved: 25_000 }],
    settings: {
      ...base.settings,
      name: "Ana IT",
      email: IT.emailA,
      currency: "USD",
      numberEntry: "cents",
      exchangeRate: { dopPerUsd: 59.5, updatedAt: "2026-10-20T12:00:00.000Z" },
      // Device-local: never uploaded nor applied from the cloud.
      onboarded: true,
      biometrics: true,
      notifications: true,
      appearance: "dark",
      language: "es",
      appIcon: "chalk",
      autoBackup: false,
    },
  });
}
// A brand-new install that hasn't finished the onboarding.
const freshInstall = () => emptyState();

describeIT("cloud sync against Supabase (integration)", () => {
  let readerA: SupabaseClient; // verification clients, signed in as each user
  let readerB: SupabaseClient;
  let userA = "";
  let userB = "";
  // Scenarios 1-4 share these two devices of user A.
  let d1: Device;
  let d2: Device;

  beforeAll(async () => {
    readerA = newClient();
    readerB = newClient();
    userA = await signIn(readerA, IT.emailA);
    userB = await signIn(readerB, IT.emailB);
    await wipeUser(readerA, userA);
    await wipeUser(readerB, userB);
  });
  afterAll(async () => {
    if (!readerA || !readerB) return;
    await wipeUser(readerA, userA);
    await wipeUser(readerB, userB);
  });

  test("1. a device with data signs in on an empty cloud and pushes", async () => {
    expect(await serverRecords(readerA, userA)).toEqual([]);
    d1 = createDevice("device 1 (A)");
    d1.seed(ledgerA());
    await d1.signIn(IT.emailA);
    await d1.sync();

    expect(d1.status.getSyncStatus()).toMatchObject({ phase: "idle", decision: null, user: { id: userA } });
    const local = ledgerA();
    const rows = await serverRecords(readerA, userA);
    expect(rows.every((r) => r.user_id === userA && !r.deleted)).toBe(true);
    for (const collection of SYNCED_COLLECTIONS) {
      const pushed = rows.filter((r) => r.collection === collection);
      expect(ids(pushed)).toEqual(ids(local[collection]));
      for (const row of pushed) {
        const index = local[collection].findIndex((r) => r.id === row.id);
        expect(row.data).toEqual(local[collection][index]);
        expect(row.position).toBe(index);
      }
    }
    // Split + tags arrive intact.
    expect(rows.find((r) => r.id === "t-split")?.data).toMatchObject({
      splits: [{ categoryId: "c-groceries", amount: 6_000 }, { categoryId: "c-home", amount: 4_000 }],
      tags: ["weekly", "market"],
    });
    // Shared settings only; device-local settings are never uploaded.
    const meta = await serverMeta(readerA, userA);
    expect(meta.map((m) => m.key).sort()).toEqual(SHARED_SETTINGS.map(metaKey).sort());
    for (const field of DEVICE_LOCAL_SETTINGS) expect(meta.map((m) => m.key)).not.toContain(metaKey(field as never));
    expect(Object.fromEntries(meta.map((m) => [m.key, m.data]))).toEqual({
      settings_name: "Ana IT",
      settings_email: IT.emailA,
      settings_currency: "USD",
      settings_numberEntry: "cents",
      settings_exchangeRate: { dopPerUsd: 59.5, updatedAt: "2026-10-20T12:00:00.000Z" },
    });
    // Everything acknowledged; this device is bound to user A.
    expect(d1.local().outbox).toEqual({});
    expect(d1.local().values).toMatchObject({ userId: userA, bootstrapped: userA });
  });

  test("1b. sample (demo) data is never pushed", async () => {
    const before = await serverRecords(readerA, userA);
    const demo = createDevice("demo device (A)");
    demo.seed(demoState());
    await demo.signIn(IT.emailA);
    await demo.sync();
    expect(demo.status.getSyncStatus()).toMatchObject({ phase: "paused", decision: { kind: "demo", remoteHasData: true } });
    // Asking again keeps the question (still nothing pushed).
    await demo.sync();
    expect(demo.status.getSyncStatus().decision).toEqual({ kind: "demo", remoteHasData: true });
    // "Keep the demo": sync stays paused.
    await demo.engine.resolveDecision("keepDemo");
    await demo.sync();
    expect(demo.status.getSyncStatus()).toMatchObject({ phase: "paused", decision: null });
    const after = await serverRecords(readerA, userA);
    expect(after).toEqual(before);
    const demoIds = new Set(SYNCED_COLLECTIONS.flatMap((c) => demoState()[c].map((r) => r.id)));
    expect(after.some((r) => demoIds.has(r.id) && !ledgerA()[r.collection as "accounts"].some((x) => x.id === r.id))).toBe(false);
    expect((await serverMeta(readerA, userA)).find((m) => m.key === "settings_name")?.data).toBe("Ana IT");
    // The demo device's ledger is untouched.
    expect(demo.state()?.demo).toBe(true);
  });

  test("2. an empty second device signs in and pulls everything", async () => {
    d2 = createDevice("device 2 (A)");
    d2.seed(freshInstall());
    await d2.signIn(IT.emailA);
    await d2.sync();
    expect(d2.status.getSyncStatus()).toMatchObject({ phase: "idle", decision: null });

    const state = d2.state()!;
    expect(() => parseState(state)).not.toThrow();
    expect(state.settings.onboarded).toBe(true);
    expect(state.demo).toBe(false);
    expect(synced(state)).toEqual(synced(d1.state()));
    // Device-local settings stay this device's own.
    const fresh = freshInstall().settings;
    for (const field of ["biometrics", "notifications", "appearance", "language", "appIcon", "autoBackup"] as const)
      expect(state.settings[field]).toEqual(fresh[field]);
    // The empty device's own (epoch-stamped) settings lost to the cloud copy.
    const meta = await serverMeta(readerA, userA);
    expect(meta.find((m) => m.key === "settings_name")?.data).toBe("Ana IT");
    // Device 1 sees no change coming back.
    const before = synced(d1.state());
    await d1.sync();
    expect(synced(d1.state())).toEqual(before);
    expect(d2.local().outbox).toEqual({});
  });

  test("3. edits on device 2 reach device 1 (update, delete as tombstone, add)", async () => {
    await d2.edit((s) => ({
      ...s,
      transactions: [
        ...s.transactions.map((t) => (t.id === "t-dinner" ? { ...t, amount: 3_100 } : t)),
        { id: "t-new", kind: "expense", amount: 900, accountId: "a-main", categoryId: "c-dining", title: "Coffee", note: "", date: TODAY, tags: ["morning"] },
      ],
      goals: s.goals.filter((g) => g.id !== "g-trip"),
    }));
    expect(Object.keys(d2.local().outbox).sort()).toEqual(["r/goals/g-trip", "r/transactions/t-dinner", "r/transactions/t-new"]);
    await d2.sync();
    expect(d2.local().outbox).toEqual({});

    const rows = await serverRecords(readerA, userA);
    const goal = rows.find((r) => r.collection === "goals" && r.id === "g-trip");
    expect(goal).toMatchObject({ deleted: true, data: null });
    expect(rows.find((r) => r.id === "t-dinner")?.data).toMatchObject({ amount: 3_100 });
    expect(rows.find((r) => r.id === "t-new")).toBeDefined();

    await d1.sync();
    const s1 = d1.state()!;
    expect(s1.transactions.find((t) => t.id === "t-dinner")?.amount).toBe(3_100);
    expect(s1.transactions.find((t) => t.id === "t-new")).toMatchObject({ title: "Coffee", tags: ["morning"] });
    expect(s1.goals.map((g) => g.id)).not.toContain("g-trip");
    expect(synced(s1)).toEqual(synced(d2.state()));
    // Device 1 kept its own device-local settings.
    expect(s1.settings).toMatchObject({ biometrics: true, appearance: "dark", language: "es" });
  });

  test("4. concurrent offline edits of the same record converge to the newer one", async () => {
    // Older edit syncs first, then the newer one.
    await d1.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === "t-pay" ? { ...t, title: "Paycheck (d1, older)" } : t)) }));
    await sleep(25);
    await d2.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === "t-pay" ? { ...t, title: "Paycheck (d2, newer)" } : t)) }));
    const newerPay = d2.local().outbox["r/transactions/t-pay"];
    // Newer edit syncs first, then the older one (its upsert must lose on the server).
    await d1.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === "t-split" ? { ...t, note: "d1 older" } : t)) }));
    await sleep(25);
    await d2.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === "t-split" ? { ...t, note: "d2 newer" } : t)) }));
    const newerSplit = d2.local().outbox["r/transactions/t-split"];
    // And a shared setting edited on both.
    await d1.edit((s) => ({ ...s, settings: { ...s.settings, name: "Ana (d1, older)" } }));
    await sleep(25);
    await d2.edit((s) => ({ ...s, settings: { ...s.settings, name: "Ana (d2, newer)" } }));

    await d1.sync(); // pushes t-pay (older) + t-split (older) + name (older)
    await d2.sync(); // t-pay/name newer win; t-split newer wins
    await d1.sync(); // pulls the newer copies
    await d2.sync();

    for (const device of [d1, d2]) {
      const s = device.state()!;
      expect(s.transactions.find((t) => t.id === "t-pay")?.title).toBe("Paycheck (d2, newer)");
      expect(s.transactions.find((t) => t.id === "t-split")?.note).toBe("d2 newer");
      expect(s.settings.name).toBe("Ana (d2, newer)");
      expect(device.local().outbox).toEqual({});
    }
    expect(synced(d1.state())).toEqual(synced(d2.state()));
    const rows = await serverRecords(readerA, userA);
    expect(Date.parse(rows.find((r) => r.id === "t-pay")!.client_updated_at)).toBe(Date.parse(newerPay));
    expect(Date.parse(rows.find((r) => r.id === "t-split")!.client_updated_at)).toBe(Date.parse(newerSplit));

    // Reverse order: the newer edit is pushed first, the older device syncs after.
    await d1.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === "t-new" ? { ...t, amount: 111 } : t)) }));
    await sleep(25);
    await d2.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === "t-new" ? { ...t, amount: 222 } : t)) }));
    await d2.sync();
    await d1.sync(); // its older upsert is ignored by the server; pull brings 222
    await d2.sync();
    for (const device of [d1, d2]) expect(device.state()!.transactions.find((t) => t.id === "t-new")?.amount).toBe(222);
    expect((await serverRecords(readerA, userA)).find((r) => r.id === "t-new")?.data).toMatchObject({ amount: 222 });
  });

  // Scenarios 5-8 start from an empty cloud with fresh devices.
  let m1: Device;
  test("5. device and cloud both have data: the engine asks, Merge unions both", async () => {
    await wipeUser(readerA, userA);
    m1 = createDevice("merge device 1 (A)");
    m1.seed(ledgerA());
    await m1.signIn(IT.emailA);
    await m1.sync(); // empty cloud -> push
    expect(m1.status.getSyncStatus().decision).toBeNull();

    // A second device with its own data. "a-main" exists on both with a different name.
    const own = ledgerA();
    const q: FinanceState = parseState({
      ...emptyState(),
      accounts: [
        { ...own.accounts[0], name: "Main (device 2 copy)" },
        { id: "q-cash", name: "Cash wallet", type: "cash", currency: "DOP", opening: 5_000, color: "#BA965C" },
      ],
      categories: [{ id: "q-fun", name: "Fun", icon: "music", color: "#7F6A7E", kind: "expense" }],
      transactions: [{ id: "q-movie", kind: "expense", amount: 1_200, accountId: "q-cash", categoryId: "q-fun", title: "Movie", note: "", date: TODAY, tags: [] }],
      goals: [{ id: "q-bike", name: "Bike", currency: "DOP", target: 900_000, saved: 0 }],
      settings: { ...emptyState().settings, name: "Device two", onboarded: true },
    });
    const m2 = createDevice("merge device 2 (A)");
    m2.seed(q);
    await m2.signIn(IT.emailA);
    const cloudBefore = await serverRecords(readerA, userA);
    await m2.sync();
    // The decision API: paused with a "merge" question; nothing changed yet.
    expect(m2.status.getSyncStatus()).toMatchObject({ phase: "paused", decision: { kind: "merge" } });
    expect(m2.state()).toEqual(q);
    expect(await serverRecords(readerA, userA)).toEqual(cloudBefore);
    // A later cycle asks again rather than merging silently.
    await m2.sync();
    expect(m2.status.getSyncStatus().decision).toEqual({ kind: "merge" });

    await m2.engine.resolveDecision("merge");
    await m2.engine.whenIdle();
    expect(m2.status.getSyncStatus()).toMatchObject({ phase: "idle", decision: null });
    await m1.sync();

    const s1 = m1.state()!;
    const s2 = m2.state()!;
    // Same records and values on both devices. (List order may differ after a
    // merge: each device keeps its own records first and appends the others.)
    expect(syncedSet(s1)).toEqual(syncedSet(s2));
    expect(ids(s2.accounts)).toEqual(ids([...own.accounts, { id: "q-cash" }]));
    expect(ids(s2.transactions)).toEqual(ids([...own.transactions, { id: "q-movie" }]));
    expect(ids(s2.goals)).toEqual(["g-trip", "q-bike"]);
    // Conflicts and shared settings: the cloud copy wins a merge.
    expect(s2.accounts.find((a) => a.id === "a-main")?.name).toBe("Main checking");
    expect(s2.settings.name).toBe("Ana IT");
    expect(s2.settings.currency).toBe("USD");
    const rows = await serverRecords(readerA, userA);
    expect(ids(rows.filter((r) => r.collection === "transactions"))).toEqual(ids(s1.transactions));
  });

  test("6. account switch requires Replace; nothing of A leaks to B", async () => {
    const aRowsBefore = await serverRecords(readerA, userA);
    await m1.edit((s) => ({ ...s, goals: [...s.goals, { id: "g-pending", name: "Pending at sign-out", currency: "DOP", target: 1_000, saved: 0 }] }));
    await m1.engine.signOut("keep");
    await m1.engine.whenIdle();
    expect(m1.status.getSyncStatus().user).toBeNull();
    // "keep" pushed the pending change to A before leaving and kept the data.
    expect((await serverRecords(readerA, userA)).find((r) => r.id === "g-pending")).toBeDefined();
    expect(ids(m1.state()!.goals)).toContain("g-pending");

    await m1.signIn(IT.emailB);
    await m1.sync();
    expect(m1.status.getSyncStatus()).toMatchObject({ phase: "paused", decision: { kind: "switch" }, user: { id: userB } });
    await m1.sync(); // still asking, never a silent merge
    expect(m1.status.getSyncStatus().decision).toEqual({ kind: "switch" });
    expect(await serverRecords(readerB, userB)).toEqual([]);
    expect(await serverMeta(readerB, userB)).toEqual([]);

    await m1.engine.resolveDecision("replace");
    await m1.engine.whenIdle();
    const replaced = m1.state()!;
    // B's (empty) cloud replaced A's data on this device; device settings kept.
    for (const c of SYNCED_COLLECTIONS) expect(replaced[c]).toEqual([]);
    expect(replaced.settings).toMatchObject({ onboarded: false, biometrics: true, appearance: "dark", language: "es" });
    expect(m1.local().values).toMatchObject({ userId: userB, bootstrapped: userB });
    expect(m1.local().outbox).toEqual({});
    expect(await serverRecords(readerB, userB)).toEqual([]);

    // B finishes onboarding on this device and adds data.
    await m1.edit((s) => ({
      ...s,
      accounts: [{ id: "b-acc", name: "B account", type: "bank", currency: "DOP", opening: 0, color: "#356C56" }],
      categories: [{ id: "b-cat", name: "B food", icon: "coffee", color: "#555B65", kind: "expense" }],
      transactions: [{ id: "b-tx", kind: "expense", amount: 700, accountId: "b-acc", categoryId: "b-cat", title: "B lunch", note: "", date: TODAY, tags: [] }],
      settings: { ...s.settings, name: "Bea", onboarded: true },
    }));
    await m1.sync();
    const bRows = await serverRecords(readerB);
    expect(bRows.every((r) => r.user_id === userB)).toBe(true);
    expect(bRows.map((r) => `${r.collection}/${r.id}`).sort()).toEqual(["accounts/b-acc", "categories/b-cat", "transactions/b-tx"]);
    expect((await serverMeta(readerB)).every((m) => m.user_id === userB)).toBe(true);
    expect((await serverMeta(readerB)).find((m) => m.key === "settings_name")?.data).toBe("Bea");
    // RLS: B can't see A's rows, and A's rows were not touched.
    expect(await serverRecords(readerB, userA)).toEqual([]);
    const aRowsAfter = await serverRecords(readerA, userA);
    expect(aRowsAfter.filter((r) => r.id !== "g-pending")).toEqual(aRowsBefore);
  });

  test("7. receipts upload to receipts/<uid>/ and download on the other device", async () => {
    await wipeUser(readerA, userA);
    const name = "itreceipt01.jpg";
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9]);
    const r1 = createDevice("receipt device 1 (A)");
    const ledger = ledgerA();
    ledger.transactions = ledger.transactions.map((t) => (t.id === "t-dinner" ? { ...t, receipt: receiptUri(name) } : t));
    r1.seed(ledger);
    r1.files.set(receiptUri(name), bytes);
    await r1.signIn(IT.emailA);
    await r1.sync();
    expect(await serverReceipts(readerA, userA)).toEqual([name]);
    expect(JSON.parse(r1.local().values.receipts ?? "[]")).toEqual([name]);
    // B can't read A's receipt.
    const denied = await readerB.storage.from("receipts").download(`${userA}/${name}`);
    expect(denied.data).toBeNull();

    const r2 = createDevice("receipt device 2 (A)");
    r2.seed(freshInstall());
    await r2.signIn(IT.emailA);
    await r2.sync();
    expect(r2.state()!.transactions.find((t) => t.id === "t-dinner")?.receipt).toBe(receiptUri(name));
    expect(r2.files.get(receiptUri(name))).toEqual(bytes);

    // Removing the photo from the transaction removes it from the cloud.
    await r2.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === "t-dinner" ? { ...t, receipt: undefined } : t)) }));
    await r2.sync();
    expect(await serverReceipts(readerA, userA)).toEqual([]);
    await r1.sync();
    expect(r1.state()!.transactions.find((t) => t.id === "t-dinner")?.receipt).toBeUndefined();
  });

  test("8. pull pages through more than 1000 rows", async () => {
    await wipeUser(readerA, userA);
    const COUNT = 1_100;
    const p1 = createDevice("paging device 1 (A)");
    p1.seed(
      parseState({
        ...emptyState(),
        accounts: [{ id: "p-acc", name: "Bulk", type: "bank", currency: "DOP", opening: 0, color: "#356C56" }],
        categories: [{ id: "p-cat", name: "Bulk", icon: "coffee", color: "#555B65", kind: "expense" }],
        transactions: Array.from({ length: COUNT }, (_, i) => ({
          id: `p-${String(i).padStart(4, "0")}`, kind: "expense", amount: i + 1, accountId: "p-acc", categoryId: "p-cat",
          title: `Item ${i}`, note: "", date: TODAY, tags: [],
        })),
        settings: { ...emptyState().settings, name: "Bulk", onboarded: true },
      }),
    );
    await p1.signIn(IT.emailA);
    await p1.sync();
    expect((await serverRecords(readerA, userA)).length).toBe(COUNT + 2);

    const p2 = createDevice("paging device 2 (A)");
    p2.seed(freshInstall());
    await p2.signIn(IT.emailA);
    await p2.sync();
    const pulled = p2.state()!;
    expect(pulled.transactions).toHaveLength(COUNT);
    expect(synced(pulled)).toEqual(synced(p1.state()));
    expect(JSON.parse(p2.local().values.parked ?? "[]")).toEqual([]);

    // Incremental pull (not the first sync) across pages too.
    await p1.edit((s) => ({ ...s, transactions: s.transactions.map((t) => ({ ...t, note: "bulk edit" })) }));
    await p1.sync();
    await p2.sync();
    expect(p2.state()!.transactions.every((t) => t.note === "bulk edit")).toBe(true);
    expect(synced(p2.state())).toEqual(synced(p1.state()));
  });
});
