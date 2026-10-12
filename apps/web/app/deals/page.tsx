import { listDeals } from "@lp/db/agreements";
import { ROLE_TEXT, STATE_TEXT } from "../../lib/copy";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "আমার ডিল · বিনিময়" };

export default async function DealsPage() {
  const user = await requireUser();
  const deals = await listDeals(pool(), user.id);
  return (
    <main>
      <h1>আমার ডিল</h1>
      <p>
        <a href="/deals/new">নতুন ডিল শুরু করুন</a>
      </p>
      {deals.length === 0 ? (
        <p>এখনো কোনো ডিল নেই। উপরের লিংক থেকে প্রথম ডিল তৈরি করুন।</p>
      ) : (
        <ul>
          {deals.map((deal) => (
            <li key={deal.dealId}>
              <a href={`/deals/${deal.dealId}`}>{deal.title}</a> ·{" "}
              {ROLE_TEXT[deal.role]} · {STATE_TEXT[deal.state] ?? deal.state}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
