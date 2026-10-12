import type { ErrorCode } from "@lp/contracts";
import { looksLikeSecret, textSimilarity } from "@lp/domain";
import type { Pool } from "./index";

// Spec C9 and D.10: a community report is a user's own account of what
// happened to them. The author approves the exact public text, a moderator
// who is not the author decides whether it is published, and nothing here
// says whether the account is true or what the subject is.

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});
type Done<E extends ErrorCode> = { ok: true } | Failure<E>;

export const SUBMISSION_DAILY_BUDGET = 5;
const PENDING_FOLLOWUPS = 3;
const RESPONSE_HOURS = 72;
const APPEAL_DAYS = 7;
const MIN_REASON = 10;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const EXPERIENCE = ["positive", "negative", "mixed", "neutral"] as const;
export type ExperienceType = (typeof EXPERIENCE)[number];
export type ReportState =
  | "DRAFT"
  | "SUBMITTED"
  | "NEEDS_INFORMATION"
  | "UNDER_REVIEW"
  | "PUBLISHED"
  | "NOT_PUBLISHED"
  | "WITHDRAWN";
export type FollowupKind = "RESPONSE" | "CORRECTION" | "RESOLUTION";

// C9.2: phone numbers, wallet and account numbers, emails and anything that
// looks like a credential stay out of public text. A heuristic: it flags some
// harmless numbers and will miss names and addresses, which is why a
// moderator still reads every text before it is published.
const LONG_NUMBER = /(?:\d[ -]?){9,}/u;
const EMAIL = /\S+@\S+\.\S+/u;
export const hasIdentifier = (text: string) =>
  LONG_NUMBER.test(text) || EMAIL.test(text) || looksLikeSecret(text);

export const isModerator = async (pool: Pool, userId: string) =>
  (
    await pool.query(
      "select 1 from staff_role where user_id = $1 and role = 'moderator' and revoked_at is null",
      [userId],
    )
  ).rowCount === 1;

type Row = {
  id: string;
  author_id: string;
  state: ReportState;
  version: number;
  narrative: string;
  public_text: string;
  moderator_id: string | null;
  barred_moderator_id: string | null;
  appealable: boolean;
};
async function load(pool: Pool, reportId: string): Promise<Row | null> {
  if (!UUID.test(reportId)) return null;
  const { rows } = await pool.query(
    `select id, author_id, state, version, narrative, public_text, moderator_id,
            barred_moderator_id,
            coalesce(decided_at > now() - make_interval(days => $2), false) as appealable
     from community_report where id = $1`,
    [reportId, APPEAL_DAYS],
  );
  return rows[0] ?? null;
}

const isDuplicate = (error: unknown) =>
  (error as { code?: string; constraint?: string }).code === "23505" &&
  (error as { constraint?: string }).constraint === "community_report_one_live";

// Changes a report only if it is still in the state the caller checked, and
// records the event in the same statement.
async function move(
  pool: Pool,
  input: {
    reportId: string;
    from: ReportState;
    set: string;
    actorId: string;
    kind: string;
    reason?: string;
  },
): Promise<Done<"ILLEGAL_TRANSITION">> {
  const result = await pool.query(
    `with changed as (
       update community_report set ${input.set}
       where id = $1 and state = $2 returning id
     )
     insert into community_report_event (report_id, actor_id, kind, reason)
     select id, $3, $4, $5 from changed`,
    [input.reportId, input.from, input.actorId, input.kind, input.reason ?? ""],
  );
  return result.rowCount === 1 ? { ok: true } : fail("ILLEGAL_TRANSITION");
}

// The kinds of shop people browse by, and what a complaint may allege.
export const SHOP_CATEGORY_KEYS = [
  "game_topup",
  "game_accounts",
  "software",
  "subscriptions",
  "gift_cards",
  "digital_services",
  "courses",
  "domains_hosting",
  "social_accounts",
  "other",
] as const;
export type ShopCategory = (typeof SHOP_CATEGORY_KEYS)[number];
export const ISSUE_KEYS = [
  "not_delivered",
  "wrong_item",
  "access_revoked",
  "no_refund",
  "blocked_after_payment",
  "impersonation",
  "other",
] as const;
export type Issue = (typeof ISSUE_KEYS)[number];

