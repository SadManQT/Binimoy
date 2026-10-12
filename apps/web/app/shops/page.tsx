import { SHOP_CATEGORY_KEYS } from "@lp/db/community";
import { listShops, SHOP_CATEGORIES, shopCategoryCounts } from "@lp/db/shops";
import { bn, bnDate } from "../../lib/copy";
import { pool } from "../../lib/pool";
import { ComplaintLine, Rating } from "../components/shop-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "দোকান ও বিক্রেতা · বিনিময়" };

export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}) {
  const { q = "", category = "", sort = "" } = await searchParams;
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
  const filtered = Boolean(q || category);

  return (
    <main className="wide">
      <div className="page-head">
        <h1>দোকান ও বিক্রেতা</h1>
        <p>
          নাম লিখে খুঁজুন, বা ধরন বেছে নিন। প্রতিটি দোকানের পাতায় অন্যদের প্রকাশিত অভিজ্ঞতা,
          রেটিং, অভিযোগ এবং দোকানের উত্তর একসাথে দেখা যায়।
        </p>
      </div>

      <form
        method="get"
        action="/shops"
        aria-label="দোকান খুঁজুন"
        className="search"
      >
        <label>
          দোকান বা পেজের নাম
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
        <button type="submit">দোকান খুঁজুন</button>
      </form>

      <nav className="filters" aria-label="দোকানের ধরন">
        <a
          href={link({ category: "" })}
          aria-current={category ? undefined : "true"}
        >
          সব ধরন
        </a>
        {SHOP_CATEGORY_KEYS.map((key) => (
          <a
            key={key}
            href={link({ category: key })}
            aria-current={category === key ? "true" : undefined}
          >
            {SHOP_CATEGORIES[key].bn}
            <span>{bn(counts[key])}</span>
          </a>
        ))}
      </nav>

      <p className="meta" data-testid="shop-count">
        {bn(shops.length)}টি দোকান ·{" "}
        {sort === "most" ? (
          <a href={link({ sort: "" })}>সাম্প্রতিক লেখা আগে দেখান</a>
        ) : (
          <a href={link({ sort: "most" })}>বেশি লেখা আগে দেখান</a>
        )}
      </p>

      {shops.length === 0 ? (
        <div className="empty" data-testid="no-shops">
          <p>
            {filtered
              ? "এই খোঁজে কোনো দোকান পাওয়া যায়নি। এর মানে দোকানটি ভালো বা খারাপ, কোনোটাই নয়; শুধু এখানে এখনো কেউ তার সম্পর্কে প্রকাশিত অভিজ্ঞতা লেখেননি।"
              : "এখনো কোনো দোকান সম্পর্কে প্রকাশিত অভিজ্ঞতা নেই।"}
          </p>
          <div className="actions">
            <a
              className="button"
              href={
                q ? `/community?subject=${encodeURIComponent(q)}` : "/community"
              }
            >
              প্রথম অভিজ্ঞতাটি লিখুন
            </a>
            <a
              className="button quiet"
              href={
                q ? `/research?subject=${encodeURIComponent(q)}` : "/research"
              }
            >
              ওয়েবে খুঁজে দেখুন
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
                    ? SHOP_CATEGORIES[shop.category].bn
                    : "ধরন জানা নেই"}
                </span>
                <span>{bn(shop.published)}টি প্রকাশিত অভিজ্ঞতা</span>
                {shop.ratingAverage !== null && (
                  <span>
                    <Rating value={shop.ratingAverage} /> (
                    {bn(shop.ratingCount)}টি রেটিং)
                  </span>
                )}
                <span>সর্বশেষ {bnDate(shop.lastPublishedAt)}</span>
              </div>
              <div>
                <ComplaintLine shop={shop} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p>
        <small>
          এই তালিকা কোনো সুপারিশ নয়, এবং রেটিং অনুযায়ী সাজানো নয়। রেটিং হলো লেখকদের
          নিজের দেওয়া নম্বরের গড়, বিনিময়ের মূল্যায়ন নয়। তালিকায় না থাকা মানে শুধু এই যে এখানে
          এখনো কিছু প্রকাশ হয়নি।
        </small>
      </p>
    </main>
  );
}
