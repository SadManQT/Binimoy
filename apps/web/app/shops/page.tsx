import { SHOP_CATEGORY_KEYS } from "@lp/db/community";
import { listShops, shopCategoryCounts } from "@lp/db/shops";
import { fill, getI18n } from "../../lib/i18n";
import { pool } from "../../lib/pool";
import { CategoryIcon } from "../components/category-icon";
import { ComplaintLine, Rating, TrustBadge } from "../components/shop-ui";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t.shops.title} · ${t.brand}` };
}

export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}) {
  const { q = "", category = "", sort = "" } = await searchParams;
  const i18n = await getI18n();
  const { t, num, date } = i18n;
  const [shops, counts] = await Promise.all([
    listShops(pool(), { q, category, sort }),
    shopCategoryCounts(pool()),
  ]);
  const link = (next: { category?: string; sort?: string }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const c = next.category ?? category;
    const s = next.sort ?? sort;
    if (c) params.set("category", c);
    if (s) params.set("sort", s);
    const query = params.toString();
    return query ? `/shops?${query}` : "/shops";
  };
  const encoded = encodeURIComponent(q);

  return (
    <main className="wide">
      <div className="page-head">
        <h1>{t.shops.title}</h1>
        <p>{t.shops.sub}</p>
      </div>

      <form
        method="get"
        action="/shops"
        aria-label={t.home.search}
        className="search"
      >
        <label>
          {t.home.searchLabel}
          <input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            autoComplete="off"
          />
        </label>
        {category && <input type="hidden" name="category" value={category} />}
        {sort && <input type="hidden" name="sort" value={sort} />}
        <button type="submit">{t.home.search}</button>
      </form>

      <nav className="filters" aria-label={t.home.categoriesTitle}>
        <a
          href={link({ category: "" })}
          aria-current={category ? undefined : "true"}
        >
          {t.shops.allCategories}
        </a>
        {SHOP_CATEGORY_KEYS.map((key) => (
          <a
            key={key}
            href={link({ category: key })}
            aria-current={category === key ? "true" : undefined}
          >
            <CategoryIcon category={key} size={18} />
            {t.categories[key]}
            <span>{num(counts[key])}</span>
          </a>
        ))}
      </nav>

      <p className="meta" data-testid="shop-count">
        <span>{fill(t.shops.count, { n: num(shops.length) })}</span>
        {(
          [
            ["", t.shops.sortRecent],
            ["most", t.shops.sortMost],
            ["trust", t.trust.sort],
          ] as const
        )
          .filter(([value]) => value !== sort)
          .map(([value, label]) => (
            <a key={value} href={link({ sort: value })}>
              {label}
            </a>
          ))}
      </p>

      {shops.length === 0 ? (
        <div className="empty" data-testid="no-shops">
          <p>{q || category ? t.shops.noneFound : t.shops.noneYet}</p>
          <div className="actions">
            <a
              className="button"
              href={q ? `/community?subject=${encoded}` : "/community"}
            >
              {t.shops.writeFirst}
            </a>
            <a
              className="button quiet"
              href={q ? `/research?subject=${encoded}` : "/research"}
            >
              {t.shops.searchWeb}
            </a>
          </div>
        </div>
      ) : (
        <ul className="rows" data-testid="shops">
          {shops.map((shop) => (
            <li key={shop.id}>
              <a className="title" href={`/shops/${shop.id}`}>
                {shop.name}
              </a>
              <div className="meta">
                <span>
                  {shop.category
                    ? t.categories[shop.category]
                    : t.shops.unknownCategory}
                </span>
                <span>{fill(t.shops.reviews, { n: num(shop.published) })}</span>
                {shop.ratingAverage !== null && (
                  <span>
                    <Rating value={shop.ratingAverage} i18n={i18n} /> (
                    {fill(t.shops.ratings, { n: num(shop.ratingCount) })})
                  </span>
                )}
                <span>
                  {fill(t.shops.latest, { date: date(shop.lastPublishedAt) })}
                </span>
              </div>
              <div className="meta">
                <TrustBadge shop={shop} i18n={i18n} />
                <ComplaintLine shop={shop} i18n={i18n} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p>
        <small>{t.shops.disclaimer}</small>
      </p>
    </main>
  );
}
