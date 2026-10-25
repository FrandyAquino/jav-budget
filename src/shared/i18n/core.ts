// Framework-free i18n core: dictionaries, interpolation, plurals, language
// resolution and the active language used by non-React code (notifications,
// widget snapshots, quick actions, domain validation errors).
// Keep this module free of React / React Native imports: node tests import it.
import { en, type MessageKey } from "./en.ts";
import { es } from "./es.ts";
import type {
  Language,
  LanguageSetting,
  Message,
  MessageVars,
  ParamValue,
} from "./types.ts";

export type { Language, LanguageSetting, MessageKey };
export const LANGUAGES: readonly Language[] = ["es", "en"];
export const LOCALES: Record<Language, string> = { en: "en-US", es: "es-DO" };

const dictionaries: Record<Language, Record<MessageKey, Message>> = { en, es };

export type Params<K extends MessageKey> = MessageVars<(typeof en)[K]>;
// Keys without placeholders take no params; keys with placeholders require them.
export type TArgs<K extends MessageKey> = [Params<K>] extends [never]
  ? []
  : [params: Record<Params<K>, ParamValue>];
// Keys that take no params, for maps of keys chosen at runtime.
export type PlainKey = {
  [K in MessageKey]: [Params<K>] extends [never] ? K : never;
}[MessageKey];
export type Translate = <K extends MessageKey>(
  key: K,
  ...args: TArgs<K>
) => string;

let active: Language = "en";
let published: Language = "en";
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return active;
}
export function getLocale(lang: Language = active): string {
  return LOCALES[lang];
}
// Sets the active language and notifies subscribers once per change.
export function setLanguage(lang: Language) {
  active = lang;
  if (lang === published) return;
  published = lang;
  for (const listener of listeners) listener();
}
// Sets the active language without notifying, so render-time calls to the
// module-level helpers agree with the React tree; the provider publishes the
// change from an effect (setLanguage) to avoid updates during render.
export function primeLanguage(lang: Language) {
  active = lang;
}
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "es";
}

type DeviceLocale = {
  languageCode?: string | null;
  languageTag?: string | null;
};
// Explicit setting wins; "system" picks the first supported device language
// (expo-localization getLocales() order); anything else falls back to English.
export function resolveLanguage(
  setting: LanguageSetting | undefined,
  deviceLocales: readonly DeviceLocale[] = [],
): Language {
  if (isLanguage(setting)) return setting;
  for (const locale of deviceLocales) {
    const code = (locale.languageCode ?? locale.languageTag ?? "")
      .split(/[-_]/)[0]
      .toLowerCase();
    if (isLanguage(code)) return code;
  }
  return "en";
}

const pluralRules = new Map<Language, { select(n: number): string }>();
function pluralCategory(lang: Language, count: number) {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules =
      typeof Intl !== "undefined" && typeof Intl.PluralRules === "function"
        ? new Intl.PluralRules(LOCALES[lang])
        : { select: (n: number) => (n === 1 ? "one" : "other") };
    pluralRules.set(lang, rules);
  }
  return rules.select(count);
}
function formatParam(lang: Language, value: ParamValue) {
  return typeof value === "number"
    ? new Intl.NumberFormat(LOCALES[lang]).format(value)
    : value;
}
export function interpolate(
  template: string,
  params: Record<string, ParamValue> | undefined,
  lang: Language = active,
) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? formatParam(lang, params[name]) : match,
  );
}
export function translate<K extends MessageKey>(
  lang: Language,
  key: K,
  ...args: TArgs<K>
): string {
  const params = args[0] as Record<string, ParamValue> | undefined;
  const message = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  if (typeof message === "string") return interpolate(message, params, lang);
  const count = Number(params?.count ?? 0);
  const form =
    count === 0 && message.zero !== undefined
      ? message.zero
      : ((message as Record<string, string | undefined>)[
          pluralCategory(lang, count)
        ] ?? message.other);
  return interpolate(form, params, lang);
}
// Non-hook translator for code outside React; follows the active language.
export const t: Translate = (key, ...args) => translate(active, key, ...args);
export function translator(lang: Language): Translate {
  return (key, ...args) => translate(lang, key, ...args);
}
// Every language's text for a key, e.g. to recognize untouched seed data.
export function allTranslations<K extends MessageKey>(
  key: K,
  ...args: TArgs<K>
): string[] {
  return LANGUAGES.map((lang) => translate(lang, key, ...args));
}