export type DraftInput = {
  userId: string;
  reportId?: string;
  subject: string;
  category: string;
  eventDate: string | null;
  experienceType: string;
  amountMinor: string | null;
  narrative: string;
  publicText: string;
  // The reviewer's own 1 to 5 rating of this experience.
  rating?: number | null;
  // What a complaint alleges. Only for a negative or mixed experience.
  issue?: string | null;
  // Sets the shop's browsing category if it has none yet.
  shopCategory?: string;
};

// C9.1: an incomplete report is a private draft. Saving never publishes.
export async function saveDraft(
  pool: Pool,
  input: DraftInput,
): Promise<
  | { ok: true; reportId: string; version: number }
  | Failure<
      | "VALIDATION_FAILED"
      | "SECRET_SUSPECTED"
      | "NOT_AUTHORIZED"
      | "ILLEGAL_TRANSITION"
    >
> {
  const subject = input.subject.replace(/\s+/g, " ").trim();
  const eventDate = input.eventDate || null;
  const amount = input.amountMinor || null;
  const rating = input.rating ?? null;
  const issue = input.issue || null;
  const shopCategory = input.shopCategory || null;
  if (
    !(EXPERIENCE as readonly string[]).includes(input.experienceType) ||
    input.category.length > 60 ||
    input.narrative.length > 5000 ||
    input.publicText.length > 2000 ||
    (eventDate !== null &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
        Number.isNaN(Date.parse(eventDate)))) ||
    (amount !== null && !/^[1-9]\d{0,14}$/.test(amount)) ||
    (rating !== null && ![1, 2, 3, 4, 5].includes(rating)) ||
    (issue !== null &&
      (!(ISSUE_KEYS as readonly string[]).includes(issue) ||
        !["negative", "mixed"].includes(input.experienceType))) ||
    (shopCategory !== null &&
      !(SHOP_CATEGORY_KEYS as readonly string[]).includes(shopCategory))
  ) {
    return fail("VALIDATION_FAILED");
  }
  if (hasIdentifier(input.publicText)) return fail("SECRET_SUSPECTED");
  const fields = [
    input.category.trim(),
    input.experienceType,
    eventDate,
    amount,
    input.narrative.trim(),
    input.publicText.trim(),
    rating,
    issue,
  ];

  if (input.reportId) {
    const row = await load(pool, input.reportId);
    if (!row || row.author_id !== input.userId) return fail("NOT_AUTHORIZED");
    const { rows } = await pool.query(
      `update community_report set category = $3, experience_type = $4, event_date = $5,
         amount_minor = $6, narrative = $7, public_text = $8, rating = $9, issue = $10,
         version = version + 1
       where id = $1 and author_id = $2 and state in ('DRAFT', 'NEEDS_INFORMATION')
       returning version, subject_id`,
      [input.reportId, input.userId, ...fields],
    );
    if (rows[0] && shopCategory) {
      await pool.query(
        "update subject set category = $2 where id = $1 and category is null",
        [rows[0].subject_id, shopCategory],
      );
    }
    return rows[0]
      ? { ok: true, reportId: input.reportId, version: rows[0].version }
      : fail("ILLEGAL_TRANSITION");
  }

  if (subject.length < 2 || subject.length > 120) {
    return fail("VALIDATION_FAILED");
  }
  // C7.2: the name as written. Similar names stay separate subjects.
  const { rows } = await pool.query(
    `with s as (
       insert into subject (display_name, normalized_key, category) values ($1, $2, $12)
       -- The first reporter's category stands; a later one fills a blank only.
       on conflict (normalized_key) do update
         set category = coalesce(subject.category, excluded.category)
       returning id
     )
     insert into community_report
       (author_id, subject_id, category, experience_type, event_date, amount_minor,
        narrative, public_text, rating, issue)
     select $3, s.id, $4, $5, $6, $7, $8, $9, $10, $11 from s
     returning id, version`,
    [subject, subject.toLowerCase(), input.userId, ...fields, shopCategory],
  );
  return { ok: true, reportId: rows[0].id, version: rows[0].version };
}

