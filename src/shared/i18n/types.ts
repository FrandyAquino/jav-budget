// Pure types for the i18n layer. No React or React Native imports here.
export type Language = "en" | "es";
export type LanguageSetting = "system" | Language;

// Plural forms follow Intl.PluralRules categories. `zero` is an optional
// override used when count === 0; missing categories fall back to `other`.
export type PluralMessage = {
  readonly zero?: string;
  readonly one: string;
  readonly many?: string;
  readonly other: string;
};
export type Message = string | PluralMessage;

type VarsOf<S extends string> = S extends `${string}{${infer V}}${infer Rest}`
  ? V | VarsOf<Rest>
  : never;
export type MessageVars<M> = M extends string
  ? VarsOf<M>
  : M extends PluralMessage
    ? VarsOf<M["one"]> | VarsOf<M["other"]> | "count"
    : never;
export type ParamValue = string | number;
