import type { ErrorCode } from "@lp/contracts";
import {
  type ExperienceType,
  type FollowupKind,
  hasIdentifier,
  type Issue,
  isModerator,
  SHOP_CATEGORY_KEYS,
  type ShopCategory,
} from "./community";
import type { Pool } from "./index";

// The public face of community reports: a directory of shops, one profile
// per shop, and a feed of published complaints (ADR-009).
//
// Everything here reads PUBLISHED material only, and returns public fields
// only: never the private original, the author, or an amount. A shop exists
// in the directory because someone's experience of it was published, never
// because someone looked it up (D.9: lookups are private).
//
// What this file deliberately does not do (spec C7.1, C36.4, D.10): compute a
// trust score, label a shop safe or a scam, or rank shops by rating. It
// counts what people wrote and whether it was answered.

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export const SHOP_CATEGORIES: Record<ShopCategory, { bn: string; en: string }> =
  {
    game_topup: { bn: "গেম টপ-আপ", en: "Game top-ups" },
    game_accounts: { bn: "গেম অ্যাকাউন্ট", en: "Game accounts" },
    software: { bn: "সফটওয়্যার ও লাইসেন্স", en: "Software and licenses" },
    subscriptions: { bn: "সাবস্ক্রিপশন", en: "Subscriptions" },
    gift_cards: { bn: "গিফট কার্ড", en: "Gift cards" },
    digital_services: { bn: "ডিজিটাল সেবা", en: "Digital services" },
    courses: { bn: "কোর্স", en: "Courses" },
    domains_hosting: { bn: "ডোমেইন ও হোস্টিং", en: "Domains and hosting" },
    social_accounts: {
      bn: "পেজ ও সোশ্যাল অ্যাকাউন্ট",
      en: "Pages and social accounts",
    },
    other: { bn: "অন্যান্য", en: "Other" },
  };

// Per shop, over its published reports. "Answered" and "resolved" count
// complaints with a published reply, or a published resolution by the
// complaint's own author.
const SUMMARY = `
  count(*)::int as published,
  count(*) filter (where r.experience_type = 'positive')::int as positive,
  count(*) filter (where r.experience_type = 'negative')::int as negative,
  count(*) filter (where r.experience_type = 'mixed')::int as mixed,
  count(*) filter (where r.experience_type = 'neutral')::int as neutral,
  count(*) filter (where r.experience_type = 'negative' and exists (
    select 1 from community_followup f where f.report_id = r.id
      and f.status = 'PUBLISHED' and f.kind = 'RESPONSE'))::int as answered,
  count(*) filter (where r.experience_type = 'negative' and exists (
    select 1 from community_followup f where f.report_id = r.id
      and f.status = 'PUBLISHED' and f.kind = 'RESOLUTION'))::int as resolved,
  count(r.rating)::int as rating_count,
  round(avg(r.rating), 1)::float8 as rating_average,
  min(r.published_at) as first_at,
  max(r.published_at) as last_at`;

export type ShopSummary = {
  id: string;
  name: string;
  category: ShopCategory | null;
  published: number;
  counts: Record<ExperienceType, number>;
  complaints: number;
  complaintsAnswered: number;
  complaintsResolved: number;
  // The mean of the reviewers' own ratings. Not an assessment by Binimoy.
  ratingCount: number;
  ratingAverage: number | null;
  firstPublishedAt: string;
  lastPublishedAt: string;
};

// biome-ignore lint/suspicious/noExplicitAny: one database row
const summary = (row: any): ShopSummary => ({
  id: row.id,
  name: row.display_name,
  category: row.category,
  published: row.published,
  counts: {
    positive: row.positive,
    negative: row.negative,
    mixed: row.mixed,
    neutral: row.neutral,
  },
  complaints: row.negative,
  complaintsAnswered: row.answered,
  complaintsResolved: row.resolved,
  ratingCount: row.rating_count,
  ratingAverage: row.rating_average,
  firstPublishedAt: (row.first_at as Date).toISOString(),
  lastPublishedAt: (row.last_at as Date).toISOString(),
});

