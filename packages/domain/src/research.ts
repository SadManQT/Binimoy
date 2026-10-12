import { createHash } from "node:crypto";

// Spec C7, C34 and D.10: the deterministic parts of research. Nothing here
// judges a seller. It plans searches, tidies links, groups copies and sorts
// what a passage says into what its AUTHOR reports.

// C34.2 prototype budget.
export const QUERY_BUDGET = 12;
export const CANDIDATE_BUDGET = 30;

export type PlannedQuery = {
  query: string;
  intent: "neutral" | "positive" | "negative" | "resolution";
  language: "english" | "bangla" | "banglish";
};

// C7.3: neutral, favourable, unfavourable and follow-up searches, in Bangla,
// English and Banglish. The name is used exactly as given: transliterating it
// would match different people.
export function planQueries(subject: string): PlannedQuery[] {
  // The name goes inside quotes; a quote in it would let it rewrite the query.
  const name = `"${subject.replaceAll('"', " ").replace(/\s+/g, " ").trim()}"`;
  const q = (
    suffix: string,
    intent: PlannedQuery["intent"],
    language: PlannedQuery["language"],
    prefix = "",
  ): PlannedQuery => ({
    query: `${prefix}${name}${suffix ? ` ${suffix}` : ""}`,
    intent,
    language,
  });
  return [
    q("", "neutral", "english"),
    q("", "neutral", "english", "site:facebook.com "),
    q("রিভিউ", "neutral", "bangla"),
    q("kemon", "neutral", "banglish"),
    q("recommended", "positive", "english"),
    q("পেয়েছি", "positive", "bangla"),
    q("valo service", "positive", "banglish"),
    q("complaint", "negative", "english"),
    q("টাকা দিয়ে পাইনি", "negative", "bangla"),
    q("taka niye dey nai", "negative", "banglish"),
    q("refund", "resolution", "english"),
    q("টাকা ফেরত", "resolution", "bangla"),
  ];
}

const TRACKING =
  /^(utm_.+|fbclid|gclid|ref|ref_src|mibextid|__tn__|__cft__.*|igshid)$/i;

// C34.1 step 4: one address per page, keeping the identifiers that say which
// post it is. Null for anything that is not a plain public web address.
export function canonicalUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // D.9: no embedded credentials.
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(params).toString();
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "";
  return `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}${path}${query ? `?${query}` : ""}`;
}

// The same text reposted, give or take punctuation, case and emoji. Distinct
// experiences about the same issue keep distinct keys.
export function duplicateKey(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export type ReportType =
  | "positive"
  | "negative"
  | "mixed"
  | "neutral"
  | "response"
  | "resolution";
export type ContentType =
  | "customer_experience"
  | "seller_response"
  | "advertisement"
  | "news";

const AD = /\b(sale|% ?off|discount|order now|buy now|offer)\b|অফার|ছাড়/iu;
const RESOLVED =
  /\brefunded\b|\bgot (?:my|a|the) refund\b|\bresolved\b|ফেরত পেয়েছি|সমাধান হয়েছে/iu;
// Phrases that contain a favourable word but mean the opposite.
const NEGATED =
  /\b(?:never|not|did ?n[o']t|have ?n[o']t|has ?n[o']t) (?:yet )?(?:received?|got|recommended?|work(?:s|ing|ed)?)\b|পাইনি|পাই নি/giu;
const POSITIVE =
  /\b(?:received|got it|works?|working|recommended|satisfied|delivered)\b|পেয়েছি|ভালো|ভাল/iu;
const NEGATIVE =
  /\b(?:scam|fraud|complaint|cheated|blocked me)\b|প্রতারণা|প্রতারক|ঠকিয়েছে/iu;

// A keyword sorter, used when AI_MODE is fixture. It labels what the AUTHOR
// reports, never what the subject is. It is crude on purpose and is labelled
// as such wherever its output is shown; a language model replaces it in live
// mode (C34.3).
export function classifyPassage(
  text: string,
  author: "customer" | "seller" | "publisher",
): { contentType: ContentType; reportType: ReportType } {
  if (author === "publisher")
    return { contentType: "news", reportType: "neutral" };
  if (author === "seller") {
    return AD.test(text)
      ? { contentType: "advertisement", reportType: "neutral" }
      : { contentType: "seller_response", reportType: "response" };
  }
  const experience = (reportType: ReportType) => ({
    contentType: "customer_experience" as const,
    reportType,
  });
  if (RESOLVED.test(text)) return experience("resolution");
  const negated = NEGATED.test(text);
  NEGATED.lastIndex = 0;
  const favourable = POSITIVE.test(text.replace(NEGATED, " "));
  const unfavourable = negated || NEGATIVE.test(text);
  if (favourable && unfavourable) return experience("mixed");
  if (favourable) return experience("positive");
  if (unfavourable) return experience("negative");
  return experience("neutral");
}

const squash = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

// C7.2: sharing a name, or part of one, is not being the same subject.
export function matchSubject(
  subject: string,
  text: string,
): "exact" | "ambiguous" | "none" {
  const name = squash(subject);
  const haystack = squash(text);
  if (haystack.includes(name)) return "exact";
  const tokens = name.split(" ");
  if (tokens.length > 1 && haystack.includes(tokens.slice(0, -1).join(" "))) {
    return "ambiguous";
  }
  return "none";
}