// D.10: the author approves the final text. `expectedVersion` is the version
// whose preview they were shown; a later edit makes that approval void.
export async function submitReport(
  pool: Pool,
  input: { userId: string; reportId: string; expectedVersion: number },
): Promise<
  Done<
    | "NOT_AUTHORIZED"
    | "ILLEGAL_TRANSITION"
    | "VERSION_CONFLICT"
    | "VALIDATION_FAILED"
    | "BUDGET_EXHAUSTED"
    | "DUPLICATE_REPORT"
  >
> {
  const row = await load(pool, input.reportId);
  if (!row || row.author_id !== input.userId) return fail("NOT_AUTHORIZED");
  if (row.state !== "DRAFT" && row.state !== "NEEDS_INFORMATION") {
    return fail("ILLEGAL_TRANSITION");
  }
  if (row.version !== input.expectedVersion) return fail("VERSION_CONFLICT");
  if (!row.narrative || !row.public_text) return fail("VALIDATION_FAILED");
  // ponytail: counted, not locked; a burst of parallel submits can exceed it
  // by a few. Moderation is the real control.
  const used = await pool.query(
    `select count(*)::int as n from community_report_event
     where actor_id = $1 and kind = 'SUBMITTED' and occurred_at > now() - interval '24 hours'`,
    [input.userId],
  );
  if (used.rows[0].n >= SUBMISSION_DAILY_BUDGET)
    return fail("BUDGET_EXHAUSTED");
  try {
    const result = await pool.query(
      `with changed as (
         update community_report set state = 'SUBMITTED', moderator_id = null
         where id = $1 and state = $2 and version = $3 returning id
       )
       insert into community_report_event (report_id, actor_id, kind)
       select id, $4, 'SUBMITTED' from changed`,
      [input.reportId, row.state, input.expectedVersion, input.userId],
    );
    return result.rowCount === 1 ? { ok: true } : fail("VERSION_CONFLICT");
  } catch (error) {
    // One live report per person per shop (community_report_one_live).
    if (isDuplicate(error)) return fail("DUPLICATE_REPORT");
    throw error;
  }
}

// C9.4: withdrawing says nothing about whether the report was true. The text
// leaves public view; the history stays.
export async function withdrawReport(
  pool: Pool,
  input: { userId: string; reportId: string },
): Promise<Done<"NOT_AUTHORIZED" | "ILLEGAL_TRANSITION">> {
  const row = await load(pool, input.reportId);
  if (!row || row.author_id !== input.userId) return fail("NOT_AUTHORIZED");
  if (row.state === "DRAFT" || row.state === "WITHDRAWN") {
    return fail("ILLEGAL_TRANSITION");
  }
  return move(pool, {
    reportId: input.reportId,
    from: row.state,
    set: "state = 'WITHDRAWN'",
    actorId: input.userId,
    kind: "WITHDRAWN",
  });
}

// C9.4: seven days to appeal a refusal; the appeal goes to someone else.
export async function appealReport(
  pool: Pool,
  input: { userId: string; reportId: string; reason: string },
): Promise<
  Done<
    | "NOT_AUTHORIZED"
    | "ILLEGAL_TRANSITION"
    | "APPEAL_WINDOW_CLOSED"
    | "VALIDATION_FAILED"
  >
> {
  const row = await load(pool, input.reportId);
  if (!row || row.author_id !== input.userId) return fail("NOT_AUTHORIZED");
  if (row.state !== "NOT_PUBLISHED") return fail("ILLEGAL_TRANSITION");
  if (!row.appealable) return fail("APPEAL_WINDOW_CLOSED");
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON || reason.length > 1000) {
    return fail("VALIDATION_FAILED");
  }
  // ponytail: an appeal that collides with the author's other live report on
  // the same shop surfaces as a database error. Handle it if it ever happens.
  return move(pool, {
    reportId: input.reportId,
    from: "NOT_PUBLISHED",
    set: "state = 'SUBMITTED', barred_moderator_id = moderator_id, moderator_id = null",
    actorId: input.userId,
    kind: "APPEALED",
    reason,
  });
}

