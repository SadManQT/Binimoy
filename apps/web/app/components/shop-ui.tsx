import type { ShopSummary } from "@lp/db/shops";
import { bn } from "../../lib/copy";

// A reviewer's own rating. Stars are decoration; the number carries it.
export function Rating({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="rating">
      <span aria-hidden="true">
        {"★".repeat(full)}
        <span className="off">{"★".repeat(5 - full)}</span>
      </span>{" "}
      {bn(value)} / ৫
    </span>
  );
}

// The evidence line: how many complaints were published, how many were
// answered, how many their authors say were resolved. Counts, never a verdict.
export function ComplaintLine({ shop }: { shop: ShopSummary }) {
  if (shop.complaints === 0) {
    return <span className="chip plain">কোনো প্রকাশিত অভিযোগ নেই</span>;
  }
  const open = shop.complaints - shop.complaintsResolved;
  return (
    <span className="chip" data-tone={open > 0 ? "wait" : undefined}>
      {bn(shop.complaints)}টি অভিযোগ
      {shop.complaintsAnswered > 0
        ? ` · ${bn(shop.complaintsAnswered)}টিতে উত্তর আছে`
        : ""}
      {shop.complaintsResolved > 0
        ? ` · ${bn(shop.complaintsResolved)}টিতে সমাধান জানানো`
        : ""}
    </span>
  );
}

// Proportions of what was written, with the words beside it.
export function TypeBar({ shop }: { shop: ShopSummary }) {
  const parts = [
    ["positive", shop.counts.positive, "ভালো অভিজ্ঞতা"],
    ["mixed", shop.counts.mixed + shop.counts.neutral, "মিশ্র ও সাধারণ"],
    ["negative", shop.counts.negative, "অভিযোগ"],
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
            {label}: <strong>{bn(count)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
