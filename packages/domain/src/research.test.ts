import { expect, test } from "vitest";
import {
  canonicalUrl,
  classifyPassage,
  duplicateKey,
  matchSubject,
  planQueries,
  QUERY_BUDGET,
} from "./research";

test("the query plan stays within budget and covers every intent in three language forms", () => {
  const plan = planQueries("Tech Bazar BD");
  expect(plan).toHaveLength(QUERY_BUDGET);
  expect(new Set(plan.map((q) => q.query)).size).toBe(QUERY_BUDGET);
  expect(new Set(plan.map((q) => q.intent))).toEqual(
    new Set(["neutral", "positive", "negative", "resolution"]),
  );
  expect(new Set(plan.map((q) => q.language))).toEqual(
    new Set(["english", "bangla", "banglish"]),
  );
  // C34.2: the name is never transliterated or altered.
  for (const q of plan) expect(q.query).toContain('"Tech Bazar BD"');
  // C7.3: a search that only looks for trouble is not balanced.
  const count = (intent: string) =>
    plan.filter((q) => q.intent === intent).length;
  expect(count("positive")).toBeGreaterThanOrEqual(2);
  expect(count("negative")).toBeGreaterThanOrEqual(2);
});

test("a subject name cannot break out of its quotes", () => {
  const plan = planQueries('Shop" OR site:evil.example "x');
  for (const q of plan) expect(q.query.match(/"/g)?.length).toBe(2);
});

test.each([
  [
    "https://www.facebook.com/techbazar/posts/123?fbclid=abc&utm_source=x",
    "https://facebook.com/techbazar/posts/123",
  ],
  [
    "https://m.facebook.com/story.php?story_fbid=99&id=42&ref=share",
    "https://facebook.com/story.php?id=42&story_fbid=99",
  ],
  ["HTTP://Example.COM/Review/#comments", "http://example.com/Review"],
  ["https://example.com/a?b=2&a=1", "https://example.com/a?a=1&b=2"],
])("canonicalUrl(%s)", (input, expected) => {
  expect(canonicalUrl(input)).toBe(expected);
});

test.each([
  "javascript:alert(1)",
  "file:///etc/passwd",
  "not a url",
  "https://user:pass@example.com/x",
])("canonicalUrl refuses %s", (input) => {
  expect(canonicalUrl(input)).toBeNull();
});

test("copies of one post share a duplicate key; different experiences do not", () => {
  const a = duplicateKey("Got my key within an hour!!  Recommended 👍");
  expect(duplicateKey("got my key within an hour. recommended")).toBe(a);
  expect(duplicateKey("Got my key after three days. Not recommended")).not.toBe(
    a,
  );
});

test.each([
  [
    "Received the license in an hour, works fine. Recommended.",
    "customer",
    "positive",
  ],
  [
    "Paid 2500 taka, never received anything. Not received even after a week.",
    "customer",
    "negative",
  ],
  ["টাকা দিয়েছি কিন্তু পণ্য পাইনি", "customer", "negative"],
  // C34.3: a negation or a turn must not be read by its first scary word.
  [
    "I thought it was a scam, but I received the item the next day.",
    "customer",
    "mixed",
  ],
  [
    "Update: they refunded me yesterday, issue resolved.",
    "customer",
    "resolution",
  ],
  ["টাকা ফেরত পেয়েছি, ধন্যবাদ", "customer", "resolution"],
  ["We have refunded this order in full.", "seller", "response"],
  ["Their office is in Dhaka and they sell licenses.", "customer", "neutral"],
])("classifyPassage(%s) by a %s", (text, author, reportType) => {
  expect(
    classifyPassage(text, author as "customer" | "seller").reportType,
  ).toBe(reportType);
});

test("an advertisement or a news item is not counted as a customer report", () => {
  expect(
    classifyPassage("Flash sale! 50% off all licenses, order now.", "seller")
      .contentType,
  ).toBe("advertisement");
  expect(
    classifyPassage("The ministry announced new e-commerce rules.", "publisher")
      .contentType,
  ).toBe("news");
  expect(classifyPassage("Got it, works.", "customer").contentType).toBe(
    "customer_experience",
  );
});

test("a page that only shares part of the name is ambiguous, not a match (C7.2)", () => {
  expect(
    matchSubject("Tech Bazar BD", "Ordered from Tech Bazar BD last week"),
  ).toBe("exact");
  expect(matchSubject("Tech Bazar BD", "tech bazar bd delivered")).toBe(
    "exact",
  );
  expect(
    matchSubject("Tech Bazar BD", "Tech Bazar Chittagong is a different shop"),
  ).toBe("ambiguous");
  expect(matchSubject("Tech Bazar BD", "Nothing about that shop here")).toBe(
    "none",
  );
});
