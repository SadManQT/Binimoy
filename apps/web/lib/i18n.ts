import { cookies } from "next/headers";
import { cache } from "react";
import { type Dictionary, dictionaries } from "./dictionary";

export type Locale = "bn" | "en";
export const LOCALE_COOKIE = "lang";

// Bangla unless the visitor chose English. One read per request.
export const getLocale = cache(
  async (): Promise<Locale> =>
    (await cookies()).get(LOCALE_COOKIE)?.value === "en" ? "en" : "bn",
);

export type I18n = {
  locale: Locale;
  t: Dictionary;
  // Numbers and dates in the reader's own digits.
  num: (value: number) => string;
  date: (iso: string) => string;
  // Dhaka date and time, for deadlines and records.
  dateTime: (value: Date | string) => string;
  // Both languages written where the words are used; picks the reader's.
  L: (bn: string, en: string) => string;
};

export async function getI18n(): Promise<I18n> {
  const locale = await getLocale();
  const tag = locale === "bn" ? "bn-BD" : "en-GB";
  return {
    locale,
    t: dictionaries[locale],
    L: (bn, en) => (locale === "en" ? en : bn),
    dateTime: (value) =>
      `${new Date(value).toLocaleString(tag, { timeZone: "Asia/Dhaka" })} (Asia/Dhaka)`,
    num: (value) => value.toLocaleString(tag),
    date: (iso) =>
      new Date(iso).toLocaleDateString(tag, {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
  };
}

// "{n} shops" with the number filled in.
export const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
