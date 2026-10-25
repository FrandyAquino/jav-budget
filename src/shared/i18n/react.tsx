import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { useLocales } from "expo-localization";
import { money, type Currency } from "@/features/finance/model";
import {
  getLanguage,
  getLocale,
  primeLanguage,
  resolveLanguage,
  setLanguage,
  translator,
  type Language,
  type LanguageSetting,
  type Translate,
} from "./core";
import {
  dayLabel,
  formatDate,
  formatNumber,
  mediumDate,
  monthLabel,
  monthName,
  shortDate,
  smartDate,
  weekdayName,
} from "./format";

// Everything a component needs to render text in the active language. The
// functions are re-created per language so memoized output (React Compiler)
// is invalidated when the language changes; use these instead of the
// module-level `t()` / `money()` defaults inside components.
export type I18n = {
  lang: Language;
  locale: string;
  t: Translate;
  money: (amount: number, currency: Currency, compact?: boolean) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  date: (value: string | Date, options: Intl.DateTimeFormatOptions) => string;
  shortDate: (value: string | Date) => string;
  mediumDate: (value: string | Date) => string;
  smartDate: (value: string | Date) => string;
  monthLabel: (month: string | Date, style?: "long" | "short") => string;
  monthName: (
    month: string | Date,
    style?: "long" | "short",
    standalone?: boolean,
  ) => string;
  weekdayName: (
    value: string | Date,
    style?: "long" | "short" | "narrow",
  ) => string;
  dayLabel: (date: string, today: string, yesterday: string) => string;
};

export function createI18n(lang: Language): I18n {
  return {
    lang,
    locale: getLocale(lang),
    t: translator(lang),
    money: (amount, currency, compact = false) =>
      money(amount, currency, compact, lang),
    number: (value, options) => formatNumber(value, options, lang),
    date: (value, options) => formatDate(value, options, lang),
    shortDate: (value) => shortDate(value, lang),
    mediumDate: (value) => mediumDate(value, lang),
    smartDate: (value) => smartDate(value, lang),
    monthLabel: (month, style = "long") => monthLabel(month, lang, style),
    monthName: (month, style = "long", standalone = false) =>
      monthName(month, lang, style, standalone),
    weekdayName: (value, style = "short") => weekdayName(value, lang, style),
    dayLabel: (date, today, yesterday) =>
      dayLabel(date, today, yesterday, lang),
  };
}

const I18nContext = createContext<I18n>(createI18n(getLanguage()));

// Resolves the language (setting → device locales → English) and publishes it
// to both the React tree and the module-level `t()` used by non-React code.
export function I18nProvider({
  setting,
  children,
}: {
  setting: LanguageSetting | undefined;
  children: ReactNode;
}) {
  // Re-renders when the OS language changes (Android, web).
  const locales = useLocales();
  const lang = resolveLanguage(setting, locales);
  // Idempotent: keeps module-level t()/money() in step with this render.
  primeLanguage(lang);
  // Publishes to subscribers (store, reminders). Layout effects run before any
  // passive effect such as the store's initial load.
  useLayoutEffect(() => {
    setLanguage(lang);
  }, [lang]);
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined")
      document.documentElement.lang = getLocale(lang);
  }, [lang]);
  const value = useMemo(() => createI18n(lang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18n {
  return useContext(I18nContext);
}
