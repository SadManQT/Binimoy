import { getCollection, type ReportCard } from "@lp/adapters";
import { listPublished } from "@lp/db/community";
import { notFound } from "next/navigation";
import { getI18n, type I18n } from "../../../lib/i18n";
import { pool } from "../../../lib/pool";
import { requireUser } from "../../../lib/session";
import { setCardMatchAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "খোঁজের ফল · বিনিময়" };

type Words = Record<string, string>;
// C7.1: a label says what the author reports, never what the subject is.
const TYPE_TEXT: Record<"bn" | "en", Words> = {
  bn: {
    positive: "ভালো এক্সপেরিয়েন্সের কথা লিখেছেন",
    negative: "রিপোর্ট লিখেছেন",
    mixed: "ভালো ও খারাপ দুটোই লিখেছেন",
    neutral: "এক্সপেরিয়েন্সের কথা লিখেছেন",
    resolution: "সমাধানের কথা লিখেছেন",
    response: "সেলারের উত্তর",
  },
  en: {
    positive: "Wrote about a good experience",
    negative: "Wrote a report",
    mixed: "Wrote about both good and bad",
    neutral: "Wrote about an experience",
    resolution: "Wrote about a resolution",
    response: "The seller's reply",
  },
};
const CONTENT_TEXT: Record<"bn" | "en", Words> = {
  bn: {
    customer_experience: "বায়ারের পোস্ট",
    seller_response: "সেলারের নিজের বক্তব্য",
    advertisement: "বিজ্ঞাপন",
    news: "সংবাদ",
  },
  en: {
    customer_experience: "A buyer's post",
    seller_response: "The seller's own statement",
    advertisement: "Advertisement",
    news: "News",
  },
};
const ACCESS_TEXT: Record<"bn" | "en", Words> = {
  bn: {
    FULL_TEXT: "পুরো পোস্ট পড়া গেছে",
    PARTIAL_TEXT: "পোস্টের অংশ পড়া গেছে",
    SNIPPET_ONLY: "ওয়েব সার্চে পাওয়া গেছে; পুরো পোস্ট পড়া যায়নি",
    LINK_ONLY: "শুধু লিংক পাওয়া গেছে; পোস্ট পড়া যায়নি",
    USER_SUBMITTED: "ব্যবহারকারীর দেওয়া",
    UNAVAILABLE: "উৎস খোলা যায়নি",
  },
  en: {
    FULL_TEXT: "The whole post was read",
    PARTIAL_TEXT: "Part of the post was read",
    SNIPPET_ONLY: "Found by web search; the whole post could not be read",
    LINK_ONLY: "Only a link was found; the post could not be read",
    USER_SUBMITTED: "Given by a user",
    UNAVAILABLE: "The source could not be opened",
  },
};
const LIMIT_TEXT: Record<"bn" | "en", Words> = {
  bn: {
    NOT_RETRIEVED:
      "পোস্টটি পড়া যায়নি, তাই এতে কী লেখা তা আমরা বলছি না। নিচের লেখাটুকু সার্চ ফলাফলের টুকরো।",
    KEYWORD_SORTED: "ধরনটি শব্দ মিলিয়ে ঠিক করা, ভুল হতে পারে। মূল পোস্ট পড়ে নিন।",
    AUTHOR_UNKNOWN: "কে লিখেছেন জানা যায়নি, তাই ধরন ঠিক করা হয়নি।",
  },
  en: {
    NOT_RETRIEVED:
      "The post could not be read, so we are not saying what it says. The text below is a snippet from the search result.",
    KEYWORD_SORTED:
      "The type was set by matching words and may be wrong. Read the original post.",
    AUTHOR_UNKNOWN: "Who wrote it is not known, so no type was set.",
  },
};
const STATUS_TEXT: Record<"bn" | "en", Words> = {
  bn: {
    RUNNING: "খোঁজ চলছে।",
    DONE: "খোঁজ সম্পন্ন।",
    PARTIAL: "খোঁজ আংশিক: কিছু সার্চ ব্যর্থ হয়েছে বা ফলাফল সীমা ছাড়িয়েছে।",
    FAILED: "খোঁজ ব্যর্থ: সার্চ সেবা সাড়া দেয়নি। এটি 'কিছু পাওয়া যায়নি' নয়।",
  },
  en: {
    RUNNING: "The search is running.",
    DONE: "The search is done.",
    PARTIAL:
      "The search is partial: some searches failed or the results went over the limit.",
    FAILED:
      "The search failed: the search service did not answer. This is not “nothing found”.",
  },
};

