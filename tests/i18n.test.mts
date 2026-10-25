import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveLanguage,
  setLanguage,
  getLanguage,
  translate,
  interpolate,
  t,
} from "../src/shared/i18n/core.ts";
import { en } from "../src/shared/i18n/en.ts";
import { es } from "../src/shared/i18n/es.ts";
import {
  dayLabel,
  foldText,
  mediumDate,
  monthLabel,
  monthName,
  shortDate,
} from "../src/shared/i18n/format.ts";
import {
  cents,
  defaultCategories,
  demoState,
  emptyState,
  money,
  relabelDemo,
  withoutUnusedDefaults,
} from "../src/features/finance/model.ts";
import { planReminders } from "../src/features/finance/storage/reminders.ts";

const placeholders = (message: unknown) =>
  [
    ...new Set(
      (typeof message === "string"
        ? message
        : Object.values(message as Record<string, string>).join(" ")
      ).match(/\{\w+\}/g) ?? [],
    ),
  ].sort();

test("both dictionaries share keys, shapes and placeholders", () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.equal(typeof es[key], typeof en[key], key);
    assert.deepEqual(placeholders(es[key]), placeholders(en[key]), key);
    assert.ok(String(typeof es[key] === "string" ? es[key] : "x").trim(), key);
  }
});

test("interpolates named params and leaves unknown ones visible", () => {
  assert.equal(translate("en", "home.greeting", { name: "Ana" }), "Hello, Ana.");
  assert.equal(translate("es", "home.greeting", { name: "Ana" }), "Hola, Ana.");
  assert.equal(interpolate("{a} and {b}", { a: "x" }), "x and {b}");
  // Numbers use the language's grouping.
  assert.equal(
    translate("es", "import.tooManyRows", { max: 20000 }),
    "Este archivo tiene más de 20,000 filas. Divídelo e inténtalo de nuevo.",
  );
});

test("plurals follow Intl.PluralRules per language", () => {
  assert.equal(translate("en", "activity.count", { count: 1 }), "1 transaction");
  assert.equal(translate("en", "activity.count", { count: 0 }), "0 transactions");
  assert.equal(translate("en", "activity.count", { count: 1250 }), "1,250 transactions");
  assert.equal(translate("es", "activity.count", { count: 1 }), "1 transacción");
  assert.equal(translate("es", "activity.count", { count: 2 }), "2 transacciones");
  // Spanish has a "many" category for millions; it falls back to "other".
  assert.equal(
    translate("es", "activity.count", { count: 1_000_000 }),
    "1,000,000 transacciones",
  );
  assert.equal(translate("es", "frequency.everyDays", { count: 1 }), "Cada día");
  assert.equal(translate("es", "frequency.everyDays", { count: 3 }), "Cada 3 días");
});

test("language: explicit setting, then device locales, then English", () => {
  const device = (...tags: string[]) =>
    tags.map((tag) => ({ languageTag: tag, languageCode: tag.split("-")[0] }));
  assert.equal(resolveLanguage("es", device("en-US")), "es");
  assert.equal(resolveLanguage("en", device("es-DO")), "en");
  assert.equal(resolveLanguage("system", device("es-DO")), "es");
  assert.equal(resolveLanguage("system", device("es-419")), "es");
  assert.equal(resolveLanguage("system", device("fr-FR", "es-ES")), "es");
  assert.equal(resolveLanguage("system", device("fr-FR", "de-DE")), "en");
  assert.equal(resolveLanguage(undefined, []), "en");
  assert.equal(resolveLanguage("system", [{ languageCode: null, languageTag: "ES_do" }]), "es");
});

test("money formats per language with fixed currency symbols", () => {
  assert.equal(money(123456, "DOP", false, "en"), "RD$1,234.56");
  assert.equal(money(123456, "USD", false, "en"), "$1,234.56");
  assert.equal(money(123456, "DOP", false, "es"), "RD$1,234.56");
  assert.equal(money(123456, "USD", false, "es"), "US$1,234.56");
  assert.equal(money(-12345, "DOP", false, "es"), "-RD$123.45");
  assert.equal(money(-12345, "USD", false, "es"), "-US$123.45");
  assert.equal(money(123456789, "DOP", true, "es"), "RD$1,234,568");
  assert.equal(money(-40, "DOP", true, "en"), "RD$0");
  // Default follows the active language.
  assert.equal(getLanguage(), "en");
  assert.equal(money(100, "USD"), "$1.00");
});

