// A shop's trust signal, computed in the open from what was published about
// it (ADR-009, amended 2026-10-13 on the owner's decision). It is arithmetic
// on review counts, ratings and whether reports were answered. It is not an
// investigation, and with fewer than three reviews it says only that there
// is not enough to go on. Every reason it gives is shown beside it.

export type TrustInput = {
  published: number;
  positive: number;
  negative: number;
  // Reports with a published reply, and reports their writer marked resolved.
  answered: number;
  resolved: number;
  ratingAverage: number | null;
  ratingCount: number;
};
export type TrustLevel = "strong" | "mixed" | "caution" | "unknown";
export type TrustReason =
  | "FEW_REVIEWS"
  | "MOSTLY_GOOD"
  | "HIGH_RATING"
  | "LOW_RATING"
  | "UNRESOLVED_REPORTS"
  | "REPORTS_ANSWERED"
  | "REPORTS_RESOLVED";
export type TrustSignal = {
  level: TrustLevel;
  score: number | null;
  reasons: TrustReason[];
};

export const MIN_REVIEWS = 3;

export function trustSignal(shop: TrustInput): TrustSignal {
  if (shop.published < MIN_REVIEWS) {
    return { level: "unknown", score: null, reasons: ["FEW_REVIEWS"] };
  }
  const reasons: TrustReason[] = [];
  const share = (n: number) => n / shop.published;
  // Each report weighs less once it has a reply, and less again once the
  // person who wrote it says it was sorted out.
  const open = shop.negative - shop.answered;
  const answeredOnly = Math.max(shop.answered - shop.resolved, 0);
  const burden =
    (Math.max(open, 0) + answeredOnly * 0.6 + shop.resolved * 0.25) /
    shop.published;

  let score = 55 + share(shop.positive) * 25 - burden * 70;
  if (shop.ratingAverage !== null && shop.ratingCount >= 2) {
    score += (shop.ratingAverage - 3) * 10;
    if (shop.ratingAverage >= 4) reasons.push("HIGH_RATING");
    if (shop.ratingAverage < 2.5) reasons.push("LOW_RATING");
  }
  if (share(shop.positive) >= 0.7) reasons.push("MOSTLY_GOOD");
  if (open > 0) reasons.push("UNRESOLVED_REPORTS");
  if (shop.answered > 0) reasons.push("REPORTS_ANSWERED");
  if (shop.resolved > 0) reasons.push("REPORTS_RESOLVED");

  const rounded = Math.round(Math.min(Math.max(score, 0), 100));
  return {
    level: rounded >= 70 ? "strong" : rounded >= 45 ? "mixed" : "caution",
    score: rounded,
    reasons,
  };
}
