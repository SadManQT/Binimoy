import { listDeals } from "@lp/db/agreements";
import { unseenNotices } from "@lp/db/notices";
import {
  ROLE_TEXT,
  ROLE_TEXT_EN,
  STATE_TEXT,
  STATE_TEXT_EN,
} from "../../lib/copy";
import { getI18n } from "../../lib/i18n";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";
import { Mini3D } from "../components/mini-3d";

export const dynamic = "force-dynamic";
export const metadata = { title: "আমার ডিল · বিনিময়" };

export default async function DealsPage() {
  const user = await requireUser();
  const deals = await listDeals(pool(), user.id);
  const unseen = await unseenNotices(pool(), user.id);
  const { locale, num } = await getI18n();
  const L = (bn: string, en: string) => (locale === "en" ? en : bn);
  const roles = locale === "en" ? ROLE_TEXT_EN : ROLE_TEXT;
  const states = locale === "en" ? STATE_TEXT_EN : STATE_TEXT;
  return (
    <main className="wide">
      <div className="page-head with-3d">
        <div>
          <h1>{L("আমার ডিল", "My deals")}</h1>
          <p>
            {L(
              "ধাপে ধাপে ভেরিফাই করে লেনদেন। সব টাকা টেস্ট।",
              "Trades checked step by step. All money here is test money.",
            )}
          </p>
        </div>
        <Mini3D kind="lock" />
      </div>
      <div className="actions">
        <a className="button" href="/deals/new">
          {L("নতুন ডিল শুরু করুন", "Start a new deal")}
        </a>
        <a
          className="button quiet"
          href="/notifications"
          data-testid="notices-link"
        >
          {L("নোটিফিকেশন", "Notifications")}
          {unseen > 0
            ? L(` (${num(unseen)}টি নতুন)`, ` (${num(unseen)} new)`)
            : ""}
        </a>
      </div>
      {deals.length === 0 ? (
        <p className="empty">
          {L(
            "এখনো কোনো ডিল নেই। উপরের বাটন থেকে প্রথম ডিল তৈরি করুন।",
            "No deals yet. Use the button above to create your first one.",
          )}
        </p>
      ) : (
        <ul className="rows">
          {deals.map((deal) => (
            <li key={deal.dealId}>
              <a className="title" href={`/deals/${deal.dealId}`}>
                {deal.title}
              </a>
              <div className="meta">
                <span>{roles[deal.role]}</span>
                <span className="chip plain">
                  {states[deal.state] ?? deal.state}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
