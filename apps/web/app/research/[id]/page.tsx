import { getCollection, type ReportCard } from "@lp/adapters";
import { notFound } from "next/navigation";
import { pool } from "../../../lib/pool";
import { requireUser } from "../../../lib/session";
import { setCardMatchAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "খোঁজের ফল · বিনিময়" };

// C7.1: a label says what the author reports, never what the subject is.
const TYPE_TEXT: Record<string, string> = {
  positive: "ভালো অভিজ্ঞতার কথা লিখেছেন",
  negative: "অভিযোগ লিখেছেন",
  mixed: "ভালো ও খারাপ দুটোই লিখেছেন",
  neutral: "অভিজ্ঞতার কথা লিখেছেন",
  resolution: "সমাধানের কথা লিখেছেন",
  response: "বিক্রেতার উত্তর",
};
const CONTENT_TEXT: Record<string, string> = {
  customer_experience: "ক্রেতার পোস্ট",
  seller_response: "বিক্রেতার নিজের বক্তব্য",
  advertisement: "বিজ্ঞাপন",
  news: "সংবাদ",
};
const ACCESS_TEXT: Record<string, string> = {
  FULL_TEXT: "পুরো পোস্ট পড়া গেছে",
  PARTIAL_TEXT: "পোস্টের অংশ পড়া গেছে",
  SNIPPET_ONLY: "ওয়েব সার্চে পাওয়া গেছে; পুরো পোস্ট পড়া যায়নি",
  LINK_ONLY: "শুধু লিংক পাওয়া গেছে; পোস্ট পড়া যায়নি",
  USER_SUBMITTED: "ব্যবহারকারীর দেওয়া",
  UNAVAILABLE: "উৎস খোলা যায়নি",
};
const LIMIT_TEXT: Record<string, string> = {
  NOT_RETRIEVED:
    "পোস্টটি পড়া যায়নি, তাই এতে কী লেখা তা আমরা বলছি না। নিচের লেখাটুকু সার্চ ফলাফলের টুকরো।",
  KEYWORD_SORTED: "ধরনটি শব্দ মিলিয়ে ঠিক করা, ভুল হতে পারে। মূল পোস্ট পড়ে নিন।",
  AUTHOR_UNKNOWN: "কে লিখেছেন জানা যায়নি, তাই ধরন ঠিক করা হয়নি।",
};
const STATUS_TEXT: Record<string, string> = {
  RUNNING: "খোঁজ চলছে।",
  DONE: "খোঁজ সম্পন্ন।",
  PARTIAL: "খোঁজ আংশিক: কিছু সার্চ ব্যর্থ হয়েছে বা ফলাফল সীমা ছাড়িয়েছে।",
  FAILED: "খোঁজ ব্যর্থ: সার্চ সেবা সাড়া দেয়নি। এটি 'কিছু পাওয়া যায়নি' নয়।",
};
const n = (value: number) => value.toLocaleString("bn-BD");
const date = (iso: string) => new Date(iso).toLocaleDateString("bn-BD");

