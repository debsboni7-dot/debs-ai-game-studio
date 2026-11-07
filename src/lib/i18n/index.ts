import { fr } from "./fr";

/** Supported locales. Add a dictionary file with the same shape to add a language. */
export const locales = { fr } as const;
export type Locale = keyof typeof locales;
export const defaultLocale: Locale = "fr";

type Dict = typeof fr;
type Path<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Path<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Path<Dict>;

export function t(key: TKey, locale: Locale = defaultLocale): string {
  const value = key
    .split(".")
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], locales[locale]);
  return typeof value === "string" ? value : key;
}
