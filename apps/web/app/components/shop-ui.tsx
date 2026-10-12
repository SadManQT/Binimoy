import type { ShopSummary } from "@lp/db/shops";
import {
  Question,
  ShieldCheck,
  ShieldWarning,
  Star,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { fill, type I18n } from "../../lib/i18n";

// A reviewer's own rating. The stars are decoration; the number carries it.
export function Rating({ value, i18n }: { value: number; i18n: I18n }) {
  const full = Math.round(value);
  return (
    <span className="rating">
      <span aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={15} weight={n <= full ? "fill" : "regular"} />
        ))}
      </span>
      {i18n.num(value)} / {i18n.num(5)}
    </span>
  );
}

// The evidence line: how many reports were published, how many got a reply,
// how many their writers say were resolved. Counts, never a verdict.
export function ComplaintLine({
  shop,
  i18n,
}: {
  shop: ShopSummary;
  i18n: I18n;
}) {
  const { t, num } = i18n;
  if (shop.complaints === 0) {
    return <span className="chip plain">{t.shops.noComplaints}</span>;
  }
  const open = shop.complaints - shop.complaintsResolved;
  return (
    <span className="chip plain" data-tone={open > 0 ? "wait" : undefined}>
      {[
        fill(t.shops.complaints, { n: num(shop.complaints) }),
        shop.complaintsAnswered > 0
          ? fill(t.shops.answered, { n: num(shop.complaintsAnswered) })
          : "",
        shop.complaintsResolved > 0
          ? fill(t.shops.resolved, { n: num(shop.complaintsResolved) })
          : "",
      ]
        .filter(Boolean)
        .join(", ")}
    </span>
  );
}

// Proportions of what was written, with the words beside it.
export function TypeBar({ shop, i18n }: { shop: ShopSummary; i18n: I18n }) {
  const { t, num } = i18n;
  const parts = [
    ["positive", shop.counts.positive, t.shop.good],
    ["mixed", shop.counts.mixed + shop.counts.neutral, t.shop.mixed],
    ["negative", shop.counts.negative, t.shop.bad],
  ] as const;
  return (
    <div className="typebar">
      <div aria-hidden="true">
        {parts.map(([key, count]) =>
          count > 0 ? (
            <span key={key} data-type={key} style={{ flexGrow: count }} />
          ) : null,
        )}
      </div>
      <ul>
        {parts.map(([key, count, label]) => (
          <li key={key} data-type={key}>
            {label}: <strong>{num(count)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TRUST_ICON = {
  strong: ShieldCheck,
  mixed: ShieldWarning,
  caution: Warning,
  unknown: Question,
};
const TRUST_TONE = {
  strong: "ok",
  mixed: "wait",
  caution: "bad",
  unknown: undefined,
};

// The trust signal as a badge: an icon, the level in words, and the number.
export function TrustBadge({ shop, i18n }: { shop: ShopSummary; i18n: I18n }) {
  const { level, score } = shop.trust;
  const Icon = TRUST_ICON[level];
  return (
    <span
      className="chip plain trust"
      data-tone={TRUST_TONE[level]}
      data-testid="trust-badge"
      data-level={level}
    >
      <Icon size={16} weight="fill" aria-hidden="true" />
      {i18n.t.trust.levels[level]}
      {score !== null && <b>{i18n.num(score)}</b>}
    </span>
  );
}
