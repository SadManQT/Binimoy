import { SHOP_CATEGORY_KEYS } from "@lp/db/community";
import { listAlerts, SHOP_CATEGORIES } from "@lp/db/shops";
import { bnDate, ISSUE_TEXT } from "../../lib/copy";
import { pool } from "../../lib/pool";

export const dynamic = "force-dynamic";
export const metadata = { title: "সতর্কতা · বিনিময়" };

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category = "" } = await searchParams;
  const { reports, notes } = await listAlerts(pool(), { limit: 60, category });

  return (
    <main className="wide">
      <div className="page-head">
        <h1>সতর্কতা</h1>
        <p>
          সম্প্রতি প্রকাশিত অভিযোগ, এবং মডারেটরদের লেখা সাধারণ সতর্কবার্তা। টাকা পাঠানোর আগে
          দোকানের নামটি এখানে এবং দোকানের পাতায় মিলিয়ে নিন।
        </p>
      </div>
      <p className="notice" data-testid="allegation-note">
        এখানে প্রতিটি অভিযোগ তার লেখকের নিজের দাবি। মডারেটর দেখেছেন লেখাটি প্রকাশের নিয়ম
        মানে কি না; ঘটনাটি সত্য কি না, তা বিনিময় তদন্ত করেনি। দোকানের উত্তর দেওয়ার সুযোগ
        আছে, এবং উত্তর না দেওয়া মানে স্বীকার করা নয়।
      </p>

      {notes.length > 0 && (
        <section aria-labelledby="notes" data-testid="safety-notes">
          <h2 id="notes">মডারেটরদের সতর্কবার্তা</h2>
          <ul className="notes">
            {notes.map((note) => (
              <li key={note.id}>
                <h3>{note.title}</h3>
                <p>{note.body}</p>
                <small>{bnDate(note.publishedAt)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="filters" aria-label="দোকানের ধরন">
        <a href="/alerts" aria-current={category ? undefined : "true"}>
          সব ধরন
        </a>
        {SHOP_CATEGORY_KEYS.map((key) => (
          <a
            key={key}
            href={`/alerts?category=${key}`}
            aria-current={category === key ? "true" : undefined}
          >
            {SHOP_CATEGORIES[key].bn}
          </a>
        ))}
      </nav>

      {reports.length === 0 ? (
        <div className="empty" data-testid="no-alerts">
          <p>
            এখন কোনো প্রকাশিত অভিযোগ নেই। এর মানে কোনো সমস্যা ঘটেনি, তা নয়; শুধু এখানে
            কিছু প্রকাশ হয়নি।
          </p>
          <a className="button" href="/community">
            অভিযোগ বা অভিজ্ঞতা লিখুন
          </a>
        </div>
      ) : (
        <ul className="cards" data-testid="alerts">
          {reports.map((report) => (
            <li key={report.id} data-type="negative">
              <div className="meta">
                <a className="title" href={`/shops/${report.shopId}`}>
                  {report.shopName}
                </a>
                <span>
                  {report.shopCategory
                    ? SHOP_CATEGORIES[report.shopCategory].bn
                    : "ধরন জানা নেই"}
                </span>
                <span>প্রকাশ {bnDate(report.publishedAt)}</span>
              </div>
              <p>
                <strong>লেখকের অভিযোগ:</strong>{" "}
                {ISSUE_TEXT[report.issue ?? "other"]}{" "}
                <small>(যাচাই করা হয়নি)</small>
              </p>
              <blockquote>{report.text}</blockquote>
              <div className="meta">
                <span className="chip plain">
                  {report.answered ? "উত্তর দেওয়া হয়েছে" : "এখনো কোনো উত্তর নেই"}
                </span>
                {report.resolved && (
                  <span className="chip" data-tone="ok">
                    লেখক জানিয়েছেন সমাধান হয়েছে
                  </span>
                )}
                <a href={`/community/${report.id}`}>পুরো লেখা ও উত্তর</a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <a className="button" href="/community">
          অভিযোগ বা অভিজ্ঞতা লিখুন
        </a>
        <a className="button quiet" href="/shops">
          দোকান খুঁজুন
        </a>
      </div>
    </main>
  );
}
