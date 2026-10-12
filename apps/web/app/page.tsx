import { SHOP_CATEGORY_KEYS } from "@lp/db/community";
import {
  directoryStats,
  listAlerts,
  listShops,
  shopCategoryCounts,
} from "@lp/db/shops";
import { ArrowRight, Warning } from "@phosphor-icons/react/dist/ssr";
import { fill, getI18n } from "../lib/i18n";
import { pool } from "../lib/pool";
import { CategoryIcon } from "./components/category-icon";
import { HeroScene } from "./components/hero-scene";
import { ComplaintLine, Rating } from "./components/shop-ui";

export const dynamic = "force-dynamic";

// The front page leads with what people come for: check a shop, read what
// others published, see recent reports. Everything listed is real published
// data; when there is none, the page says so.
export default async function Home() {
  const i18n = await getI18n();
  const { t, num, date } = i18n;
  const [alerts, counts, recent, stats] = await Promise.all([
    listAlerts(pool(), { limit: 3 }),
    shopCategoryCounts(pool()),
    listShops(pool()),
    directoryStats(pool()),
  ]);
  const features = [
    { key: "check", href: "/shops", copy: t.home.features.check },
    {
      key: "alerts",
      href: "/alerts",
      copy: t.home.features.alerts,
      tone: "alert",
    },
    { key: "reviews", href: "/community", copy: t.home.features.review },
    {
      key: "report",
      href: "/community?type=negative",
      copy: t.home.features.report,
    },
    { key: "deal", href: "/deals", copy: t.home.features.deal },
    { key: "lookup", href: "/research", copy: t.home.features.lookup },
  ];

  return (
    <main className="bleed">
      <div className="hero-wrap">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              {t.home.title} <em>{t.home.titleMark}</em>
            </h1>
            <p>{t.home.sub}</p>
            <form className="hero-search" method="get" action="/shops">
              <label htmlFor="hero-q">{t.home.searchLabel}</label>
              <div>
                <input
                  id="hero-q"
                  name="q"
                  type="search"
                  maxLength={120}
                  autoComplete="off"
                />
                <button type="submit">{t.home.search}</button>
              </div>
            </form>
            <a className="more" href="/alerts">
              <Warning size={18} aria-hidden="true" />
              {t.home.seeAlerts}
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="hero-visual">
            <HeroScene poster="/img/hero.webp" alt={t.home.sceneAlt} />
          </div>
        </section>
        {stats.reviews > 0 && (
          <ul className="stats" data-testid="stats">
            <li>
              <strong>{num(stats.shops)}</strong>
              {t.home.statShops}
            </li>
            <li>
              <strong>{num(stats.reviews)}</strong>
              {t.home.statReviews}
            </li>
            <li>
              <strong>{num(stats.reports)}</strong>
              {t.home.statReports}
            </li>
          </ul>
        )}
      </div>

      <section className="sec" aria-labelledby="features-title">
        <h2 id="features-title">{t.home.featuresTitle}</h2>
        <ul className="features" data-testid="features">
          {features.map((feature) => (
            <li key={feature.key} data-tone={feature.tone}>
              <a href={feature.href}>
                <div>
                  <h3>{feature.copy.title}</h3>
                  <p>{feature.copy.body}</p>
                </div>
                {/* biome-ignore lint/performance/noImgElement: small fixed local files */}
                <img
                  src={`/img/features/${feature.key}.webp`}
                  alt=""
                  width={560}
                  height={560}
                  loading="lazy"
                  decoding="async"
                />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="sec" aria-labelledby="alerts-title">
        <div className="sec-head">
          <h2 id="alerts-title">{t.home.alertsTitle}</h2>
          <a className="more" href="/alerts">
            {t.home.allAlerts}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        {alerts.notes.slice(0, 1).map((note) => (
          <p className="notice" key={note.id}>
            <strong>{note.title}.</strong> {note.body}
          </p>
        ))}
        {alerts.reports.length === 0 ? (
          <p className="empty" data-testid="home-no-alerts">
            {t.home.noAlerts}
          </p>
        ) : (
          <ul className="reports" data-testid="home-alerts">
            {alerts.reports.map((report) => (
              <li key={report.id}>
                <div className="who">
                  <Warning size={20} weight="fill" aria-hidden="true" />
                  <a className="title" href={`/shops/${report.shopId}`}>
                    {report.shopName}
                  </a>
                </div>
                <p>
                  <strong>
                    {t.shop.claim} {t.issues[report.issue ?? "other"]}
                  </strong>
                  <br />
                  <small>{t.shop.unverified}</small>
                </p>
                <blockquote>{report.text}</blockquote>
                <div className="meta">
                  <span>{date(report.publishedAt)}</span>
                  <span>
                    {report.answered ? t.alerts.answered : t.alerts.unanswered}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p>
          <small>{t.alerts.note}</small>
        </p>
      </section>

      <section className="sec" aria-labelledby="cats-title">
        <div className="sec-head">
          <h2 id="cats-title">{t.home.categoriesTitle}</h2>
          <a className="more" href="/shops">
            {t.home.allShops}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <ul className="cats" data-testid="categories">
          {SHOP_CATEGORY_KEYS.map((key) => (
            <li key={key}>
              <a href={`/shops?category=${key}`}>
                <span className="icon">
                  <CategoryIcon category={key} />
                </span>
                <strong>{t.categories[key]}</strong>
                <span>
                  {counts[key] > 0
                    ? fill(t.home.shopCount, { n: num(counts[key]) })
                    : t.home.noShopsYet}
                </span>
              </a>
            </li>
          ))}
        </ul>
        {recent.length > 0 && (
          <>
            <h3>{t.home.recentTitle}</h3>
            <ul className="rows" data-testid="home-shops">
              {recent.slice(0, 4).map((shop) => (
                <li key={shop.id}>
                  <a className="title" href={`/shops/${shop.id}`}>
                    {shop.name}
                  </a>
                  <div className="meta">
                    <span>
                      {fill(t.shops.reviews, { n: num(shop.published) })}
                    </span>
                    {shop.ratingAverage !== null && (
                      <Rating value={shop.ratingAverage} i18n={i18n} />
                    )}
                    <ComplaintLine shop={shop} i18n={i18n} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="sec" aria-labelledby="how-title">
        <div className="sec-head">
          <h2 id="how-title">{t.home.howTitle}</h2>
          <a className="button" href="/community">
            {t.nav.write}
          </a>
        </div>
        <ol className="flow">
          {t.home.how.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="sec" aria-labelledby="deal-title">
        <div className="deal-band">
          <div>
            <h2 id="deal-title">{t.home.dealTitle}</h2>
            <p>{t.home.dealBody}</p>
            <ol>
              {t.home.dealSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <a className="button quiet" href="/deals/new">
              {t.home.dealCta}
            </a>
          </div>
          {/* biome-ignore lint/performance/noImgElement: a small fixed local file */}
          <img
            src="/img/features/deal.webp"
            alt=""
            width={560}
            height={560}
            loading="lazy"
            decoding="async"
          />
        </div>
      </section>

      <section className="sec" aria-labelledby="limits-title">
        <h2 id="limits-title">{t.home.limitsTitle}</h2>
        <ul className="limits">
          {t.home.limits.map((limit) => (
            <li key={limit.title}>
              <strong>{limit.title}</strong>
              <span>{limit.body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sec closing" aria-labelledby="closing-title">
        <h2 id="closing-title">{t.home.closingTitle}</h2>
        <a className="button" href="/shops">
          {t.home.search}
        </a>
      </section>
    </main>
  );
}
