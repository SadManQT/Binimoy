import { getShop } from "@lp/db/shops";
import { reviewHighlights } from "@lp/domain";
import { notFound } from "next/navigation";
import { REVIEW_TONE } from "../../../lib/copy";
import { fill, getI18n } from "../../../lib/i18n";
import { pool } from "../../../lib/pool";
import { Mini3D } from "../../components/mini-3d";
import {
  ComplaintLine,
  Rating,
  TrustBadge,
  TypeBar,
} from "../../components/shop-ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ t }, shop] = await Promise.all([
    getI18n(),
    getShop(pool(), (await params).id),
  ]);
  return { title: `${shop ? shop.name : t.shops.title} · ${t.brand}` };
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type = "" } = await searchParams;
  const i18n = await getI18n();
  const { t, num, date } = i18n;
  // No published review and no such shop look the same: there is no public
  // page for a name that someone merely looked up.
  const shop = await getShop(pool(), id);
  if (!shop) notFound();
  const reviews = type
    ? shop.reviews.filter((r) => r.experienceType === type)
    : shop.reviews;
  const name = encodeURIComponent(shop.name);
  const highlights = reviewHighlights(shop.reviews.map((r) => r.text));
  const filters = [
    ["", t.shop.filterAll],
    ["negative", t.shop.filterBad],
    ["positive", t.shop.filterGood],
  ] as const;

  return (
    <main className="wide">
      <p>
        <a href="/shops">← {t.shop.back}</a>
      </p>
      <div className="page-head">
        <h1>{shop.name}</h1>
        <p className="meta">
          <span className="chip plain">
            {shop.category
              ? t.categories[shop.category]
              : t.shops.unknownCategory}
          </span>
          <span>
            {date(shop.firstPublishedAt)} - {date(shop.lastPublishedAt)}
          </span>
        </p>
      </div>

      <section aria-labelledby="evidence" data-testid="shop-evidence">
        <h2 id="evidence">{t.shop.glance}</h2>
        <div className="evidence">
          <div>
            <span className="figure">{num(shop.published)}</span>
            <span>{t.shop.reviews}</span>
          </div>
          <div>
            <span className="figure">
              {shop.ratingAverage === null
                ? t.shop.noRating
                : num(shop.ratingAverage)}
            </span>
            <span>
              {shop.ratingAverage === null
                ? t.shop.noRatingNote
                : fill(t.shop.ratingNote, { n: num(shop.ratingCount) })}
            </span>
          </div>
          <div>
            <span className="figure">{num(shop.complaints)}</span>
            <span>{t.shop.reports}</span>
          </div>
        </div>
        <div className="trust-panel" data-testid="trust-panel">
          <Mini3D
            kind="gauge"
            value={shop.trust.score}
            className="mini3d dial"
          />
          <h3>{t.trust.title}</h3>
          <p className="meta">
            <TrustBadge shop={shop} i18n={i18n} />
            {shop.trust.score !== null && <span>{t.trust.outOf}</span>}
          </p>
          <ul>
            {shop.trust.reasons.map((reason) => (
              <li key={reason}>{t.trust.reasons[reason]}</li>
            ))}
          </ul>
          <p>
            <small>{t.trust.how}</small>
          </p>
        </div>
        <TypeBar shop={shop} i18n={i18n} />
        {highlights.length > 0 && (
          <div className="highlights" data-testid="highlights">
            <h3>{t.shop.highlights}</h3>
            <ul>
              {highlights.map((h) => (
                <li key={h.term}>
                  {h.term} <span>{num(h.reviews)}</span>
                </li>
              ))}
            </ul>
            <small>{t.shop.highlightsNote}</small>
          </div>
        )}
        <p>
          <ComplaintLine shop={shop} i18n={i18n} />
        </p>
        <p data-testid="not-a-verdict">
          <small>{t.shop.notVerdict}</small>
        </p>
        <div className="actions">
          <a className="button" href={`/community?subject=${name}`}>
            {t.shop.write}
          </a>
          <a className="button quiet" href={`/research?subject=${name}`}>
            {t.shop.searchWeb}
          </a>
          <a className="button quiet" href={`/shops/compare?a=${shop.id}`}>
            {t.compare.cta}
          </a>
        </div>
      </section>

      <nav className="filters" aria-label={t.shop.reviews}>
        {filters.map(([value, label]) => (
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
        <p className="empty">{t.shop.none}</p>
      ) : (
        <ul className="cards" data-testid="reviews">
          {reviews.map((review) => (
            <li key={review.id} data-type={review.experienceType}>
              <div className="meta">
                <span
                  className="chip"
                  data-tone={REVIEW_TONE[review.experienceType]}
                >
                  {t.types[review.experienceType]}
                </span>
                {review.rating !== null && (
                  <Rating value={review.rating} i18n={i18n} />
                )}
                <span>
                  {fill(t.shop.published, { date: date(review.publishedAt) })}
                </span>
                {review.eventDate && (
                  <span>
                    {fill(t.shop.happened, { date: review.eventDate })}
                  </span>
                )}
                {review.product && <span>{review.product}</span>}
              </div>
              {review.issue && (
                <p>
                  <strong>
                    {t.shop.claim} {t.issues[review.issue]}
                  </strong>{" "}
                  <small>({t.shop.unverified})</small>
                </p>
              )}
              <blockquote>{review.text}</blockquote>
              {review.followups.map((f) => (
                <div className="reply" key={`${f.kind}-${f.at}`}>
                  <strong>
                    {f.kind === "RESPONSE"
                      ? t.shop.reply
                      : f.kind === "RESOLUTION"
                        ? t.shop.resolution
                        : t.shop.correction}
                  </strong>{" "}
                  <small>
                    {date(f.at)}
                    {f.kind === "RESPONSE" ? `, ${t.shop.replyNote}` : ""}
                  </small>
                  <p>{f.body}</p>
                </div>
              ))}
              <p>
                <a href={`/community/${review.id}`}>{t.shop.open}</a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
