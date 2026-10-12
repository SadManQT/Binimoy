import { listDeals } from "@lp/db/agreements";
import { unseenNotices } from "@lp/db/notices";
import { ROLE_TEXT, STATE_TEXT } from "../../lib/copy";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "আমার ডিল · বিনিময়" };

export default async function DealsPage() {
  const user = await requireUser();
  const deals = await listDeals(pool(), user.id);
  const unseen = await unseenNotices(pool(), user.id);
  return (
    <main className="wide">
      <div className="page-head">
        <h1>আমার ডিল</h1>
        <p>ধাপে ধাপে যাচাই করে লেনদেন। সব টাকা পরীক্ষামূলক (নকল)।</p>
      </div>
      <div className="actions">
        <a className="button" href="/deals/new">
          নতুন ডিল শুরু করুন
        </a>
        <a
          className="button quiet"
          href="/notifications"
          data-testid="notices-link"
        >
          নোটিশ{unseen > 0 ? ` (${unseen.toLocaleString("bn-BD")}টি নতুন)` : ""}
        </a>
      </div>
      {deals.length === 0 ? (
        <p className="empty">
          এখনো কোনো ডিল নেই। উপরের বোতাম থেকে প্রথম ডিল তৈরি করুন।
        </p>
      ) : (
        <ul className="rows">
          {deals.map((deal) => (
            <li key={deal.dealId}>
              <a className="title" href={`/deals/${deal.dealId}`}>
                {deal.title}
              </a>
              <div className="meta">
                <span>{ROLE_TEXT[deal.role]}</span>
                <span className="chip plain">
                  {STATE_TEXT[deal.state] ?? deal.state}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
