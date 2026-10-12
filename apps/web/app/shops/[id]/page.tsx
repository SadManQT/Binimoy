import { getShop, SHOP_CATEGORIES } from "@lp/db/shops";
import { notFound } from "next/navigation";
import {
  bn,
  bnDate,
  ISSUE_TEXT,
  REVIEW_TONE,
  REVIEW_TYPE_TEXT,
} from "../../../lib/copy";
import { pool } from "../../../lib/pool";
import { ComplaintLine, Rating, TypeBar } from "../../components/shop-ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const shop = await getShop(pool(), (await params).id);
  return { title: shop ? `${shop.name} · বিনিময়` : "দোকান · বিনিময়" };
}

const FILTERS = [
  ["", "সব"],
  ["negative", "অভিযোগ"],
  ["positive", "ভালো অভিজ্ঞতা"],
] as const;

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type = "" } = await searchParams;
  // No published experience and no such shop look the same: there is no
  // public page for a name that someone merely looked up.
  const shop = await getShop(pool(), id);
  if (!shop) notFound();
  const reviews = type
    ? shop.reviews.filter((r) => r.experienceType === type)
    : shop.reviews;
  const write = `/community?subject=${encodeURIComponent(shop.name)}`;

  return (
    <main className="wide">
      <p>
        <a href="/shops">← সব দোকান</a>
      </p>
      <div className="page-head">
        <h1>{shop.name}</h1>
        <p className="meta">
          <span className="chip plain">
            {shop.category ? SHOP_CATEGORIES[shop.category].bn : "ধরন জানা নেই"}
          </span>
          <span>
            {bnDate(shop.firstPublishedAt)} থেকে {bnDate(shop.lastPublishedAt)}
          </span>
        </p>
      </div>

      <section aria-labelledby="evidence" data-testid="shop-evidence">
        <h2 id="evidence">এক নজরে যা প্রকাশিত হয়েছে</h2>
        <div className="evidence">
          <div>
            <span className="figure">{bn(shop.published)}</span>
            <span>প্রকাশিত অভিজ্ঞতা</span>
          </div>
          <div>
            <span className="figure">
              {shop.ratingAverage === null ? "নেই" : bn(shop.ratingAverage)}
            </span>
            <span>
              {shop.ratingAverage === null
                ? "কেউ রেটিং দেননি"
                : `৫-এর মধ্যে, ${bn(shop.ratingCount)}টি রেটিংয়ের গড়`}
            </span>
          </div>
          <div>
            <span className="figure">{bn(shop.complaints)}</span>
            <span>প্রকাশিত অভিযোগ</span>
          </div>
        </div>
        <TypeBar shop={shop} />
        <p>
          <ComplaintLine shop={shop} />
        </p>
        <p data-testid="not-a-verdict">
          <small>
            বিনিময় এই দোকানকে যাচাই করেনি এবং ভালো বা খারাপ বলছে না। উপরের সংখ্যাগুলো শুধু
            এখানে প্রকাশিত লেখার হিসাব। রেটিং লেখকদের নিজের দেওয়া। অল্প লেখা থাকা মানে
            দোকানটি নিরাপদ, তা নয়; অভিযোগ থাকা মানে অভিযোগটি প্রমাণিত, তাও নয়। উত্তর না
            দেওয়া মানে স্বীকার করা নয়।
          </small>
        </p>
        <div className="actions">
          <a className="button" href={write}>
            এই দোকান নিয়ে আপনার অভিজ্ঞতা লিখুন
          </a>
          <a
            className="button quiet"
            href={`/research?subject=${encodeURIComponent(shop.name)}`}
          >
            ওয়েবে আরও খুঁজুন
          </a>
        </div>
      </section>

      <nav className="filters" aria-label="লেখার ধরন">
        {FILTERS.map(([value, label]) => (
          <a
            key={value}
            href={
              value ? `/shops/${shop.id}?type=${value}` : `/shops/${shop.id}`
            }
            aria-current={type === value ? "true" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>

      {reviews.length === 0 ? (
        <p className="empty">এই ধরনের কোনো প্রকাশিত লেখা নেই।</p>
      ) : (
        <ul className="cards" data-testid="reviews">
          {reviews.map((review) => (
            <li key={review.id} data-type={review.experienceType}>
              <div className="meta">
                <span
                  className="chip"
                  data-tone={REVIEW_TONE[review.experienceType]}
                >
                  {REVIEW_TYPE_TEXT[review.experienceType]}
                </span>
                {review.rating !== null && <Rating value={review.rating} />}
                <span>প্রকাশ {bnDate(review.publishedAt)}</span>
                {review.eventDate && <span>ঘটনা {review.eventDate}</span>}
                {review.product && <span>{review.product}</span>}
              </div>
              {review.issue && (
                <p>
                  <strong>লেখকের অভিযোগ:</strong> {ISSUE_TEXT[review.issue]}{" "}
                  <small>(লেখকের দাবি, যাচাই করা হয়নি)</small>
                </p>
              )}
              <blockquote>{review.text}</blockquote>
              {review.followups.map((f) => (
                <div className="reply" key={`${f.kind}-${f.at}`}>
                  <strong>
                    {f.kind === "RESPONSE"
                      ? "উত্তর"
                      : f.kind === "RESOLUTION"
                        ? "লেখক পরে জানিয়েছেন: সমাধান হয়েছে"
                        : "লেখকের সংশোধন"}
                  </strong>{" "}
                  <small>
                    {bnDate(f.at)}
                    {f.kind === "RESPONSE"
                      ? " · যিনি লিখেছেন তিনি দোকানের পক্ষের কি না, যাচাই করা হয়নি"
                      : ""}
                  </small>
                  <p>{f.body}</p>
                </div>
              ))}
              <p>
                <a href={`/community/${review.id}`}>
                  উত্তর দিন বা পুরো লেখাটি দেখুন
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
