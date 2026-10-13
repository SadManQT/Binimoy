import {
  listMyReports,
  listPublished,
  SHOP_CATEGORY_KEYS,
} from "@lp/db/community";
import { SHOP_CATEGORIES } from "@lp/db/shops";
import { getI18n } from "../../lib/i18n";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";
import { saveDraftAction } from "./actions";
import { communityCopy } from "./copy";

export const dynamic = "force-dynamic";
export const metadata = { title: "এক্সপেরিয়েন্স জানান · বিনিময়" };

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    q?: string;
    subject?: string;
    type?: string;
  }>;
}) {
  const user = await requireUser();
  const { locale, t } = await getI18n();
  const L = (bn: string, en: string) => (locale === "en" ? en : bn);
  const { COMMUNITY_ERROR_TEXT, EXPERIENCE_TEXT, REPORT_STATE_TEXT } =
    communityCopy(locale);
  const { error, q, subject, type } = await searchParams;
  const mine = await listMyReports(pool(), user.id);
  const found = q ? await listPublished(pool(), q) : null;
  return (
    <main>
      <h1>{L("এক্সপেরিয়েন্স জানান", "Write a review")}</h1>
      <p>
        {L(
          "কোনো পেজ বা শপ থেকে কেনার এক্সপেরিয়েন্স, ভালো বা খারাপ, এখানে লিখতে পারেন। ড্রাফট শুধু আপনি দেখেন। আপনি অ্যাপ্রুভাল দিলে এবং একজন মডারেটর নিয়ম মিলিয়ে দেখলে তবেই লেখাটি প্রকাশ হয়। প্রকাশ মানে আমরা ঘটনাটি সত্য বলে ভেরিফাই করেছি, তা নয়।",
          "You can write here about buying from any page or shop, good or bad. Only you see a draft. A text is published only after you approve it and a moderator checks it against the rules. Published does not mean we verified that the events are true.",
        )}
      </p>
      {error ? (
        <p role="alert">
          {COMMUNITY_ERROR_TEXT[error] ??
            L("কাজটি করা যায়নি।", "That could not be done.")}
        </p>
      ) : null}

      <section aria-labelledby="new">
        <h2 id="new">{L("নতুন ড্রাফট", "New draft")}</h2>
        <form action={saveDraftAction}>
          <label>
            {L("পেজ বা শপের নাম", "Page or shop name")}
            <input
              name="subject"
              required
              minLength={2}
              maxLength={120}
              defaultValue={subject}
            />
          </label>
          <label>
            {L("এক্সপেরিয়েন্সের ধরন", "Type of experience")}
            <select
              name="experienceType"
              defaultValue={type === "negative" ? "negative" : "positive"}
            >
              {Object.entries(t.types).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {L("শপের ধরন", "Kind of shop")}
            <select name="shopCategory" defaultValue="other">
              {SHOP_CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t.categories[key]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{L("ড্রাফট শুরু করুন", "Start a draft")}</button>
        </form>
      </section>

      <section aria-labelledby="mine">
        <h2 id="mine">{L("আমার লেখা", "My posts")}</h2>
        {mine.length === 0 ? (
          <p>{L("এখনো কিছু লেখেননি।", "You have not written anything yet.")}</p>
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
        <h2 id="find">
          {L("পাবলিশড এক্সপেরিয়েন্স খুঁজুন", "Find published reviews")}
        </h2>
        <form method="get">
          <label>
            {L("হুবহু নাম", "Exact name")}
            <input name="q" defaultValue={q ?? ""} maxLength={120} />
          </label>
          <button type="submit">{L("দেখুন", "Show")}</button>
        </form>
        {found === null ? null : found.length === 0 ? (
          <p>
            {L(
              "ঠিক এই নামে কোনো পাবলিশড এক্সপেরিয়েন্স নেই। এর মানে এই নয় যে কারও কোনো এক্সপেরিয়েন্স নেই।",
              "There is no published experience under exactly this name. That does not mean nobody has had one.",
            )}
          </p>
        ) : (
          <ul>
            {found.map((report) => (
              <li key={report.id}>
                <a href={`/community/${report.id}`}>
                  {EXPERIENCE_TEXT[report.experienceType]} ·{" "}
                  {new Date(report.publishedAt).toLocaleDateString(
                    locale === "en" ? "en-GB" : "bn-BD",
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