// `sort` is by recency or by how much has been written. There is no order by
// rating: a list that put "better" shops first would be a ranking (C36.4).
export async function listShops(
  pool: Pool,
  input: { q?: string; category?: string; sort?: string } = {},
): Promise<ShopSummary[]> {
  const q = (input.q ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const { rows } = await pool.query(
    `select s.id, s.display_name, s.category, ${SUMMARY}
     from subject s
     join community_report r on r.subject_id = s.id and r.state = 'PUBLISHED'
     where ($1 = '' or s.normalized_key like '%' || $1 || '%' escape '\\')
       and ($2 = '' or s.category = $2)
     group by s.id
     order by (case when $3 = 'most' then count(*) end) desc nulls last,
              max(r.published_at) desc, s.display_name
     limit 60`,
    [
      // A typed % or _ is a character to find, not a wildcard.
      q.slice(0, 120).replace(/[\\%_]/g, "\\$&"),
      input.category ?? "",
      input.sort ?? "",
    ],
  );
  return rows.map(summary);
}

export async function shopCategoryCounts(
  pool: Pool,
): Promise<Record<ShopCategory, number>> {
  const { rows } = await pool.query(
    `select coalesce(s.category, 'other') as category, count(distinct s.id)::int as n
     from subject s join community_report r on r.subject_id = s.id and r.state = 'PUBLISHED'
     group by 1`,
  );
  const counts = Object.fromEntries(
    SHOP_CATEGORY_KEYS.map((key) => [key, 0]),
  ) as Record<ShopCategory, number>;
  for (const row of rows) counts[row.category as ShopCategory] = row.n;
  return counts;
}

// Three real totals for the front page. Zeros are shown as zeros.
export async function directoryStats(pool: Pool) {
  const { rows } = await pool.query(
    `select count(distinct subject_id)::int as shops, count(*)::int as reviews,
            count(*) filter (where experience_type = 'negative')::int as reports
     from community_report where state = 'PUBLISHED'`,
  );
  return rows[0] as { shops: number; reviews: number; reports: number };
}

export type ShopReview = {
  id: string;
  experienceType: ExperienceType;
  rating: number | null;
  issue: Issue | null;
  product: string;
  eventDate: string | null;
  publishedAt: string;
  text: string;
  followups: { kind: FollowupKind; body: string; at: string }[];
};
export type ShopProfile = ShopSummary & { reviews: ShopReview[] };

// Null when the shop has nothing published (including once everything about
// it has been withdrawn): it then has no public profile at all.
export async function getShop(
  pool: Pool,
  shopId: string,
): Promise<ShopProfile | null> {
  if (!UUID.test(shopId)) return null;
  const head = await pool.query(
    `select s.id, s.display_name, s.category, ${SUMMARY}
     from subject s
     join community_report r on r.subject_id = s.id and r.state = 'PUBLISHED'
     where s.id = $1 group by s.id`,
    [shopId],
  );
  if (!head.rows[0]) return null;
  const reviews = await pool.query(
    `select r.id, r.experience_type, r.rating, r.issue, r.category,
            to_char(r.event_date, 'YYYY-MM-DD') as event_day, r.published_at, r.public_text
     from community_report r
     where r.subject_id = $1 and r.state = 'PUBLISHED'
     order by r.published_at desc limit 200`,
    [shopId],
  );
  const followups = await pool.query(
    `select f.report_id, f.kind, f.body, f.created_at
     from community_followup f join community_report r on r.id = f.report_id
     where r.subject_id = $1 and r.state = 'PUBLISHED' and f.status = 'PUBLISHED'
     order by f.created_at`,
    [shopId],
  );
  return {
    ...summary(head.rows[0]),
    reviews: reviews.rows.map((r) => ({
      id: r.id,
      experienceType: r.experience_type,
      rating: r.rating,
      issue: r.issue,
      product: r.category,
      eventDate: r.event_day,
      publishedAt: (r.published_at as Date).toISOString(),
      text: r.public_text,
      followups: followups.rows
        .filter((f) => f.report_id === r.id)
        .map((f) => ({
          kind: f.kind,
          body: f.body,
          at: (f.created_at as Date).toISOString(),
        })),
    })),
  };
}

export type AlertReport = {
  id: string;
  shopId: string;
  shopName: string;
  shopCategory: ShopCategory | null;
  issue: Issue | null;
  text: string;
  publishedAt: string;
  answered: boolean;
  resolved: boolean;
};
export type SafetyNote = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
};

