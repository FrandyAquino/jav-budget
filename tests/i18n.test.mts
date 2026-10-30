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
  emptyState,
  money,
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

test("domain errors and reminders follow the active language", () => {
  try {
    setLanguage("es");
    assert.equal(t("tabs.home"), "Inicio");
    assert.throws(() => cents("abc"), /Ingresa un monto válido/);
    const [reminder] = planReminders(
      {
        settings: { notifications: true },
        recurring: [],
        accounts: [{ id: "visa", name: "Visa", type: "credit", dueDay: 28 }],
      },
      new Date(2026, 0, 10, 12),
    );
    assert.equal(reminder.title, "Hoy vence una factura");
    assert.equal(reminder.body, "Pago de Visa");

  } finally {
    setLanguage("en");
  }
});

