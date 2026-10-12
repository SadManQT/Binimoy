import {
  listMyReports,
  listPublished,
  SHOP_CATEGORY_KEYS,
} from "@lp/db/community";
import { SHOP_CATEGORIES } from "@lp/db/shops";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";
import { saveDraftAction } from "./actions";
import {
  COMMUNITY_ERROR_TEXT,
  EXPERIENCE_TEXT,
  REPORT_STATE_TEXT,
} from "./copy";

export const dynamic = "force-dynamic";
export const metadata = { title: "এক্সপেরিয়েন্স জানান · বিনিময়" };

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string; subject?: string }>;
}) {
  const user = await requireUser();
  const { error, q, subject } = await searchParams;
  const mine = await listMyReports(pool(), user.id);
  const found = q ? await listPublished(pool(), q) : null;
  return (
    <main>
      <h1>এক্সপেরিয়েন্স জানান</h1>
      <p>
        কোনো পেজ বা শপ থেকে কেনার এক্সপেরিয়েন্স, ভালো বা খারাপ, এখানে লিখতে পারেন। ড্রাফট শুধু
        আপনি দেখেন। আপনি অ্যাপ্রুভাল দিলে এবং একজন মডারেটর নিয়ম মিলিয়ে দেখলে তবেই
        লেখাটি প্রকাশ হয়। প্রকাশ মানে আমরা ঘটনাটি সত্য বলে ভেরিফাই করেছি, তা নয়।
      </p>
      {error ? (
        <p role="alert">{COMMUNITY_ERROR_TEXT[error] ?? "কাজটি করা যায়নি।"}</p>
      ) : null}

      <section aria-labelledby="new">
        <h2 id="new">নতুন ড্রাফট</h2>
        <form action={saveDraftAction}>
          <label>
            পেজ বা শপের নাম
            <input
              name="subject"
              required
              minLength={2}
              maxLength={120}
              defaultValue={subject}
            />
          </label>
          <label>
            এক্সপেরিয়েন্সের ধরন
            <select name="experienceType" defaultValue="negative">
              {Object.entries(EXPERIENCE_TEXT).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            শপের ধরন
            <select name="shopCategory" defaultValue="other">
              {SHOP_CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SHOP_CATEGORIES[key].bn}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">ড্রাফট শুরু করুন</button>
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
        <h2 id="find">পাবলিশড এক্সপেরিয়েন্স খুঁজুন</h2>
        <form method="get">
          <label>
            হুবহু নাম
            <input name="q" defaultValue={q ?? ""} maxLength={120} />
          </label>
          <button type="submit">দেখুন</button>
        </form>
        {found === null ? null : found.length === 0 ? (
          <p>
            ঠিক এই নামে কোনো পাবলিশড এক্সপেরিয়েন্স নেই। এর মানে এই নয় যে কারও কোনো
            এক্সপেরিয়েন্স নেই।
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
