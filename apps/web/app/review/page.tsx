import { reviewQueue } from "@lp/db/review";
import { notFound } from "next/navigation";
import { copyFor } from "../../lib/copy";
import { getI18n } from "../../lib/i18n";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";
import { claimDealAction, claimReviewAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "রিভিউ · বিনিময়" };

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;
  // Not staff and "no such page" look the same on purpose.
  const queue = await reviewQueue(pool(), user.id);
  if (!queue) notFound();
  const { locale, L } = await getI18n();
  const copy = copyFor(locale);

  return (
    <main>
      <h1>{L("রিভিউয়ের সারি", "Review queue")}</h1>
      {error && <p role="alert">{copy.error[error] ?? error}</p>}
      <p>
        {L(
          "আপনি যে ডিলের পক্ষ, তা এখানে দেখানো হয় না। দায়িত্ব নিলে শুধু সেই কেসের তথ্য দেখতে পাবেন, যতক্ষণ দায়িত্ব আপনার।",
          "Deals you are a party to are not shown here. When you take a case you see only that case's information, for as long as it is yours.",
        )}
      </p>

      <h2>{L("ডিসপিউট", "Disputes")}</h2>
      {queue.cases.length === 0 ? (
        <p>
          {L("এখন কোনো কেস অপেক্ষায় নেই।", "No cases are waiting right now.")}
        </p>
      ) : (
        <ul>
          {queue.cases.map((entry) => (
            <li key={entry.disputeId}>
              {entry.title} · {copy.claim[entry.claim] ?? entry.claim} ·{" "}
              {copy.dispute[entry.state] ?? entry.state}
              {entry.mine ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={`/review/${entry.disputeId}`}>
                    {L("আমার কেস খুলুন", "Open my case")}
                  </a>
                </>
              ) : (
                <form action={claimReviewAction}>
                  <input
                    type="hidden"
                    name="disputeId"
                    value={entry.disputeId}
                  />
                  <button type="submit">
                    {entry.state === "APPEALED"
                      ? L("আপিলের দায়িত্ব নিন", "Take the appeal")
                      : L("দায়িত্ব নিন", "Take this case")}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>
        {L(
          "শুরু থেকেই মানুষের সহায়তা চাওয়া ডিল",
          "Deals that asked for human help from the start",
        )}
      </h2>
      {queue.deals.length === 0 ? (
        <p>
          {L(
            "রিভিউয়ারের অপেক্ষায় কোনো ডিল নেই।",
            "No deals are waiting for a reviewer.",
          )}
        </p>
      ) : (
        <ul>
          {queue.deals.map((deal) => (
            <li key={deal.dealId}>
              {deal.title}
              <form action={claimDealAction}>
                <input type="hidden" name="dealId" value={deal.dealId} />
                <button type="submit">
                  {L("এই ডিলের রিভিউয়ার হোন", "Become this deal's reviewer")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
