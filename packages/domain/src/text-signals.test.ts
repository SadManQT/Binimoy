import { expect, test } from "vitest";
import { reviewHighlights, textSimilarity } from "./text-signals";

test("highlights are the words several reviewers use, not filler and not one person's vocabulary", () => {
  const highlights = reviewHighlights([
    "Fast delivery, got the key in ten minutes.",
    "Delivery was fast and the seller replied quickly.",
    "ডেলিভারি ফাস্ট ছিল, রিফান্ড নিয়ে সমস্যা হয়নি।",
    "Refund took a week but delivery was fine.",
    "Unique zebra giraffe platypus words nobody else wrote.",
  ]);
  expect(highlights[0]).toEqual({ term: "delivery", reviews: 3 });
  expect(highlights.map((h) => h.term)).toContain("fast");
  // Stop words and words from a single review are left out.
  for (const term of ["the", "and", "was", "zebra", "ছিল"]) {
    expect(highlights.map((h) => h.term)).not.toContain(term);
  }
  expect(reviewHighlights(["only one review here"])).toEqual([]);
  expect(reviewHighlights([])).toEqual([]);
});

test("a copied review scores close to 1, different experiences close to 0", () => {
  const original =
    "I paid 2500 taka and the key never arrived, seller stopped replying.";
  expect(textSimilarity(original, original)).toBe(1);
  expect(
    textSimilarity(
      original,
      "i paid 2500 taka & the key never arrived!! seller stopped replying",
    ),
  ).toBeGreaterThan(0.7);
  expect(
    textSimilarity(
      original,
      "Great shop, top-up came in five minutes and works fine.",
    ),
  ).toBeLessThan(0.15);
  expect(textSimilarity("", original)).toBe(0);
  expect(textSimilarity("টাকা নিয়ে প্রোডাক্ট দেয়নি", "টাকা নিয়ে প্রোডাক্ট দেয়নি।")).toBe(
    1,
  );
});