export async function claimReport(
  pool: Pool,
  input: { moderatorId: string; reportId: string },
): Promise<Done<"NOT_AUTHORIZED" | "ILLEGAL_TRANSITION">> {
  const row = await load(pool, input.reportId);
  if (
    !row ||
    row.state === "DRAFT" ||
    // Nobody moderates their own report, or an appeal against their decision.
    row.author_id === input.moderatorId ||
    row.barred_moderator_id === input.moderatorId ||
    !(await isModerator(pool, input.moderatorId))
  ) {
    return fail("NOT_AUTHORIZED");
  }
  const result = await pool.query(
    `with changed as (
       update community_report set state = 'UNDER_REVIEW', moderator_id = $2
       where id = $1 and state = 'SUBMITTED' returning id
     )
     insert into community_report_event (report_id, actor_id, kind)
     select id, $2, 'CLAIMED' from changed`,
    [input.reportId, input.moderatorId],
  );
  return result.rowCount === 1 ? { ok: true } : fail("ILLEGAL_TRANSITION");
}

const DECISIONS = {
  PUBLISHED: `state = 'PUBLISHED', decided_at = now(), published_at = now(),
              response_due_at = now() + interval '${RESPONSE_HOURS} hours'`,
  NOT_PUBLISHED: "state = 'NOT_PUBLISHED', decided_at = now()",
  NEEDS_INFORMATION: "state = 'NEEDS_INFORMATION'",
} as const;

// The decision is about whether the text may be published under the rules.
// It is not a finding that the report is true or that the subject did wrong.
export async function decideReport(
  pool: Pool,
  input: {
    moderatorId: string;
    reportId: string;
    decision: string;
    reason: string;
  },
): Promise<
  Done<"NOT_AUTHORIZED" | "ILLEGAL_TRANSITION" | "VALIDATION_FAILED">
> {
  const row = await load(pool, input.reportId);
  if (
    !row ||
    row.moderator_id !== input.moderatorId ||
    !(await isModerator(pool, input.moderatorId))
  ) {
    return fail("NOT_AUTHORIZED");
  }
  if (row.state !== "UNDER_REVIEW") return fail("ILLEGAL_TRANSITION");
  const reason = input.reason.trim();
  if (
    !Object.hasOwn(DECISIONS, input.decision) ||
    reason.length < MIN_REASON ||
    reason.length > 1000
  ) {
    return fail("VALIDATION_FAILED");
  }
  const decision = input.decision as keyof typeof DECISIONS;
  return move(pool, {
    reportId: input.reportId,
    from: "UNDER_REVIEW",
    set: DECISIONS[decision],
    actorId: input.moderatorId,
    kind: decision,
    reason,
  });
}

// A response from anyone but the author, or the author's own correction or
// resolution. It waits for a moderator like the report did.
export async function addFollowup(
  pool: Pool,
  input: { userId: string; reportId: string; kind: string; body: string },
): Promise<
  | { ok: true; followupId: string }
  | Failure<
      | "NOT_AUTHORIZED"
      | "VALIDATION_FAILED"
      | "SECRET_SUSPECTED"
      | "BUDGET_EXHAUSTED"
    >
> {
  const row = await load(pool, input.reportId);
  if (row?.state !== "PUBLISHED") return fail("NOT_AUTHORIZED");
  const byAuthor = row.author_id === input.userId;
  if (!["RESPONSE", "CORRECTION", "RESOLUTION"].includes(input.kind)) {
    return fail("VALIDATION_FAILED");
  }
  if ((input.kind === "RESPONSE") === byAuthor) return fail("NOT_AUTHORIZED");
  const body = input.body.trim();
  if (body.length < MIN_REASON || body.length > 2000) {
    return fail("VALIDATION_FAILED");
  }
  if (hasIdentifier(body)) return fail("SECRET_SUSPECTED");
  const { rows } = await pool.query(
    `insert into community_followup (report_id, author_id, kind, body)
     select $1, $2, $3, $4
     where (select count(*) from community_followup
            where report_id = $1 and author_id = $2 and status = 'PENDING') < $5
     returning id`,
    [input.reportId, input.userId, input.kind, body, PENDING_FOLLOWUPS],
  );
  return rows[0]
    ? { ok: true, followupId: rows[0].id }
    : fail("BUDGET_EXHAUSTED");
}

