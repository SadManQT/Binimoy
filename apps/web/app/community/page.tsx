import { listMyReports, listPublished } from "@lp/db/community";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";
import { saveDraftAction } from "./actions";
import {
  COMMUNITY_ERROR_TEXT,
  EXPERIENCE_TEXT,
  REPORT_STATE_TEXT,
} from "./copy";

export const dynamic = "force-dynamic";
export const metadata = { title: "অভিজ্ঞতা জানান · বিনিময়" };

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { error, q } = await searchParams;
  const mine = await listMyReports(pool(), user.id);
  const found = q ? await listPublished(pool(), q) : null;
  return (
    <main>
      <h1>অভিজ্ঞতা জানান</h1>
      <p>
        কোনো পেজ বা দোকান থেকে কেনার অভিজ্ঞতা, ভালো বা খারাপ, এখানে লিখতে পারেন। খসড়া শুধু
        আপনি দেখেন। আপনি অনুমোদন দিলে এবং একজন মডারেটর নিয়ম মিলিয়ে দেখলে তবেই
        লেখাটি প্রকাশ হয়। প্রকাশ মানে আমরা ঘটনাটি সত্য বলে যাচাই করেছি, তা নয়।
      </p>
      {error ? (
        <p role="alert">{COMMUNITY_ERROR_TEXT[error] ?? "কাজটি করা যায়নি।"}</p>
      ) : null}

      <section aria-labelledby="new">
        <h2 id="new">নতুন খসড়া</h2>
        <form action={saveDraftAction}>
          <label>
            পেজ বা দোকানের নাম
            <input name="subject" required minLength={2} maxLength={120} />
          </label>
          <label>
            অভিজ্ঞতার ধরন
            <select name="experienceType" defaultValue="negative">
              {Object.entries(EXPERIENCE_TEXT).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">খসড়া শুরু করুন</button>
        </form>
      </section>

      <section aria-labelledby="mine">
        <h2 id="mine">আমার লেখা</h2>
        {mine.length === 0 ? (
          <p>এখনো কিছু লেখেননি।</p>
        ) : (
          <ul>
            {mine.map((report) => (
              <li key={report.id}>
                <a href={`/community/${report.id}`}>{report.subject}</a> ·{" "}
                {REPORT_STATE_TEXT[report.state]}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="find">
        <h2 id="find">প্রকাশিত অভিজ্ঞতা খুঁজুন</h2>
        <form method="get">
          <label>
            হুবহু নাম
            <input name="q" defaultValue={q ?? ""} maxLength={120} />
          </label>
          <button type="submit">দেখুন</button>
        </form>
        {found === null ? null : found.length === 0 ? (
          <p>
            ঠিক এই নামে কোনো প্রকাশিত অভিজ্ঞতা নেই। এর মানে এই নয় যে কারও কোনো অভিজ্ঞতা
            নেই।
          </p>
        ) : (
          <ul>
            {found.map((report) => (
              <li key={report.id}>
                <a href={`/community/${report.id}`}>
                  {EXPERIENCE_TEXT[report.experienceType]} ·{" "}
                  {new Date(report.publishedAt).toLocaleDateString("bn-BD")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
