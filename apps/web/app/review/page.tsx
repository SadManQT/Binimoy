import { reviewQueue } from "@lp/db/review";
import { notFound } from "next/navigation";
import { CLAIM_TEXT, DISPUTE_TEXT, ERROR_TEXT } from "../../lib/copy";
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

  return (
    <main>
      <h1>রিভিউয়ের সারি</h1>
      {error && <p role="alert">{ERROR_TEXT[error] ?? error}</p>}
      <p>
        আপনি যে ডিলের পক্ষ, তা এখানে দেখানো হয় না। দায়িত্ব নিলে শুধু সেই কেসের তথ্য দেখতে
        পাবেন, যতক্ষণ দায়িত্ব আপনার।
      </p>

      <h2>ডিসপিউট</h2>
      {queue.cases.length === 0 ? (
        <p>এখন কোনো কেস অপেক্ষায় নেই।</p>
      ) : (
        <ul>
          {queue.cases.map((entry) => (
            <li key={entry.disputeId}>
              {entry.title} · {CLAIM_TEXT[entry.claim] ?? entry.claim} ·{" "}
              {DISPUTE_TEXT[entry.state] ?? entry.state}
              {entry.mine ? (
                <>
                  {" "}
                  · <a href={`/review/${entry.disputeId}`}>আমার কেস খুলুন</a>
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
                      ? "আপিলের দায়িত্ব নিন"
                      : "দায়িত্ব নিন"}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>শুরু থেকেই মানুষের সহায়তা চাওয়া ডিল</h2>
      {queue.deals.length === 0 ? (
        <p>রিভিউয়ারের অপেক্ষায় কোনো ডিল নেই।</p>
      ) : (
        <ul>
          {queue.deals.map((deal) => (
            <li key={deal.dealId}>
              {deal.title}
              <form action={claimDealAction}>
                <input type="hidden" name="dealId" value={deal.dealId} />
                <button type="submit">এই ডিলের রিভিউয়ার হোন</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
