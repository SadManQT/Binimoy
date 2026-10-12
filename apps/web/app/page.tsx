import { SHOP_CATEGORY_KEYS } from "@lp/db/community";
import {
  listAlerts,
  listShops,
  SHOP_CATEGORIES,
  shopCategoryCounts,
} from "@lp/db/shops";
import { bn, bnDate, ISSUE_TEXT } from "../lib/copy";
import { pool } from "../lib/pool";
import { ComplaintLine, Rating } from "./components/shop-ui";
import { VaultScene } from "./components/vault-scene";

export const dynamic = "force-dynamic";

const POSTER = "/img/sinduk.webp";

// The front page leads with what people come for: find a shop, read what
// others published about it, see recent complaints. Everything listed is
// real published data; when there is none, the page says so.
export default async function Home() {
  const [alerts, counts, recent] = await Promise.all([
    listAlerts(pool(), { limit: 3 }),
    shopCategoryCounts(pool()),
    listShops(pool()),
  ]);

  return (
    <main className="bleed">
      <section className="stage" aria-labelledby="hero-title">
        <div className="hero">
          <h1 id="hero-title">
            টাকা পাঠানোর আগে দোকানটা <em>চিনে নিন</em>
          </h1>
          <p>
            অন্যরা কী অভিজ্ঞতা লিখেছেন, কী অভিযোগ প্রকাশিত হয়েছে, দোকান কী উত্তর দিয়েছে:
            এক জায়গায় দেখুন।
          </p>
          <form
            className="search"
            method="get"
            action="/shops"
            aria-label="দোকান খুঁজুন"
          >
            <label>
              দোকান বা পেজের নাম
              <input
                name="q"
                type="search"
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <button type="submit">দোকান খুঁজুন</button>
          </form>
          <p className="meta">
            <a href="/alerts">সর্বশেষ সতর্কতা</a>
            <a href="/community">নিজের অভিজ্ঞতা লিখুন</a>
          </p>
        </div>
        <div className="stage-visual">
          <VaultScene poster={POSTER} />
        </div>
      </section>

      <section className="band" aria-labelledby="alerts-title">
        <div>
          <div className="band-head">
            <h2 id="alerts-title">সম্প্রতি প্রকাশিত অভিযোগ</h2>
            <a href="/alerts">সব সতর্কতা</a>
          </div>
          {alerts.notes.slice(0, 1).map((note) => (
            <p className="notice" key={note.id}>
              <strong>{note.title}.</strong> {note.body}
            </p>
          ))}
          {alerts.reports.length === 0 ? (
            <p className="empty" data-testid="home-no-alerts">
              এখন কোনো প্রকাশিত অভিযোগ নেই। এর মানে কোনো সমস্যা ঘটেনি, তা নয়; শুধু এখানে
              এখনো কিছু প্রকাশ হয়নি।
            </p>
          ) : (
            <ul className="cards alert-row" data-testid="home-alerts">
              {alerts.reports.map((report) => (
                <li key={report.id} data-type="negative">
                  <a className="title" href={`/shops/${report.shopId}`}>
                    {report.shopName}
                  </a>
                  <p>
                    <strong>{ISSUE_TEXT[report.issue ?? "other"]}</strong>{" "}
                    <small>(লেখকের দাবি, যাচাই করা হয়নি)</small>
                  </p>
                  <blockquote>{report.text}</blockquote>
                  <div className="meta">
                    <span>{bnDate(report.publishedAt)}</span>
                    <span>
                      {report.answered ? "উত্তর দেওয়া হয়েছে" : "এখনো উত্তর নেই"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p>
            <small>
              অভিযোগ মানে লেখকের নিজের দাবি। মডারেটর প্রকাশের নিয়ম মিলিয়ে দেখেন; ঘটনা
              সত্য কি না, বিনিময় তদন্ত করে না। দোকান উত্তর দিতে পারে।
            </small>
          </p>
        </div>
      </section>

      <section className="band" aria-labelledby="catalog-title">
        <div>
          <h2 id="catalog-title">ধরন অনুযায়ী দোকান</h2>
          <ul className="catalog">
            {SHOP_CATEGORY_KEYS.map((key) => (
              <li key={key}>
                <a href={`/shops?category=${key}`}>
                  <strong>{SHOP_CATEGORIES[key].bn}</strong>
                  <span>
                    {counts[key] > 0
                      ? `${bn(counts[key])}টি দোকান সম্পর্কে লেখা আছে`
                      : "এখনো কিছু লেখা হয়নি"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {recent.length > 0 && (
            <>
              <h3>সম্প্রতি যাদের নিয়ে লেখা হয়েছে</h3>
              <ul className="rows" data-testid="home-shops">
                {recent.slice(0, 4).map((shop) => (
                  <li key={shop.id}>
                    <a className="title" href={`/shops/${shop.id}`}>
                      {shop.name}
                    </a>
                    <div className="meta">
                      <span>{bn(shop.published)}টি প্রকাশিত অভিজ্ঞতা</span>
                      {shop.ratingAverage !== null && (
                        <Rating value={shop.ratingAverage} />
                      )}
                      <ComplaintLine shop={shop} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section className="band" aria-labelledby="write-title">
        <div className="split">
          <div className="stack">
            <h2 id="write-title">আপনার অভিজ্ঞতা অন্যের কাজে লাগে</h2>
            <p>
              ভালো হোক বা খারাপ, যা ঘটেছে লিখুন এবং ১ থেকে ৫-এর মধ্যে নিজের রেটিং দিন।
              আপনার নাম প্রকাশ হয় না।
            </p>
            <div className="actions">
              <a className="button" href="/community">
                অভিজ্ঞতা লিখুন
              </a>
            </div>
          </div>
          <ol className="steps">
            <li data-step="now">
              খসড়া শুধু আপনি দেখেন। ফোন নম্বর, লেনদেন নম্বর ব্যক্তিগত অংশে থাকে।
            </li>
            <li data-step="now">প্রকাশের লেখাটি আপনি নিজে পড়ে অনুমোদন দেন।</li>
            <li data-step="now">
              একজন মডারেটর দেখেন লেখাটি নিয়ম মানে কি না। তারপর প্রকাশ হয়।
            </li>
            <li data-step="now">
              দোকান উত্তর দিতে পারে; সমাধান হলে আপনি তা যোগ করতে পারেন। আগের লেখা মোছা হয়
              না।
            </li>
          </ol>
        </div>
      </section>

      <section className="band" aria-labelledby="deal-title">
        <div className="stage" data-pinned="true">
          <div>
            <h2 id="deal-title">কিনতে চাইলে: ধাপে ধাপে যাচাই করে লেনদেন</h2>
            <ol className="story" id="deal-story">
              <li>
                <h3>শর্ত লিখে দুই পক্ষ সম্মত হন</h3>
                <p>
                  কী দেওয়া হবে, কীভাবে পরীক্ষা হবে, কখন টাকা ফেরত: সব লেখা থাকে। দুজন ঠিক
                  একই লেখায় সম্মতি দিলে তবেই শুরু।
                </p>
              </li>
              <li>
                <h3>টাকা আটকে থাকে</h3>
                <p>
                  বিক্রেতা “দিয়েছি” বললেই টাকা ছাড়ে না। এই সংস্করণে টাকাটি নকল; আসল টাকা
                  এখানে রাখা যায় না।
                </p>
              </li>
              <li>
                <h3>গোপন জিনিস যায় ভল্টে</h3>
                <p>
                  কি, কোড বা লগইন তথ্য ক্রেতার ব্রাউজারেই খোলে। সার্ভার, মডারেটর বা এআই তা
                  পড়তে পারে না।
                </p>
              </li>
              <li>
                <h3>মিলিয়ে দেখে তবেই ছাড়</h3>
                <p>
                  প্রতিটি শর্ত আলাদা করে পাস, ব্যর্থ বা “যাচাই করা যায়নি” হয়। সমস্যা হলে বিরোধ
                  খুললে টাকা আটকে থাকে।
                </p>
              </li>
            </ol>
            <div className="actions">
              <a className="button quiet" href="/deals/new">
                একটি ডিল শুরু করুন
              </a>
            </div>
          </div>
          <div className="stage-visual">
            <VaultScene poster={POSTER} story="deal-story" />
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="limits-title">
        <div>
          <h2 id="limits-title">যা আমরা দাবি করি না</h2>
          <ul className="limits">
            <li>
              <strong>আমরা কাউকে প্রতারক বা নির্ভরযোগ্য বলি না।</strong>
              <span>আমরা দেখাই কে কী লিখেছেন এবং তার উত্তর কী। সিদ্ধান্ত আপনার।</span>
            </li>
            <li>
              <strong>রেটিং আমাদের নয়।</strong>
              <span>
                এটি লেখকদের নিজের দেওয়া নম্বরের গড়, এবং দোকান রেটিং দিয়ে সাজানো হয় না।
              </span>
            </li>
            <li>
              <strong>অভিযোগ মানে প্রমাণ নয়।</strong>
              <span>
                প্রতিটি অভিযোগ একজনের দাবি। দোকান উত্তর না দিলে সেটি স্বীকার করা নয়।
              </span>
            </li>
            <li>
              <strong>লেখা না থাকা মানে নিরাপদ নয়।</strong>
              <span>নতুন বা অচেনা দোকান নিয়ে এখানে কিছু না-ও থাকতে পারে।</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="band closing">
        <div>
          <h2>টাকা পাঠানোর আগে এক মিনিট</h2>
          <div className="actions">
            <a className="button" href="/shops">
              দোকান খুঁজুন
            </a>
            <a className="button quiet" href="/alerts">
              সতর্কতা দেখুন
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