test("dates use the language's month names and order", () => {
  assert.equal(shortDate("2026-10-25", "en"), "Oct 25");
  assert.equal(shortDate("2026-10-25", "es"), "25 oct");
  assert.equal(mediumDate("2026-10-25", "en"), "Oct 25, 2026");
  assert.equal(mediumDate("2026-10-25", "es"), "25 oct de 2026");
  assert.equal(monthLabel("2026-10", "en"), "October 2026");
  assert.equal(monthLabel("2026-10", "es"), "Octubre 2026");
  assert.equal(monthName("2026-10", "es"), "octubre");
  assert.equal(monthName("2026-10", "es", "short", true), "Oct");
  assert.equal(dayLabel("2026-10-25", "2026-10-25", "2026-10-24", "es"), "Hoy");
  assert.equal(dayLabel("2026-10-24", "2026-10-25", "2026-10-24", "en"), "Yesterday");
  assert.equal(
    dayLabel("2026-10-20", "2026-10-25", "2026-10-24", "es"),
    "Martes, 20 oct",
  );
});

test("amount entry accepts the Spanish decimal comma", () => {
  assert.equal(cents("1234,56"), 123456);
  assert.equal(cents("0,5"), 50);
  assert.throws(() => cents("1.234,56"));
});

test("search folding ignores accents and case", () => {
  assert.ok(foldText("Categoría Ñandú").includes(foldText("categoria nandu")));
});

test("domain errors, reminders and demo data follow the active language", () => {
  try {
    setLanguage("es");
    assert.equal(t("tabs.home"), "Inicio");
    assert.throws(() => cents("abc"), /Ingresa un monto válido/);
    const [reminder] = planReminders(
      {
        demo: false,
        settings: { notifications: true },
        recurring: [],
        accounts: [{ id: "visa", name: "Visa", type: "credit", dueDay: 28 }],
      },
      new Date(2026, 0, 10, 12),
    );
    assert.equal(reminder.title, "Hoy vence una factura");
    assert.equal(reminder.body, "Pago de Visa");

    const demo = demoState();
    assert.equal(demo.categories.find((c) => c.id === "food")?.name, "Comida y bebidas");
    assert.equal(demo.accounts.find((a) => a.id === "popular")?.name, "Cuenta principal");
    // Brand names are not translated.
    assert.ok(demo.transactions.some((tx) => tx.title === "Supermercado Nacional"));
    assert.equal(relabelDemo(demo), demo);

    setLanguage("en");
    const english = relabelDemo(demo);
    assert.equal(english.categories.find((c) => c.id === "food")?.name, "Food & drinks");
    assert.equal(english.goals[0].name, "A little time away");
    assert.ok(english.transactions.some((tx) => tx.title === "Monthly salary"));
    // Tags are never relabeled: past transactions would keep the old tag.
    assert.deepEqual(english.recurring[0].tags, demo.recurring[0].tags);
    assert.equal(relabelDemo(english), english);
    // With the previous language known, only text in that language is seed text.
    assert.equal(relabelDemo(demo, "en"), demo);
    assert.equal(
      relabelDemo(demo, "es").categories.find((c) => c.id === "food")?.name,
      "Food & drinks",
    );
  } finally {
    setLanguage("en");
  }
});

test("relabeling never touches user-named records or real data", () => {
  setLanguage("es");
  try {
    const renamed = { ...defaultCategories[0], name: "Mi comida" };
    const custom = { id: "pets", name: "Pets", icon: "heart", color: "#555B65", kind: "expense" as const };
    const state = {
      ...emptyState(),
      categories: [renamed, custom, defaultCategories[1]],
      goals: [{ id: "travel", name: "My trip", currency: "DOP" as const, target: 100, saved: 0 }],
    };
    // Real (non-demo) data is never relabeled, starter-looking or not.
    assert.equal(relabelDemo(state), state);
    // In demo mode only seeded ids whose text matches the previous language
    // are renamed; user-created rules keep their own tags.
    const demo = {
      ...state,
      demo: true,
      recurring: [
        {
          id: "mine",
          title: "Gym",
          amount: 100,
          accountId: "a",
          categoryId: "food",
          kind: "expense" as const,
          note: "",
          tags: ["subscription"],
          nextDate: "2026-01-01",
          anchorDay: 1,
          frequency: "monthly" as const,
          active: true,
          subscription: true,
        },
      ],
    };
    const next = relabelDemo(demo, "en");
    assert.deepEqual(
      next.categories.map((c) => c.name),
      ["Mi comida", "Pets", "Compras"],
    );
    assert.equal(next.goals[0].name, "My trip");
    assert.deepEqual(next.recurring[0].tags, ["subscription"]);
    // Untouched seed categories count as defaults in any language.
    assert.deepEqual(
      withoutUnusedDefaults(state).categories.map((c) => c.id),
      ["food", "pets"],
    );
  } finally {
    setLanguage("en");
  }
});