export async function decideFollowup(
  pool: Pool,
  input: {
    moderatorId: string;
    followupId: string;
    publish: boolean;
    reason: string;
  },
): Promise<
  Done<"NOT_AUTHORIZED" | "ILLEGAL_TRANSITION" | "VALIDATION_FAILED">
> {
  if (
    !UUID.test(input.followupId) ||
    !(await isModerator(pool, input.moderatorId))
  ) {
    return fail("NOT_AUTHORIZED");
  }
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON || reason.length > 1000) {
    return fail("VALIDATION_FAILED");
  }
  // Neither the writer of the follow-up nor the author of the report decides.
  const result = await pool.query(
    `update community_followup f set status = $3, decided_by = $2, reason = $4, decided_at = now()
     from community_report r
     where f.id = $1 and r.id = f.report_id and f.status = 'PENDING'
       and f.author_id <> $2 and r.author_id <> $2`,
    [
      input.followupId,
      input.moderatorId,
      input.publish ? "PUBLISHED" : "REJECTED",
      reason,
    ],
  );
  return result.rowCount === 1 ? { ok: true } : fail("ILLEGAL_TRANSITION");
}

// Null for anyone who is not a moderator. A moderator's own reports, and
// appeals against their own decisions, are not listed.
export async function moderationQueue(pool: Pool, userId: string) {
  if (!(await isModerator(pool, userId))) return null;
  const reports = await pool.query(
    `select r.id, s.display_name as subject, r.state, r.moderator_id,
            r.barred_moderator_id is not null as appeal
     from community_report r join subject s on s.id = r.subject_id
     where r.author_id <> $1 and r.barred_moderator_id is distinct from $1
       and (r.state = 'SUBMITTED' or (r.state = 'UNDER_REVIEW' and r.moderator_id = $1))
     order by r.created_at limit 100`,
    [userId],
  );
  const followups = await pool.query(
    `select f.id, f.report_id, f.kind, f.body
     from community_followup f join community_report r on r.id = f.report_id
     where f.status = 'PENDING' and f.author_id <> $1 and r.author_id <> $1
     order by f.created_at limit 100`,
    [userId],
  );
  return {
    reports: reports.rows.map((r) => ({
      id: r.id as string,
      subject: r.subject as string,
      state: r.state as ReportState,
      mine: r.moderator_id === userId,
      appeal: r.appeal as boolean,
    })),
    followups: followups.rows.map((f) => ({
      id: f.id as string,
      reportId: f.report_id as string,
      kind: f.kind as FollowupKind,
      body: f.body as string,
    })),
  };
}

export type ReportView = {
  id: string;
  role: "author" | "moderator" | "public";
  subject: string;
  category: string;
  experienceType: ExperienceType;
  rating: number | null;
  issue: Issue | null;
  eventDate: string | null;
  state: ReportState;
  version: number;
  // Null once withdrawn, for everyone but the author and moderators.
  publicText: string | null;
  // The private original: the author and the assigned moderator only.
  narrative?: string;
  amountMinor?: string | null;
  assignedToMe: boolean;
  // For moderators: the closest match, 0 to 1, between this text and any
  // other report on the same shop. A hint that it may be a copy, not proof.
  similarity?: number;
  canAppeal: boolean;
  publishedAt: string | null;
  responseDueAt: string | null;
  history: { kind: string; reason: string; at: string }[];
  followups: {
    id: string;
    kind: FollowupKind;
    body: string;
    status: "PENDING" | "PUBLISHED" | "REJECTED";
    at: string;
    mine: boolean;
    byAuthor: boolean;
  }[];
};

