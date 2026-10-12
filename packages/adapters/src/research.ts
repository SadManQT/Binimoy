import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@lp/contracts";
import {
  CANDIDATE_BUDGET,
  type ContentType,
  canonicalUrl,
  classifyPassage,
  duplicateKey,
  matchSubject,
  type PlannedQuery,
  planQueries,
  type ReportType,
} from "@lp/domain";
import { FIXTURE_PAGES } from "@lp/fixtures";
import type { Pool } from "pg";

// Spec C7, C8, D.9 and D.10: search, retrieve what may be retrieved, and file
// each result under what its author reports. Nothing here scores or judges
// the subject, and nothing is summarized that was not actually read.

// C7.6. The provider's own name is recorded with every result it produced.
export type SearchResult = {
  url: string;
  title: string;
  snippet: string;
  displayedDate?: string;
};
export type SearchProvider = {
  name: string;
  search(
    query: string,
    cursor?: string,
  ): Promise<{ results: SearchResult[]; nextCursor?: string }>;
};

// D.9: the only thing that reads an untrusted page. LOGIN_WALL is a response
// that arrived but was not the post.
export type Retrieved = {
  access: "FULL_TEXT" | "PARTIAL_TEXT" | "LOGIN_WALL" | "UNAVAILABLE";
  body: string | null;
  publishedAt: string | null;
  author: "customer" | "seller" | "publisher" | null;
};
export type Retriever = { fetch(url: string): Promise<Retrieved> };

const pageText = (page: (typeof FIXTURE_PAGES)[number]) =>
  `${page.title} ${page.snippet} ${page.body ?? ""}`.toLowerCase();

// Replays the synthetic pages like a loose search engine would: it matches on
// most of the name, so a similarly named shop comes back too.
export function fixtureSearchProvider(): SearchProvider {
  return {
    name: "fixture",
    async search(query) {
      const words = (/"([^"]*)"/.exec(query)?.[1] ?? "")
        .toLowerCase()
        .split(" ")
        .filter(Boolean);
      const needle = (words.length > 1 ? words.slice(0, -1) : words).join(" ");
      const site = /site:(\S+)/.exec(query)?.[1];
      if (!needle) return { results: [] };
      const results = FIXTURE_PAGES.filter(
        (page) =>
          pageText(page).includes(needle) &&
          (!site || new URL(page.url).hostname.endsWith(site)),
      ).map((page) => ({
        // Site-restricted results come back as mobile links with tracking
        // parameters, as they often do in real results.
        url: site
          ? `${page.url.replace("//www.", "//m.")}?fbclid=fixture`
          : page.url,
        title: page.title,
        snippet: page.snippet,
      }));
      return { results };
    },
  };
}

export function fixtureRetriever(): Retriever {
  return {
    async fetch(url) {
      const page = FIXTURE_PAGES.find((p) => canonicalUrl(p.url) === url);
      if (!page) {
        return {
          access: "UNAVAILABLE",
          body: null,
          publishedAt: null,
          author: null,
        };
      }
      return {
        access: page.access,
        body: page.body,
        publishedAt: page.publishedAt,
        author: page.author,
      };
    },
  };
}

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

// B15: bounded research per user in any 24 hours.
export const RESEARCH_DAILY_BUDGET = 20;
const MAX_BODY = 20_000;
const MAX_SUMMARY = 280;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type AccessStatus =
  | "FULL_TEXT"
  | "PARTIAL_TEXT"
  | "SNIPPET_ONLY"
  | "LINK_ONLY"
  | "USER_SUBMITTED"
  | "UNAVAILABLE";

export type Coverage = {
  searchedAt: string;
  providers: string[];
  queries: (PlannedQuery & { ok: boolean; results: number })[];
  candidates: number;
  notRetrieved: number;
  unrelated: number;
  truncated: boolean;
};

export async function runResearch(
  pool: Pool,
  input: {
    userId: string;
    subjectInput: string;
    search: SearchProvider;
    retrieve: Retriever;
  },
): Promise<
  | { ok: true; collectionId: string }
  | Failure<"VALIDATION_FAILED" | "BUDGET_EXHAUSTED">
