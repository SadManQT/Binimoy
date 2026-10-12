import { listCollections } from "@lp/adapters";
import { loadConfig } from "@lp/contracts";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";
import { runResearchAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "সেলার খোঁজ · বিনিময়" };

const ERRORS: Record<string, string> = {
  VALIDATION_FAILED: "নামটি ২ থেকে ১২০ অক্ষরের মধ্যে লিখুন।",
  BUDGET_EXHAUSTED: "আজকের খোঁজের সীমা শেষ। ২৪ ঘণ্টা পরে আবার চেষ্টা করুন।",
  LIVE_SEARCH_NOT_BUILT: "আসল ওয়েব সার্চ এখনো যুক্ত হয়নি।",
  PAUSED: "পরিচালনাকারী খোঁজ সাময়িকভাবে বন্ধ রেখেছেন।",
};
const STATUS_TEXT: Record<string, string> = {
  RUNNING: "চলছে",
  DONE: "সম্পন্ন",
  PARTIAL: "আংশিক",
  FAILED: "ব্যর্থ",
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
  return (
    <main>
      <h1>সেলার খোঁজ</h1>
      <p>
        একটি পেজ বা শপের নাম লিখুন। আমরা ওয়েবে তার সম্পর্কে লেখা পোস্ট খুঁজে, কে কী বলেছে তা
        উৎসসহ দেখাই। আমরা কাউকে ভালো বা খারাপ বলি না, কোনো স্কোর দিই না।
      </p>
      {live ? (
        <p data-testid="live-label">
          <strong>আসল ওয়েব সার্চ চালু:</strong> ফল একটি সার্চ সেবা থেকে আসে এবং পাতাগুলো
          সরাসরি পড়ার চেষ্টা করা হয়। কে লিখেছেন তা স্বয়ংক্রিয়ভাবে জানা যায় না, তাই পোস্টের ধরন
          ঠিক করা হয় না।
        </p>
      ) : (
        <p data-testid="fixture-label">
          <strong>টেস্ট তথ্য:</strong> এখন শুধু বানানো নমুনা পোস্ট থেকে ফল আসে, আসল ওয়েব
          সার্চ থেকে নয়।
        </p>
      )}
      {error ? <p role="alert">{ERRORS[error] ?? "খোঁজ শুরু করা যায়নি।"}</p> : null}
      <form action={runResearchAction}>
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
        <button type="submit">খুঁজুন</button>
      </form>
      <section aria-labelledby="past">
        <h2 id="past">আমার আগের খোঁজ</h2>
        {collections.length === 0 ? (
          <p>এখনো কোনো খোঁজ নেই।</p>
        ) : (
          <ul>
            {collections.map((c) => (
              <li key={c.id}>
                <a href={`/research/${c.id}`}>{c.subject}</a> ·{" "}
                {STATUS_TEXT[c.status]} ·{" "}
                {new Date(c.createdAt).toLocaleString("bn-BD")}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
