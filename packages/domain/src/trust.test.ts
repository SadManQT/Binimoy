import { expect, test } from "vitest";
import { type TrustInput, trustSignal } from "./trust";

const shop = (over: Partial<TrustInput> = {}): TrustInput => ({
  published: 6,
  positive: 6,
  negative: 0,
  answered: 0,
  resolved: 0,
  ratingAverage: 4.8,
  ratingCount: 6,
  ...over,
});

test("too few reviews is 'not enough data', never a good or bad signal", () => {
  for (const published of [0, 1, 2]) {
    const signal = trustSignal(
      shop({ published, positive: published, ratingCount: published }),
    );
    expect(signal).toMatchObject({ level: "unknown", score: null });
    expect(signal.reasons).toContain("FEW_REVIEWS");
  }
});

test("consistently good reviews give a strong signal; mostly unresolved reports give caution", () => {
  const good = trustSignal(shop());
  expect(good.level).toBe("strong");
  expect(good.reasons).toEqual(
    expect.arrayContaining(["MOSTLY_GOOD", "HIGH_RATING"]),
  );

  const bad = trustSignal(
    shop({ positive: 1, negative: 5, ratingAverage: 1.6 }),
  );
  expect(bad.level).toBe("caution");
  expect(bad.reasons).toEqual(
    expect.arrayContaining(["UNRESOLVED_REPORTS", "LOW_RATING"]),
  );
  const mixed = trustSignal(
    shop({ positive: 4, negative: 2, ratingAverage: 3.4 }),
  );
  expect(mixed.level).toBe("mixed");
});

test("a report that was answered or resolved counts against a shop less than one left open", () => {
  const open = trustSignal(
    shop({ positive: 4, negative: 2, ratingAverage: 3.5 }),
  );
  const answered = trustSignal(
    shop({ positive: 4, negative: 2, answered: 2, ratingAverage: 3.5 }),
  );
  const resolved = trustSignal(
    shop({
      positive: 4,
      negative: 2,
      answered: 2,
      resolved: 2,
      ratingAverage: 3.5,
    }),
  );
  expect(answered.score as number).toBeGreaterThan(open.score as number);
  expect(resolved.score as number).toBeGreaterThan(answered.score as number);
  expect(resolved.reasons).toContain("REPORTS_RESOLVED");
});

test("the score stays within 0 to 100 and one more open report never raises it", () => {
  let previous = 101;
  for (let negative = 0; negative <= 12; negative += 1) {
    const { score } = trustSignal(
      shop({ published: 6 + negative, negative, ratingAverage: 4 }),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(score as number).toBeLessThanOrEqual(previous);
    previous = score as number;
  }
  expect(
    trustSignal(shop({ ratingAverage: null, ratingCount: 0 })).score,
  ).toBeLessThanOrEqual(100);
});
