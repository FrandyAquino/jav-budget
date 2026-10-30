// Locale-aware date/number formatting. Pure TS (no React Native imports).
import { getLanguage, getLocale, translate, type Language } from "./core.ts";

// "YYYY-MM-DD" and "YYYY-MM" are local calendar values; anchor them at noon so
// time zones never shift the day.
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return new Date(`${value}-01T12:00:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  return new Date(value);
}
export function formatDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
  lang: Language = getLanguage(),
): string {
  const date = toDate(value);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleDateString(getLocale(lang), options);
}
// "Oct 25" / "25 oct"
export function shortDate(value: string | Date, lang: Language = getLanguage()) {
  return formatDate(value, { month: "short", day: "numeric" }, lang);
}
// "Oct 25, 2026" / "25 oct 2026"
export function mediumDate(value: string | Date, lang: Language = getLanguage()) {
  return formatDate(
    value,
    { month: "short", day: "numeric", year: "numeric" },
    lang,
  );
}
// Short date, adding the year only when it is not the current one.
export function smartDate(value: string | Date, lang: Language = getLanguage()) {
  const date = toDate(value);
  return formatDate(
    date,
    date.getFullYear() === new Date().getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
    lang,
  );
}
function capitalize(text: string, lang: Language) {
  return text.charAt(0).toLocaleUpperCase(getLocale(lang)) + text.slice(1);
}
// Half-month budget periods ("2026-10-Q1"): "Oct 1–15" / "1–15 oct".
function halfLabel(period: string, lang: Language, year: boolean) {
  const month = period.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const days = period.endsWith("Q1")
    ? "1–15"
    : `16–${new Date(y, m, 0).getDate()}`;
  const name = formatDate(month, { month: "short" }, lang).replace(/\.$/, "");
  if (lang === "es") return `${days} ${name}${year ? ` ${y}` : ""}`;
  return `${name} ${days}${year ? `, ${y}` : ""}`;
}
const isHalf = (value: string | Date) =>
  typeof value === "string" && /^\d{4}-\d{2}-Q[12]$/.test(value);
// "October 2026" / "Octubre 2026". Spanish month names are lowercase
// mid-sentence, so standalone labels are capitalized.
export function monthLabel(
  month: string | Date,
  lang: Language = getLanguage(),
  style: "long" | "short" = "long",
) {
  if (isHalf(month)) return halfLabel(month as string, lang, true);
  const text = formatDate(month, { month: style, year: "numeric" }, lang);
  return capitalize(lang === "es" ? text.replace(" de ", " ") : text, lang);
}
// "October" / "octubre": lowercase in Spanish for use mid-sentence; pass
// standalone = true for labels such as chart axes ("Oct" / "Oct").
export function monthName(
  month: string | Date,
  lang: Language = getLanguage(),
  style: "long" | "short" = "long",
  standalone = false,
) {
  if (isHalf(month)) return halfLabel(month as string, lang, false);
  const text = formatDate(month, { month: style }, lang).replace(/\.$/, "");
  return standalone ? capitalize(text, lang) : text;
}
export function weekdayName(
  value: string | Date,
  lang: Language = getLanguage(),
  style: "long" | "short" | "narrow" = "short",
) {
  return capitalize(formatDate(value, { weekday: style }, lang), lang);
}
// Today / Yesterday / weekday + date.
export function dayLabel(
  date: string,
  today: string,
  yesterday: string,
  lang: Language = getLanguage(),
) {
  if (date === today) return translate(lang, "dates.today");
  if (date === yesterday) return translate(lang, "dates.yesterday");
  const value = toDate(date);
  return capitalize(
    formatDate(
      value,
      value.getFullYear() === toDate(today).getFullYear()
        ? { weekday: "long", month: "short", day: "numeric" }
        : { weekday: "short", month: "short", day: "numeric", year: "numeric" },
      lang,
    ),
    lang,
  );
}
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
  lang: Language = getLanguage(),
) {
  return new Intl.NumberFormat(getLocale(lang), options).format(value);
}
// Accepts "1234.56" and the Spanish decimal comma "1234,56". Group separators
// are not accepted to avoid ambiguity ("1,234" vs "1,23").
export function normalizeDecimal(text: string) {
  return text.trim().replace(",", ".");
}
// Case- and accent-insensitive text for search ("categoria" finds "Categoría").
export function foldText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