function Card({
  card,
  collectionId,
  i18n: { locale, L, date },
}: {
  card: ReportCard;
  collectionId: string;
  i18n: I18n;
}) {
  const exact = card.subjectMatch === "exact";
  return (
    <li data-testid="report-card" data-access={card.accessStatus}>
      {/* Source, date, type and access come before any text (C8). */}
      <p>
        <strong data-testid="card-type">
          {card.reportType
            ? TYPE_TEXT[locale][card.reportType]
            : card.contentType
              ? CONTENT_TEXT[locale][card.contentType]
              : L("ধরন ঠিক করা হয়নি", "No type set")}
        </strong>
        {card.contentType ? ` · ${CONTENT_TEXT[locale][card.contentType]}` : ""}
        <br />
        {L("উৎস", "Source")}: {new URL(card.url).hostname} ·{" "}
        {L("প্রকাশ", "published")}:{" "}
        {card.publishedAt ? date(card.publishedAt) : L("জানা যায়নি", "not known")}{" "}
        · {L("সংগ্রহ", "collected")}: {date(card.retrievedAt)} ·{" "}
        {L("সার্চ", "search")}: {card.provider}
        <br />
        <span data-testid="card-access">
          {ACCESS_TEXT[locale][card.accessStatus]}
        </span>
      </p>
      {card.summary ? (
        <blockquote data-testid="card-summary">
          {L("লেখক লিখেছেন", "The writer wrote")}: “{card.summary}”
        </blockquote>
      ) : (
        <p data-testid="card-snippet">
          {L("সার্চ ফলাফলের টুকরো", "Search result snippet")}: “{card.snippet}”
        </p>
      )}
      <p>
        <small>{LIMIT_TEXT[locale][card.limitations]}</small>
      </p>
      <p>
        <a href={card.url} rel="noreferrer noopener nofollow" target="_blank">
          {L("মূল উৎস খুলুন", "Open the original source")}: {card.title}
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
          {exact
            ? L("এটি অন্য কারও সম্পর্কে", "This is about someone else")
            : L("এটি এই নামেরই", "This is about this name")}
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
  const i18n = await getI18n();
  const { locale, L, num: n, date } = i18n;

  const community = await listPublished(pool(), view.subject);
  const confirmed = view.cards.filter((c) => c.subjectMatch === "exact");
  const possible = view.cards.filter((c) => c.subjectMatch === "ambiguous");
  const dates = confirmed
    .flatMap((c) => (c.publishedAt ? [c.publishedAt] : []))
    .sort();
  const failed = view.coverage.queries.filter((q) => !q.ok).length;
  const { counts } = view;
  const searchedAt = new Date(view.coverage.searchedAt).toLocaleString(
    locale === "en" ? "en-GB" : "bn-BD",
  );
  const providers = view.coverage.providers.join(", ");
  const range = dates.length
    ? L(
        ` (${date(dates[0] as string)} থেকে ${date(dates.at(-1) as string)})`,
        ` (${date(dates[0] as string)} to ${date(dates.at(-1) as string)})`,
      )
    : "";

  return (
    <main>
      <p>
        <a href="/research">← {L("নতুন খোঁজ", "New search")}</a>
      </p>
      <h1>
        {L(
          `“${view.subject}” সম্পর্কে যা পাওয়া গেছে`,
          `What was found about “${view.subject}”`,
        )}
      </h1>
      <p data-testid="fixture-label">
        {view.coverage.providers.includes("fixture") ? (
          <strong>
            {L(
              "টেস্ট তথ্য: এগুলো বানানো নমুনা পোস্ট, আসল ওয়েব ফল নয়।",
              "Test data: these are made-up sample posts, not real web results.",
            )}
          </strong>
        ) : null}
      </p>

      <section aria-labelledby="coverage" data-testid="coverage">
        <h2 id="coverage">
          {L("কোথায় কতটা খোঁজা হয়েছে", "Where and how much was searched")}
        </h2>
        <p>{STATUS_TEXT[locale][view.status]}</p>
        <p>
          {L(
            `${searchedAt} সময়ে ${providers} দিয়ে ${view.coverage.queries.length}টি সার্চ চালানো হয়েছে (বাংলা, ইংরেজি ও বাংলিশে)${failed ? `, ${failed}টি ব্যর্থ` : ""}। ${view.coverage.candidates}টি লিংক পাওয়া গেছে; ${view.coverage.notRetrieved}টি পড়া যায়নি।`,
            `At ${searchedAt}, ${view.coverage.queries.length} searches were run with ${providers} (in Bangla, English and Banglish)${failed ? `, ${failed} failed` : ""}. ${view.coverage.candidates} links were found; ${view.coverage.notRetrieved} could not be read.`,
          )}
        </p>
        <p>
          {L(
            "ওয়েব সার্চ সব পোস্ট পায় না। প্রাইভেট গ্রুপ ও লগইন-দেয়ালের ভেতরের পোস্ট এখানে নেই। এই ফল অসম্পূর্ণ, এবং এটি কারও সম্পর্কে কোনো রায় নয়।",
            "Web search does not find every post. Posts in private groups and behind login walls are not here. These results are incomplete, and they are not a verdict on anyone.",
          )}
        </p>
      </section>

      <section aria-labelledby="counts" data-testid="counts">
        <h2 id="counts">
          {L("এই খোঁজে পাওয়া বায়ারের পোস্ট", "Buyers' posts found in this search")}
        </h2>
        <p>
          {L(
            `ভালো এক্সপেরিয়েন্স ${n(counts.positive)}টি · রিপোর্ট ${n(counts.negative)}টি · মিশ্র ${n(counts.mixed)}টি · সমাধানের খবর ${n(counts.resolution)}টি · অন্যান্য ${n(counts.neutral)}টি`,
            `Good experiences: ${n(counts.positive)} · Reports: ${n(counts.negative)} · Mixed: ${n(counts.mixed)} · Resolutions: ${n(counts.resolution)} · Other: ${n(counts.neutral)}`,
          )}
        </p>
        <p>
          <small>
            {L(
              `এগুলো শুধু এই খোঁজে পাওয়া পোস্টের সংখ্যা${range}। একই লেখার কপি একবার গোনা হয়েছে; “সম্ভবত সম্পর্কিত” পোস্ট, বিজ্ঞাপন, সংবাদ ও সেলারের উত্তর গোনা হয়নি। এটি সব বায়ারের হিসাব নয়, এবং বেশি ভালো পোস্ট মানেই নির্ভরযোগ্য, তা নয়।`,
              `These are only the posts found in this search${range}. Copies of the same text were counted once; “possibly related” posts, advertisements, news and the seller's replies were not counted. This is not a count of all buyers, and more good posts does not mean reliable.`,
            )}
          </small>
        </p>
      </section>

      <section aria-labelledby="confirmed">
        <h2 id="confirmed">{L("এই নামের পোস্ট", "Posts about this name")}</h2>
        {confirmed.length === 0 ? (
          <p data-testid="no-results">
            {L(
              "এই খোঁজে কিছু পাওয়া যায়নি। এর মানে এই নয় যে কোনো পোস্ট নেই।",
              "Nothing was found in this search. That does not mean there are no posts.",
            )}
          </p>
        ) : (
          <ul data-testid="confirmed-cards">
            {confirmed.map((card) => (
              <Card
                key={card.id}
                card={card}
                collectionId={view.id}
                i18n={i18n}
              />
            ))}
          </ul>
        )}
      </section>

      {possible.length > 0 ? (
        <section aria-labelledby="possible">
          <h2 id="possible">{L("সম্ভবত সম্পর্কিত", "Possibly related")}</h2>
          <p>
            {L(
              "এগুলোর নাম কাছাকাছি, কিন্তু একই পেজ বা শপ কি না নিশ্চিত নয়। এগুলো উপরের গণনায় নেই।",
              "These have similar names, but it is not certain they are the same page or shop. They are not in the counts above.",
            )}
          </p>
          <ul data-testid="possible-cards">
            {possible.map((card) => (
              <Card
                key={card.id}
                card={card}
                collectionId={view.id}
                i18n={i18n}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="community" data-testid="community-reports">
        <h2 id="community">
          {L(
            "বিনিময় ব্যবহারকারীদের জমা দেওয়া এক্সপেরিয়েন্স",
            "Experiences submitted by Binimoy users",
          )}
        </h2>
        <p>
          {L(
            "এগুলো ব্যবহারকারীর নিজের বক্তব্য। আমরা এগুলোর সত্যতা ভেরিফাই করিনি, এবং এগুলো উপরের গণনায় নেই।",
            "These are users' own statements. We have not verified them, and they are not in the counts above.",
          )}
        </p>
        {community.length === 0 ? (
          <p>
            {L(
              "ঠিক এই নামে এখনো কোনো পাবলিশড এক্সপেরিয়েন্স নেই।",
              "There is no published experience under exactly this name yet.",
            )}
          </p>
        ) : (
          <ul>
            {community.map((report) => (
              <li key={report.id}>
                <a href={`/community/${report.id}`}>
                  {TYPE_TEXT[locale][report.experienceType]} ·{" "}
                  {L("প্রকাশ", "published")}: {date(report.publishedAt)}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p>
          <a href="/community">
            {L("আপনার নিজের এক্সপেরিয়েন্স জানান", "Share your own experience")}
          </a>
        </p>
      </section>
    </main>
  );
}
