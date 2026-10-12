import { getShop, listShops } from "@lp/db/shops";
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

// Two shops, the same facts for each, side by side (spec C36.4). It shows
// how much was written about each, so a quiet shop is not read as a good one.
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a = "", b = "" } = await searchParams;
  const i18n = await getI18n();
  const { t, num, date } = i18n;
  const [first, second, all] = await Promise.all([
    getShop(pool(), a),
    getShop(pool(), b),
    listShops(pool(), { sort: "most" }),
  ]);
  const others = all.filter((shop) => shop.id !== first?.id);
  const shown = [first, second].filter((shop) => shop !== null);

  return (
    <main className="wide">
      <p>
        <a href="/shops">← {t.shop.back}</a>
      </p>
      <div className="page-head">
        <h1>{t.compare.title}</h1>
        <p>{t.compare.sub}</p>
      </div>

      <form method="get" className="search">
        {first ? (
          <input type="hidden" name="a" value={first.id} />
        ) : (
          <label>
            {t.home.searchLabel}
            <select name="a" required defaultValue="">
              <option value="" disabled>
                {t.compare.pick}
              </option>
              {all.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t.compare.pick}
          <select name="b" required defaultValue={second?.id ?? ""}>
            <option value="" disabled>
              {t.compare.pick}
            </option>
            {others.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{t.compare.show}</button>
      </form>
      {others.length === 0 && <p className="empty">{t.compare.none}</p>}

      <div className="versus" data-testid="versus">
        {shown.map((shop) => (
          <section key={shop.id} aria-label={shop.name}>
            <Mini3D
              kind="gauge"
              value={shop.trust.score}
              className="mini3d dial"
            />
            <h2>{shop.name}</h2>
            <p className="meta">
              <TrustBadge shop={shop} i18n={i18n} />
              <ComplaintLine shop={shop} i18n={i18n} />
            </p>
            <div className="evidence">
              <div>
                <span className="figure">{num(shop.published)}</span>
                <span>{t.shop.reviews}</span>
              </div>
              <div>
                <span className="figure">{num(shop.complaints)}</span>
                <span>{t.shop.reports}</span>
              </div>
            </div>
            {shop.ratingAverage !== null && (
              <p>
                <Rating value={shop.ratingAverage} i18n={i18n} /> (
                {fill(t.shops.ratings, { n: num(shop.ratingCount) })})
              </p>
            )}
            <TypeBar shop={shop} i18n={i18n} />
            <ul>
              {shop.trust.reasons.map((reason) => (
                <li key={reason}>{t.trust.reasons[reason]}</li>
              ))}
            </ul>
            <p>
              <small>
                {date(shop.firstPublishedAt)} - {date(shop.lastPublishedAt)}
              </small>
            </p>
            <a href={`/shops/${shop.id}`}>{t.compare.open}</a>
          </section>
        ))}
      </div>
      <p>
        <small>{t.trust.how}</small>
      </p>
    </main>
  );
}