function Card({
  card,
  collectionId,
}: {
  card: ReportCard;
  collectionId: string;
}) {
  const exact = card.subjectMatch === "exact";
  return (
    <li data-testid="report-card" data-access={card.accessStatus}>
      {/* Source, date, type and access come before any text (C8). */}
      <p>
        <strong data-testid="card-type">
          {card.reportType
            ? TYPE_TEXT[card.reportType]
            : card.contentType
              ? CONTENT_TEXT[card.contentType]
              : "ধরন ঠিক করা হয়নি"}
        </strong>
        {card.contentType ? ` · ${CONTENT_TEXT[card.contentType]}` : ""}
        <br />
        উৎস: {new URL(card.url).hostname} · প্রকাশ:{" "}
        {card.publishedAt ? date(card.publishedAt) : "জানা যায়নি"} · সংগ্রহ:{" "}
        {date(card.retrievedAt)} · সার্চ: {card.provider}
        <br />
        <span data-testid="card-access">{ACCESS_TEXT[card.accessStatus]}</span>
      </p>
      {card.summary ? (
        <blockquote data-testid="card-summary">
          লেখক লিখেছেন: “{card.summary}”
        </blockquote>
      ) : (
        <p data-testid="card-snippet">সার্চ ফলাফলের টুকরো: “{card.snippet}”</p>
      )}
      <p>
        <small>{LIMIT_TEXT[card.limitations]}</small>
      </p>
      <p>
        <a href={card.url} rel="noreferrer noopener nofollow" target="_blank">
          মূল উৎস খুলুন: {card.title}
        </a>
      </p>
      <form action={setCardMatchAction}>
        <input type="hidden" name="collectionId" value={collectionId} />
        <input type="hidden" name="cardId" value={card.id} />
        <input
          type="hidden"
          name="match"
          value={exact ? "ambiguous" : "exact"}
        />
        <button type="submit">
          {exact ? "এটি অন্য কারও সম্পর্কে" : "এটি এই নামেরই"}
        </button>
      </form>
    </li>
  );
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const view = await getCollection(pool(), {
    userId: user.id,
    collectionId: id,
  });
  if (!view) notFound();

  const confirmed = view.cards.filter((c) => c.subjectMatch === "exact");
  const possible = view.cards.filter((c) => c.subjectMatch === "ambiguous");
  const dates = confirmed
    .flatMap((c) => (c.publishedAt ? [c.publishedAt] : []))
    .sort();
  const failed = view.coverage.queries.filter((q) => !q.ok).length;
  const { counts } = view;

  return (
    <main>
      <p>
        <a href="/research">← নতুন খোঁজ</a>
      </p>
      <h1>“{view.subject}” সম্পর্কে যা পাওয়া গেছে</h1>
      <p data-testid="fixture-label">
        {view.coverage.providers.includes("fixture") ? (
          <strong>পরীক্ষামূলক তথ্য: এগুলো বানানো নমুনা পোস্ট, আসল ওয়েব ফল নয়।</strong>
        ) : null}
      </p>

      <section aria-labelledby="coverage" data-testid="coverage">
        <h2 id="coverage">কোথায় কতটা খোঁজা হয়েছে</h2>
        <p>{STATUS_TEXT[view.status]}</p>
        <p>
          {new Date(view.coverage.searchedAt).toLocaleString("bn-BD")} সময়ে{" "}
          {view.coverage.providers.join(", ")} দিয়ে{" "}
          {view.coverage.queries.length}টি সার্চ চালানো হয়েছে (বাংলা, ইংরেজি ও বাংলিশে)
          {failed ? `, ${failed}টি ব্যর্থ` : ""}। {view.coverage.candidates}টি
          লিংক পাওয়া গেছে; {view.coverage.notRetrieved}টি পড়া যায়নি।
        </p>
        <p>
          ওয়েব সার্চ সব পোস্ট পায় না। প্রাইভেট গ্রুপ ও লগইন-দেয়ালের ভেতরের পোস্ট এখানে নেই।
          এই ফল অসম্পূর্ণ, এবং এটি কারও সম্পর্কে কোনো রায় নয়।
        </p>
      </section>

      <section aria-labelledby="counts" data-testid="counts">
        <h2 id="counts">এই খোঁজে পাওয়া ক্রেতার পোস্ট</h2>
        <p>
          ভালো অভিজ্ঞতা {n(counts.positive)}টি · অভিযোগ {n(counts.negative)}টি ·
          মিশ্র {n(counts.mixed)}টি · সমাধানের খবর {n(counts.resolution)}টি · অন্যান্য{" "}
          {n(counts.neutral)}টি
        </p>
        <p>
          <small>
            এগুলো শুধু এই খোঁজে পাওয়া পোস্টের সংখ্যা
            {dates.length
              ? ` (${date(dates[0] as string)} থেকে ${date(dates.at(-1) as string)})`
              : ""}
            । একই লেখার কপি একবার গোনা হয়েছে; “সম্ভবত সম্পর্কিত” পোস্ট, বিজ্ঞাপন, সংবাদ ও
            বিক্রেতার উত্তর গোনা হয়নি। এটি সব ক্রেতার হিসাব নয়, এবং বেশি ভালো পোস্ট মানেই
            নির্ভরযোগ্য, তা নয়।
          </small>
        </p>
      </section>

      <section aria-labelledby="confirmed">
        <h2 id="confirmed">এই নামের পোস্ট</h2>
        {confirmed.length === 0 ? (
          <p data-testid="no-results">
            এই খোঁজে কিছু পাওয়া যায়নি। এর মানে এই নয় যে কোনো পোস্ট নেই।
          </p>
        ) : (
          <ul data-testid="confirmed-cards">
            {confirmed.map((card) => (
              <Card key={card.id} card={card} collectionId={view.id} />
            ))}
          </ul>
        )}
      </section>

      {possible.length > 0 ? (
        <section aria-labelledby="possible">
          <h2 id="possible">সম্ভবত সম্পর্কিত</h2>
          <p>
            এগুলোর নাম কাছাকাছি, কিন্তু একই পেজ বা দোকান কি না নিশ্চিত নয়। এগুলো উপরের গণনায়
            নেই।
          </p>
          <ul data-testid="possible-cards">
            {possible.map((card) => (
              <Card key={card.id} card={card} collectionId={view.id} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
