import {
  getLanguage,
  getLocale,
  t,
  type Language,
} from "../../shared/i18n/core.ts";
import type { Currency, ExchangeRate, Settings } from "./types.ts";

// Accepts a dot or a comma as the decimal separator ("12.50", "12,50"); no
// grouping separators, so "1,234" stays invalid instead of ambiguous.
export function cents(value: string): number {
  const text = value.trim();
  if (!/^\d{1,10}([.,]\d{1,2})?$/.test(text))
    throw new Error(t("errors.amountInvalid"));
  const [whole, fraction = ""] = text.split(/[.,]/);
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
// Symbols are fixed rather than taken from Intl, whose output differs per
// engine and locale (en-US prints "DOP", es-DO prints "$" for narrowSymbol).
// In Spanish, a bare "$" means pesos, so dollars are spelled "US$".
const SYMBOLS: Record<Language, Record<Currency, string>> = {
  en: { DOP: "RD$", USD: "$" },
  es: { DOP: "RD$", USD: "US$" },
};
export function currencySymbol(
  currency: Currency,
  lang: Language = getLanguage(),
) {
  return SYMBOLS[lang][currency];
}
// "-RD$1,234.56". es-DO and en-US both group with "," and use "." decimals.
export function money(
  amount: number,
  currency: Currency,
  compact = false,
  lang: Language = getLanguage(),
) {
  const digits = compact ? 0 : 2;
  const value = Math.abs(amount) / 100;
  const text = new Intl.NumberFormat(getLocale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  const negative = amount < 0 && Number(value.toFixed(digits)) !== 0;
  return `${negative ? "-" : ""}${SYMBOLS[lang][currency]}${text}`;
}
// `allowZero` is for balances and progress (opening balance, saved so far).
export function entryAmount(
  text: string,
  mode: Settings["numberEntry"],
  allowZero = false,
): number {
  if (mode !== "cents") return cents(text);
  if (!/^\d{1,12}$/.test(text.trim()))
    throw new Error(t("errors.amountDigits"));
  const value = Number(text);
  if (allowZero && value === 0) return 0;
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(t("errors.amountPositive"));
  return value;
}
// Prefill text for an amount input, matching how entryAmount reads it back.
export function amountText(value: number, mode: Settings["numberEntry"]) {
  return String(mode === "cents" ? value : value / 100);
}
const RATE_SCALE = 10000;
// Positive, finite, at most four decimals.
export function validRate(dopPerUsd: number) {
  if (!Number.isFinite(dopPerUsd) || dopPerUsd <= 0 || dopPerUsd > 1e6)
    return false;
  const scaled = dopPerUsd * RATE_SCALE;
  return Math.round(scaled) > 0 && Math.abs(scaled - Math.round(scaled)) < 1e-6;
}
export function exchangeRate(
  dopPerUsd: number,
  updatedAt = new Date().toISOString(),
): ExchangeRate {
  if (!validRate(dopPerUsd))
    throw new Error(t("errors.rateInvalid"));
  return { dopPerUsd, updatedAt };
}
function divRound(n: bigint, d: bigint) {
  const negative = n < 0n !== d < 0n;
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  const q = (a * 2n + b) / (b * 2n); // Half away from zero.
  return Number(negative ? -q : q);
}
// Returns undefined when a conversion is needed but no rate is known.
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rate?: ExchangeRate | number,
): number | undefined {
  if (from === to) return amount;
  const dopPerUsd = typeof rate === "number" ? rate : rate?.dopPerUsd;
  if (dopPerUsd === undefined || !validRate(dopPerUsd)) return undefined;
  const scaled = BigInt(Math.round(dopPerUsd * RATE_SCALE));
  const value = BigInt(amount);
  return from === "USD"
    ? divRound(value * scaled, BigInt(RATE_SCALE))
    : divRound(value * BigInt(RATE_SCALE), scaled);
}
// Live input formatting. Inputs keep the canonical text entryAmount reads
// ("1234.5", or cent digits "123450"); fields show it grouped ("1,234.5",
// "1,234.50"). The decimal separator is always "." and grouping ",".
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export function formatAmountInput(raw: string, mode: Settings["numberEntry"]) {
  if (!raw) return "";
  if (mode === "cents") {
    const digits = raw.padStart(3, "0");
    return `${group(String(Number(digits.slice(0, -2))))}.${digits.slice(-2)}`;
  }
  const [whole, fraction] = raw.split(".");
  return fraction === undefined
    ? group(whole)
    : `${group(whole || "0")}.${fraction}`;
}
export function parseAmountInput(text: string, mode: Settings["numberEntry"]) {
  if (mode === "cents")
    return text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12);
  let value = text.trim();
  // A typed or pasted comma used as the decimal separator ("12," / "12,50").
  if (!value.includes(".") && /^[\d,]*,\d{0,2}$/.test(value)) {
    const at = value.lastIndexOf(",");
    if (!/,\d{3}$/.test(value))
      value = `${value.slice(0, at).replace(/,/g, "")}.${value.slice(at + 1)}`;
  }
  value = value.replace(/[^\d.]/g, "");
  const dot = value.indexOf(".");
  let whole = dot < 0 ? value : value.slice(0, dot);
  whole = whole.replace(/^0+(?=\d)/, "").slice(0, 10);
  if (dot < 0) return whole;
  return `${whole || "0"}.${value.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`;
}