// The alerts feed: published complaints, newest first, and moderators' own
// general warnings. A complaint here is its author's allegation. It was
// moderated for the publication rules, not investigated.
export async function listAlerts(
  pool: Pool,
  input: { limit?: number; category?: string } = {},
): Promise<{ reports: AlertReport[]; notes: SafetyNote[] }> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 200);
  const reports = await pool.query(
    `select r.id, s.id as shop_id, s.display_name, s.category, r.issue,
            left(r.public_text, 320) as text, r.published_at,
            exists (select 1 from community_followup f where f.report_id = r.id
                    and f.status = 'PUBLISHED' and f.kind = 'RESPONSE') as answered,
            exists (select 1 from community_followup f where f.report_id = r.id
                    and f.status = 'PUBLISHED' and f.kind = 'RESOLUTION') as resolved
     from community_report r join subject s on s.id = r.subject_id
     where r.state = 'PUBLISHED' and r.experience_type = 'negative'
       and ($2 = '' or s.category = $2)
     order by r.published_at desc limit $1`,
    [limit, input.category ?? ""],
  );
  const notes = await pool.query(
    `select id, title, body, published_at from safety_alert
     where retracted_at is null order by published_at desc limit 20`,
  );
  return {
    reports: reports.rows.map((r) => ({
      id: r.id,
      shopId: r.shop_id,
      shopName: r.display_name,
      shopCategory: r.category,
      issue: r.issue,
      text: r.text,
      publishedAt: (r.published_at as Date).toISOString(),
      answered: r.answered,
      resolved: r.resolved,
    })),
    notes: notes.rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      publishedAt: (n.published_at as Date).toISOString(),
    })),
  };
}

// A general warning about a pattern, written by a moderator. It is recorded
// against the moderator who wrote it, shown without their name, and can be
// retracted but not edited.
export async function createSafetyAlert(
  pool: Pool,
  input: { userId: string; title: string; body: string },
): Promise<
  | { ok: true; alertId: string }
  | Failure<"NOT_AUTHORIZED" | "VALIDATION_FAILED" | "SECRET_SUSPECTED">
> {
  if (!(await isModerator(pool, input.userId))) return fail("NOT_AUTHORIZED");
  const title = input.title.trim();
  const body = input.body.trim();
  if (
    title.length < 8 ||
    title.length > 120 ||
    body.length < 40 ||
    body.length > 2000
  ) {
    return fail("VALIDATION_FAILED");
  }
  if (hasIdentifier(`${title} ${body}`)) return fail("SECRET_SUSPECTED");
  const { rows } = await pool.query(
    "insert into safety_alert (title, body, created_by) values ($1, $2, $3) returning id",
    [title, body, input.userId],
  );
  return { ok: true, alertId: rows[0].id };
}

export async function retractSafetyAlert(
  pool: Pool,
  input: { userId: string; alertId: string },
): Promise<{ ok: true } | Failure<"NOT_AUTHORIZED" | "ILLEGAL_TRANSITION">> {
  if (!UUID.test(input.alertId) || !(await isModerator(pool, input.userId))) {
    return fail("NOT_AUTHORIZED");
  }
  const result = await pool.query(
    `update safety_alert set retracted_at = now(), retracted_by = $2
     where id = $1 and retracted_at is null`,
    [input.alertId, input.userId],
  );
  return result.rowCount === 1 ? { ok: true } : fail("ILLEGAL_TRANSITION");
}
