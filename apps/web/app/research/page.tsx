import { listCollections } from "@lp/adapters";
import { loadConfig } from "@lp/contracts";
import { getI18n } from "../../lib/i18n";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";
import { runResearchAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "সেলার খোঁজ · বিনিময়" };

const ERRORS = {
  bn: {
    VALIDATION_FAILED: "নামটি ২ থেকে ১২০ অক্ষরের মধ্যে লিখুন।",
    BUDGET_EXHAUSTED: "আজকের খোঁজের সীমা শেষ। ২৪ ঘণ্টা পরে আবার চেষ্টা করুন।",
    LIVE_SEARCH_NOT_BUILT: "আসল ওয়েব সার্চ এখনো যুক্ত হয়নি।",
    PAUSED: "পরিচালনাকারী খোঁজ সাময়িকভাবে বন্ধ রেখেছেন।",
  } as Record<string, string>,
  en: {
    VALIDATION_FAILED: "Write a name between 2 and 120 characters.",
    BUDGET_EXHAUSTED: "Today's search limit is used up. Try again in 24 hours.",
    LIVE_SEARCH_NOT_BUILT: "Real web search is not connected yet.",
    PAUSED: "The operator has paused searching for now.",
  } as Record<string, string>,
};
const STATUS_TEXT = {
  bn: { RUNNING: "চলছে", DONE: "সম্পন্ন", PARTIAL: "আংশিক", FAILED: "ব্যর্থ" },
  en: {
    RUNNING: "Running",
    DONE: "Done",
    PARTIAL: "Partial",
    FAILED: "Failed",
  },
};

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; subject?: string }>;
}) {
  const user = await requireUser();
  const { error, subject } = await searchParams;
  const collections = await listCollections(pool(), user.id);
  const live = loadConfig(process.env).RESEARCH_MODE === "live";
  const { locale, L } = await getI18n();
  return (
    <main>
      <h1>{L("সেলার খোঁজ", "Web lookup")}</h1>
      <p>
        {L(
          "একটি পেজ বা শপের নাম লিখুন। আমরা ওয়েবে তার সম্পর্কে লেখা পোস্ট খুঁজে, কে কী বলেছে তা উৎসসহ দেখাই। আমরা কাউকে ভালো বা খারাপ বলি না, কোনো স্কোর দিই না।",
          "Write the name of a page or shop. We look for posts about it on the web and show who said what, with the source. We do not call anyone good or bad, and we give no score.",
        )}
      </p>
      {live ? (
        <p data-testid="live-label">
          <strong>{L("আসল ওয়েব সার্চ চালু:", "Real web search is on:")}</strong>{" "}
          {L(
            "ফল একটি সার্চ সেবা থেকে আসে এবং পাতাগুলো সরাসরি পড়ার চেষ্টা করা হয়। কে লিখেছেন তা স্বয়ংক্রিয়ভাবে জানা যায় না, তাই পোস্টের ধরন ঠিক করা হয় না।",
            "results come from a search service and we try to read the pages directly. Who wrote a post cannot be known automatically, so posts are not sorted by type.",
          )}
        </p>
      ) : (
        <p data-testid="fixture-label">
          <strong>{L("টেস্ট তথ্য:", "Test data:")}</strong>{" "}
          {L(
            "এখন শুধু বানানো নমুনা পোস্ট থেকে ফল আসে, আসল ওয়েব সার্চ থেকে নয়।",
            "results currently come only from made-up sample posts, not from real web search.",
          )}
        </p>
      )}
      {error ? (
        <p role="alert">
          {ERRORS[locale][error] ??
            L("খোঁজ শুরু করা যায়নি।", "The search could not be started.")}
        </p>
      ) : null}
      <form action={runResearchAction}>
        <label>
          {L("পেজ বা শপের নাম", "Name of the page or shop")}
          <input
            name="subject"
            required
            minLength={2}
            maxLength={120}
            defaultValue={subject}
          />
        </label>
        <button type="submit">{L("খুঁজুন", "Search")}</button>
      </form>
      <section aria-labelledby="past">
        <h2 id="past">{L("আমার আগের খোঁজ", "My earlier searches")}</h2>
        {collections.length === 0 ? (
          <p>{L("এখনো কোনো খোঁজ নেই।", "No searches yet.")}</p>
        ) : (
          <ul>
            {collections.map((c) => (
              <li key={c.id}>
                <a href={`/research/${c.id}`}>{c.subject}</a> ·{" "}
                {STATUS_TEXT[locale][c.status]} ·{" "}
                {new Date(c.createdAt).toLocaleString(
                  locale === "en" ? "en-GB" : "bn-BD",
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