> {
  // ponytail: names only. A pasted link or domain as the subject (C7.2) is
  // searched as plain text; resolve it properly when live retrieval exists.
  const subject = input.subjectInput.replace(/\s+/g, " ").trim();
  if (subject.length < 2 || subject.length > 120) {
    return fail("VALIDATION_FAILED");
  }
  // ponytail: checked before the run, not locked; two concurrent runs can
  // both pass at the limit. Lock per user if live search costs make it matter.
  const used = await pool.query(
    `select count(*)::int as n from research_collection
     where user_id = $1 and created_at > now() - interval '24 hours'`,
    [input.userId],
  );
  if (used.rows[0].n >= RESEARCH_DAILY_BUDGET) return fail("BUDGET_EXHAUSTED");

  const coverage: Coverage = {
    searchedAt: new Date().toISOString(),
    providers: [input.search.name],
    queries: [],
    candidates: 0,
    notRetrieved: 0,
    unrelated: 0,
    truncated: false,
  };

  // One candidate per page, whichever query found it first.
  const candidates = new Map<string, SearchResult>();
  for (const planned of planQueries(subject)) {
    if (coverage.truncated) break;
    try {
      // ponytail: first page of each query only; follow nextCursor when a
      // live provider shows it is worth the budget.
      const { results } = await input.search.search(planned.query);
      coverage.queries.push({ ...planned, ok: true, results: results.length });
      for (const result of results) {
        const url = canonicalUrl(result.url);
        if (!url || candidates.has(url)) continue;
        if (candidates.size >= CANDIDATE_BUDGET) {
          coverage.truncated = true;
          break;
        }
        candidates.set(url, result);
      }
    } catch {
      // The provider's error text may hold keys or internals: not recorded.
      coverage.queries.push({ ...planned, ok: false, results: 0 });
    }
  }
  coverage.candidates = candidates.size;

  const cards = [];
  for (const [url, found] of candidates) {
    let page: Retrieved;
    try {
      page = await input.retrieve.fetch(url);
    } catch {
      page = {
        access: "UNAVAILABLE",
        body: null,
        publishedAt: null,
        author: null,
      };
    }
    const body =
      (page.access === "FULL_TEXT" || page.access === "PARTIAL_TEXT") &&
      page.body
        ? page.body.slice(0, MAX_BODY)
        : null;
    const match = matchSubject(
      subject,
      `${found.title} ${found.snippet} ${body ?? ""}`,
    );
    if (match === "none") {
      coverage.unrelated += 1;
      continue;
    }
    if (!body) coverage.notRetrieved += 1;
    const access: AccessStatus = body
      ? (page.access as "FULL_TEXT" | "PARTIAL_TEXT")
      : page.access === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : found.snippet
          ? "SNIPPET_ONLY"
          : "LINK_ONLY";
    // C7.7: only what was actually read is sorted, dated or summarized.
    const sorted =
      body && page.author ? classifyPassage(body, page.author) : null;
    const published =
      body && page.publishedAt ? new Date(page.publishedAt) : null;
    cards.push({
      id: randomUUID(),
      url,
      title: found.title.slice(0, 300),
      snippet: found.snippet.slice(0, 500),
      access,
      body,
      published_at:
        published && !Number.isNaN(published.getTime())
          ? published.toISOString()
          : null,
      content_type: sorted?.contentType ?? null,
      report_type: sorted?.reportType ?? null,
      subject_match: match,
      // The source's own words, cut short. No model rewrites them here.
      summary: body ? body.slice(0, MAX_SUMMARY) : null,
      duplicate_group: body ? duplicateKey(body) : null,
      limitations: !body
        ? "NOT_RETRIEVED"
        : page.author
          ? "KEYWORD_SORTED"
          : "AUTHOR_UNKNOWN",
    });
  }

  const failed = coverage.queries.filter((q) => !q.ok).length;
  const status =
    failed === coverage.queries.length
      ? "FAILED"
      : failed > 0 || coverage.truncated
        ? "PARTIAL"
        : "DONE";

  const client = await pool.connect();
  try {
    await client.query("begin");
    const subjectRow = await client.query(
      `insert into subject (display_name, normalized_key) values ($1, $2)
       on conflict (normalized_key) do update set display_name = subject.display_name
       returning id`,
      [subject, subject.toLowerCase()],
    );
    const collection = await client.query(
      `insert into research_collection (user_id, subject_id, status, coverage)
       values ($1, $2, $3, $4) returning id`,
      [input.userId, subjectRow.rows[0].id, status, JSON.stringify(coverage)],
    );
    const collectionId: string = collection.rows[0].id;
    await client.query(
      `with input as (
         select * from jsonb_to_recordset($3::jsonb) as x(
           id uuid, url text, title text, snippet text, access text, body text,
           published_at timestamptz, content_type text, report_type text,
           subject_match text, summary text, duplicate_group text, limitations text)
       ), snap as (
         insert into source_snapshot
           (id, canonical_url, provider, title, snippet, access_status, body, published_at)
         select id, url, $2, title, snippet, access, body, published_at from input
       )
       insert into report_card
         (collection_id, snapshot_id, content_type, report_type, subject_match,
          attributed_summary, duplicate_group, limitations)
       select $1, id, content_type, report_type, subject_match, summary,
              duplicate_group, limitations from input`,
      [collectionId, input.search.name, JSON.stringify(cards)],
    );
    await client.query("commit");
    return { ok: true, collectionId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export type ReportCard = {
  id: string;
  url: string;
  provider: string;
  title: string;
  snippet: string;
  accessStatus: AccessStatus;
  publishedAt: string | null;
  retrievedAt: string;
  contentType: ContentType | null;
  reportType: ReportType | null;
  subjectMatch: "exact" | "ambiguous";
  summary: string | null;
  duplicateGroup: string | null;
  limitations: string;
};
type Counted = "positive" | "negative" | "mixed" | "neutral" | "resolution";
export type CollectionView = {
  id: string;
  subject: string;
  status: "RUNNING" | "DONE" | "PARTIAL" | "FAILED";
  createdAt: string;
  coverage: Coverage;
  cards: ReportCard[];
  // C7.5: customer experiences found in this search about the exact subject,
  // one per group of copies. Not a score and not a count of all customers.
  counts: Record<Counted, number>;
};

// D.9: a collection is visible to the user who ran it and to nobody else.
export async function getCollection(
  pool: Pool,
  input: { userId: string; collectionId: string },
): Promise<CollectionView | null> {
  if (!UUID.test(input.collectionId)) return null;
  const head = await pool.query(
    `select c.id, s.display_name, c.status, c.created_at, c.coverage
     from research_collection c join subject s on s.id = c.subject_id
     where c.id = $1 and c.user_id = $2`,
    [input.collectionId, input.userId],
  );
  const row = head.rows[0];
  if (!row) return null;
  const { rows } = await pool.query(
    `select r.id, s.canonical_url, s.provider, s.title, s.snippet, s.access_status,
            s.published_at, s.retrieved_at, r.content_type, r.report_type,
            r.subject_match, r.attributed_summary, r.duplicate_group, r.limitations
     from report_card r join source_snapshot s on s.id = r.snapshot_id
     where r.collection_id = $1
     order by s.published_at desc nulls last, s.canonical_url`,
    [input.collectionId],
  );
  const cards: ReportCard[] = rows.map((r) => ({
    id: r.id,
    url: r.canonical_url,
    provider: r.provider,
    title: r.title,
    snippet: r.snippet,
    accessStatus: r.access_status,
    publishedAt: r.published_at?.toISOString() ?? null,
    retrievedAt: r.retrieved_at.toISOString(),
    contentType: r.content_type,
    reportType: r.report_type,
    subjectMatch: r.subject_match,
    summary: r.attributed_summary,
    duplicateGroup: r.duplicate_group,
    limitations: r.limitations,
  }));
  const counts: Record<Counted, number> = {
    positive: 0,
    negative: 0,
    mixed: 0,
    neutral: 0,
    resolution: 0,
  };
  const seen = new Set<string>();
  for (const card of cards) {
    if (
      card.subjectMatch !== "exact" ||
      card.contentType !== "customer_experience" ||
      !card.reportType ||
      card.reportType === "response"
    ) {
      continue;
    }
    const group = card.duplicateGroup ?? card.id;
    if (seen.has(group)) continue;
    seen.add(group);
    counts[card.reportType] += 1;
  }
  return {
    id: row.id,
    subject: row.display_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    coverage: row.coverage,
    cards,
    counts,
  };
}

export async function listCollections(pool: Pool, userId: string) {
  const { rows } = await pool.query(
    `select c.id, s.display_name as subject, c.status, c.created_at
     from research_collection c join subject s on s.id = c.subject_id
     where c.user_id = $1 order by c.created_at desc limit 50`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    subject: r.subject as string,
    status: r.status as CollectionView["status"],
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

// C7.2, D.10: the user corrects which cards are about their subject. It
// changes this collection only; the stored source is untouched.
export async function setCardMatch(
  pool: Pool,
  input: { userId: string; cardId: string; match: "exact" | "ambiguous" },
): Promise<boolean> {
  if (!UUID.test(input.cardId)) return false;
  const result = await pool.query(
    `update report_card r set subject_match = $3
     from research_collection c
     where r.id = $2 and c.id = r.collection_id and c.user_id = $1`,
    [input.userId, input.cardId, input.match],
  );
  return result.rowCount === 1;
}