// One reader, three scopes (INV-11). Nobody but the author sees a draft; the
// public sees only published text and never who wrote it.
export async function getReport(
  pool: Pool,
  input: { userId: string; reportId: string },
): Promise<ReportView | null> {
  if (!UUID.test(input.reportId)) return null;
  const { rows } = await pool.query(
    `select r.*, s.display_name as subject, to_char(r.event_date, 'YYYY-MM-DD') as event_day,
            coalesce(r.decided_at > now() - make_interval(days => $2), false) as appealable
     from community_report r join subject s on s.id = r.subject_id where r.id = $1`,
    [input.reportId, APPEAL_DAYS],
  );
  const r = rows[0];
  if (!r) return null;
  const me = input.userId;
  const role =
    r.author_id === me
      ? "author"
      : r.state !== "DRAFT" && (await isModerator(pool, me))
        ? "moderator"
        : r.state === "PUBLISHED" ||
            (r.state === "WITHDRAWN" && r.published_at !== null)
          ? "public"
          : null;
  if (!role) return null;
  const insider = role !== "public";
  const assignedToMe = role === "moderator" && r.moderator_id === me;
  let similarity: number | undefined;
  if (role === "moderator" && r.public_text) {
    const others = await pool.query(
      `select public_text from community_report
       where subject_id = $1 and id <> $2 and state <> 'DRAFT' and public_text <> ''
       order by created_at desc limit 50`,
      [r.subject_id, r.id],
    );
    similarity = Math.max(
      0,
      ...others.rows.map((o) => textSimilarity(r.public_text, o.public_text)),
    );
  }

  const history = insider
    ? (
        await pool.query(
          "select kind, reason, occurred_at from community_report_event where report_id = $1 order by id",
          [r.id],
        )
      ).rows.map((e) => ({
        kind: e.kind as string,
        reason: e.reason as string,
        at: (e.occurred_at as Date).toISOString(),
      }))
    : [];
  const followups =
    r.state === "PUBLISHED" || insider
      ? (
          await pool.query(
            `select id, author_id, kind, body, status, created_at from community_followup
             where report_id = $1 and (status = 'PUBLISHED' or author_id = $2 or $3)
             order by created_at`,
            [r.id, me, role === "moderator"],
          )
        ).rows.map((f) => ({
          id: f.id as string,
          kind: f.kind as FollowupKind,
          body: f.body as string,
          status: f.status as "PENDING" | "PUBLISHED" | "REJECTED",
          at: (f.created_at as Date).toISOString(),
          mine: f.author_id === me,
          byAuthor: f.author_id === r.author_id,
        }))
      : [];

  return {
    id: r.id,
    role,
    subject: r.subject,
    category: r.category,
    experienceType: r.experience_type,
    rating: r.rating,
    issue: r.issue,
    eventDate: r.event_day,
    state: r.state,
    version: r.version,
    publicText: insider || r.state === "PUBLISHED" ? r.public_text : null,
    ...(role === "author" || assignedToMe
      ? { narrative: r.narrative, amountMinor: r.amount_minor }
      : {}),
    assignedToMe,
    ...(similarity === undefined ? {} : { similarity }),
    canAppeal: role === "author" && r.state === "NOT_PUBLISHED" && r.appealable,
    publishedAt: r.published_at?.toISOString() ?? null,
    responseDueAt: r.response_due_at?.toISOString() ?? null,
    history,
    followups,
  };
}

export async function listMyReports(pool: Pool, userId: string) {
  const { rows } = await pool.query(
    `select r.id, s.display_name as subject, r.state
     from community_report r join subject s on s.id = r.subject_id
     where r.author_id = $1 order by r.created_at desc limit 50`,
    [userId],
  );
  return rows as { id: string; subject: string; state: ReportState }[];
}

// Published reports about exactly this name.
export async function listPublished(pool: Pool, subject: string) {
  const { rows } = await pool.query(
    `select r.id, r.experience_type, r.published_at
     from community_report r join subject s on s.id = r.subject_id
     where s.normalized_key = $1 and r.state = 'PUBLISHED'
     order by r.published_at desc limit 50`,
    [subject.replace(/\s+/g, " ").trim().toLowerCase()],
  );
  return rows.map((r) => ({
    id: r.id as string,
    experienceType: r.experience_type as ExperienceType,
    publishedAt: (r.published_at as Date).toISOString(),
  }));
}
