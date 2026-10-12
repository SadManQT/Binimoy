import { SHOP_CATEGORY_KEYS } from "@lp/db/community";
import { listAlerts } from "@lp/db/shops";
import { Warning } from "@phosphor-icons/react/dist/ssr";
import { getI18n } from "../../lib/i18n";
import { pool } from "../../lib/pool";
import { CategoryIcon } from "../components/category-icon";
import { Mini3D } from "../components/mini-3d";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t.alerts.title} · ${t.brand}` };
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category = "" } = await searchParams;
  const { t, date } = await getI18n();
  const { reports, notes } = await listAlerts(pool(), { limit: 60, category });

  return (
    <main className="wide">
      <div className="page-head with-3d">
        <div>
          <h1>{t.alerts.title}</h1>
          <p>{t.alerts.sub}</p>
        </div>
        <Mini3D kind="alert" />
      </div>
      <p className="notice" data-testid="allegation-note">
        {t.alerts.note}
      </p>

      {notes.length > 0 && (
        <section aria-labelledby="notes" data-testid="safety-notes">
          <h2 id="notes">{t.alerts.notesTitle}</h2>
          <ul className="notes">
            {notes.map((note) => (
              <li key={note.id}>
                <h3>{note.title}</h3>
                <p>{note.body}</p>
                <small>{date(note.publishedAt)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="filters" aria-label={t.home.categoriesTitle}>
        <a href="/alerts" aria-current={category ? undefined : "true"}>
          {t.shops.allCategories}
        </a>
        {SHOP_CATEGORY_KEYS.map((key) => (
          <a
            key={key}
            href={`/alerts?category=${key}`}
            aria-current={category === key ? "true" : undefined}
          >
            <CategoryIcon category={key} size={18} />
            {t.categories[key]}
          </a>
        ))}
      </nav>

      {reports.length === 0 ? (
        <div className="empty" data-testid="no-alerts">
          <p>{t.alerts.none}</p>
          <a className="button" href="/community?type=negative">
            {t.alerts.report}
          </a>
        </div>
      ) : (
        <ul className="reports" data-testid="alerts">
          {reports.map((report) => (
            <li key={report.id} data-tilt>
              <div className="who">
                <Warning size={20} weight="fill" aria-hidden="true" />
                <a className="title" href={`/shops/${report.shopId}`}>
                  {report.shopName}
                </a>
              </div>
              <div className="meta">
                <span>
                  {report.shopCategory
                    ? t.categories[report.shopCategory]
                    : t.shops.unknownCategory}
                </span>
                <span>{date(report.publishedAt)}</span>
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
                <span className="chip plain">
                  {report.answered ? t.alerts.answered : t.alerts.unanswered}
                </span>
                {report.resolved && (
                  <span className="chip" data-tone="ok">
                    {t.alerts.resolved}
                  </span>
                )}
                <a href={`/community/${report.id}`}>{t.alerts.open}</a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <a className="button" href="/community?type=negative">
          {t.alerts.report}
        </a>
        <a className="button quiet" href="/shops">
          {t.home.search}
        </a>
      </div>
    </main>
  );
}
