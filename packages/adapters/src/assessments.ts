import { createHash } from "node:crypto";
import type { ErrorCode } from "@lp/contracts";
import { getConversation, MONITORING_POLICY } from "@lp/db/conversation";
import { getDeliveryView } from "@lp/db/delivery";
import { type Assessment, validateAssessment } from "@lp/domain";
import type { Pool } from "pg";
import {
  type AssessmentContext,
  type AssessmentModel,
  PROMPT_VERSION,
} from "./assessment-model";

// Spec B12, B15 and D.11: when the model is asked, what it is shown, and what
// happens to its answer. The model's output is advisory text. Nothing here
// can authorize, reserve or move money.

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

// B15: bounded AI work per deal.
export const ASSESSMENT_BUDGET = 10;
const MAX_MESSAGES = 200;
const ATTEMPTS = 2;

const consentQuery = `select count(*)::int = 2 as ok from deal_party p
  where p.deal_id = $1 and exists (
    select 1 from monitoring_consent c
    where c.deal_id = p.deal_id and c.user_id = p.user_id
      and c.policy_version = $2 and c.withdrawn_at is null)`;
const aiMayRead = async (pool: Pool, dealId: string) =>
  (await pool.query(consentQuery, [dealId, MONITORING_POLICY.version])).rows[0]
    .ok as boolean;

export async function requestAssessment(
  pool: Pool,
  input: { userId: string; dealId: string },
): Promise<
  | { ok: true; jobId: string }
  | Failure<"NOT_AUTHORIZED" | "MISSING_CONSENT" | "BUDGET_EXHAUSTED">
> {
  const party = await pool.query(
    "select 1 from deal_party where deal_id::text = $1 and user_id = $2",
    [input.dealId, input.userId],
  );
  if (party.rowCount !== 1) return fail("NOT_AUTHORIZED");
  // B13-11: no processing without both parties' current consent.
  if (!(await aiMayRead(pool, input.dealId))) return fail("MISSING_CONSENT");
  const active = await pool.query(
    "select id from ai_job where deal_id = $1 and status in ('QUEUED', 'RUNNING')",
    [input.dealId],
  );
  if (active.rows[0]) return { ok: true, jobId: active.rows[0].id };
  const used = await pool.query(
    "select count(*)::int as n from ai_job where deal_id = $1 and status <> 'CANCELLED'",
    [input.dealId],
  );
  if (used.rows[0].n >= ASSESSMENT_BUDGET) return fail("BUDGET_EXHAUSTED");
  try {
    const { rows } = await pool.query(
      "insert into ai_job (deal_id, requested_by) values ($1, $2) returning id",
      [input.dealId, input.userId],
    );
    return { ok: true, jobId: rows[0].id };
  } catch (error) {
    // Two requests at once: the unique index lets one in.
    if ((error as { code?: string }).code !== "23505") throw error;
    const again = await pool.query(
      "select id from ai_job where deal_id = $1 and status in ('QUEUED', 'RUNNING')",
      [input.dealId],
    );
    return { ok: true, jobId: again.rows[0].id };
  }
}

// D.8: a withdrawal cancels analysis that has not started.
export async function cancelQueuedAssessments(
  pool: Pool,
  dealId: string,
): Promise<void> {
  await pool.query(
    "update ai_job set status = 'CANCELLED', finished_at = now() where deal_id = $1 and status = 'QUEUED'",
    [dealId],
  );
}

type Bindings = {
  agreementVersionNo: number;
  packageVersionNo: number | null;
  messageCursor: number;
};

async function currentBindings(pool: Pool, dealId: string): Promise<Bindings> {
  const { rows } = await pool.query(
    `select
       (select max(v.version_no) from agreement_version v
          join aggregate a on a.id = v.agreement_id where a.deal_id = $1) as agreement,
       (select max(p.version_no) from delivery_package p where p.deal_id = $1) as package,
       (select coalesce(max(v.seq), 0) from monitored_message_version v
          join monitored_message m on m.id = v.message_id where m.deal_id = $1) as cursor`,
    [dealId],
  );
  return {
    agreementVersionNo: rows[0].agreement,
    packageVersionNo: rows[0].package,
    messageCursor: Number(rows[0].cursor),
  };
}

// Everything the model will see for this deal, and nothing else. There is no
// vault content to include: the server never has it.
export async function buildContext(
  pool: Pool,
  dealId: string,
): Promise<{ context: AssessmentContext; bindings: Bindings }> {
  const bindings = await currentBindings(pool, dealId);
  const agreement = await pool.query(
    `select d.title, v.terms from deal d
     join aggregate a on a.deal_id = d.id and a.type = 'agreement'
     join agreement_version v on v.agreement_id = a.id and v.version_no = $2
     where d.id = $1`,
    [dealId, bindings.agreementVersionNo],
  );
  const terms = agreement.rows[0].terms;
  const delivery = await getDeliveryView(pool, dealId);
  const dispute = await pool.query(
    `select d.claim, d.detail, p.role from dispute d
     join deal_party p on p.deal_id = d.deal_id and p.user_id = d.opened_by
     where d.deal_id = $1 order by d.opened_at desc limit 1`,
    [dealId],
  );
  // The current wording of each message. Deleted and redacted messages have
  // no text and are left out; an edited message is cited by its latest version.
  const messages = await pool.query(
    `select m.id, p.role, v.version_no, v.body, v.created_at
     from monitored_message m
     join deal_party p on p.deal_id = m.deal_id and p.user_id = m.author_id
     join lateral (select * from monitored_message_version
                   where message_id = m.id order by version_no desc limit 1) v on true
     where m.deal_id = $1 and v.body is not null
     order by m.created_at desc, m.id limit $2`,
    [dealId, MAX_MESSAGES + 1],
  );
  const coverageGaps: string[] = [];
  if (messages.rows.length > MAX_MESSAGES) {
    coverageGaps.push(
      `Only the ${MAX_MESSAGES} most recent messages were provided; earlier ones were not.`,
    );
  }
  const shown = messages.rows.slice(0, MAX_MESSAGES).reverse();

  const agreementRef = `agreement:v${bindings.agreementVersionNo}`;
  const context: AssessmentContext = {
    manifest: [],
    agreement: {
      ref: agreementRef,
      title: agreement.rows[0].title,
      amountMinor: terms.amountMinor,
      currency: terms.currency,
      items: terms.items.map(
        (item: {
          itemId: string;
          title: { en: string };
          mandatory: boolean;
          proofTypes: string[];
        }) => ({
          itemId: item.itemId,
          title: item.title.en,
          mandatory: item.mandatory,
          proof: item.proofTypes.join(", "),
        }),
      ),
    },
    delivery: delivery.package
      ? {
          ref: `delivery:v${delivery.package.versionNo}`,
          versionNo: delivery.package.versionNo,
        }
      : null,
    inspections: (delivery.package?.inspections ?? []).map((i) => ({
      ref: `inspection:${i.itemId}`,
      itemId: i.itemId,
      state: i.state,
      mandatory: i.mandatory,
    })),
    dispute: dispute.rows[0]
      ? {
          ref: "dispute",
          claim: dispute.rows[0].claim,
          detail: dispute.rows[0].detail,
          openedBy: dispute.rows[0].role,
        }
      : null,
    messages: shown.map((m) => ({
      ref: `msg:${m.id}:v${m.version_no}`,
      author: m.role,
      body: m.body,
      at: m.created_at.toISOString(),
    })),
    coverageGaps,
  };
  context.manifest = [
    agreementRef,
    ...(context.delivery ? [context.delivery.ref] : []),
    ...context.inspections.map((i) => i.ref),
    ...(context.dispute ? [context.dispute.ref] : []),
    ...context.messages.map((m) => m.ref),
  ];
  return { context, bindings };
}

const finish = (pool: Pool, jobId: string, status: string, failure?: string) =>
  pool.query(
    "update ai_job set status = $2, failure = $3, finished_at = now() where id = $1",
    [jobId, status, failure ?? null],
  );

async function process(
  pool: Pool,
  model: AssessmentModel,
  job: { id: string; deal_id: string },
): Promise<void> {
  // Consent is checked when the work starts...
  if (!(await aiMayRead(pool, job.deal_id))) {
    await finish(pool, job.id, "CANCELLED", "CONSENT_NOT_ACTIVE");
    return;
  }
  const { context, bindings } = await buildContext(pool, job.deal_id);
  let assessment: Assessment | null = null;
  let failure = "MODEL_UNAVAILABLE";
  // Bounded: one retry, then stop. No silent fallback to another provider.
  for (let attempt = 0; attempt < ATTEMPTS && !assessment; attempt++) {
    let output: unknown;
    try {
      output = await model.assess(context);
    } catch {
      failure = "MODEL_UNAVAILABLE";
      continue;
    }
    const checked = validateAssessment(output, context.manifest);
    if (checked.ok) assessment = checked.assessment;
    else failure = "INVALID_OUTPUT";
  }
  if (!assessment) {
    await finish(pool, job.id, "FAILED", failure);
    return;
  }
  // ...and again when it finishes. A result that arrives after a withdrawal
  // is thrown away, not stored (V7-19).
  if (!(await aiMayRead(pool, job.deal_id))) {
    await finish(pool, job.id, "DISCARDED", "CONSENT_WITHDRAWN_DURING_RUN");
    return;
  }
  await pool.query(
    `insert into ai_assessment (job_id, deal_id, model_id, prompt_version, policy_version,
       agreement_version_no, package_version_no, message_cursor, context_hash, manifest, output)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      job.id,
      job.deal_id,
      model.id,
      PROMPT_VERSION,
      MONITORING_POLICY.version,
      bindings.agreementVersionNo,
      bindings.packageVersionNo,
      bindings.messageCursor,
      createHash("sha256").update(JSON.stringify(context)).digest("hex"),
      JSON.stringify(context.manifest),
      assessment,
    ],
  );
  await finish(pool, job.id, "DONE");
}

// Run by the worker. Returns how many jobs were taken.
export async function runAssessmentJobs(
  pool: Pool,
  model: AssessmentModel,
): Promise<number> {
  const claimed = await pool.query(
    `update ai_job set status = 'RUNNING'
     where id in (select id from ai_job where status = 'QUEUED'
                  order by created_at limit 5 for update skip locked)
     returning id, deal_id`,
  );
  for (const job of claimed.rows) {
    try {
      await process(pool, model, job);
    } catch (error) {
      // An unexpected error must not leave the deal blocked behind a job that
      // looks as if it is still running.
      await finish(pool, job.id, "FAILED", "INTERNAL_ERROR");
      console.error(
        JSON.stringify({
          level: "error",
          msg: "assessment_job_failed",
          jobId: job.id,
          error: String(error),
        }),
      );
    }
  }
  return claimed.rows.length;
}

export type AssessmentView = {
  job: { status: string; failure: string | null } | null;
  assessment: {
    output: Assessment;
    modelId: string;
    promptVersion: string;
    createdAt: Date;
    // True when the conversation, the delivery or the agreement has changed
    // since this was written (D.11).
    stale: boolean;
  } | null;
  aiMayRead: boolean;
  budgetLeft: number;
};

// For a party or the assigned reviewer; null for anyone else.
export async function getAssessment(
  pool: Pool,
  input: { userId: string; dealId: string },
): Promise<AssessmentView | null> {
  const conversation = await getConversation(pool, input);
  if (!conversation) return null;
  const job = await pool.query(
    "select status, failure from ai_job where deal_id = $1 order by created_at desc limit 1",
    [input.dealId],
  );
  const latest = await pool.query(
    `select output, model_id, prompt_version, created_at, agreement_version_no,
       package_version_no, message_cursor
     from ai_assessment where deal_id = $1 order by created_at desc limit 1`,
    [input.dealId],
  );
  const used = await pool.query(
    "select count(*)::int as n from ai_job where deal_id = $1 and status <> 'CANCELLED'",
    [input.dealId],
  );
  const row = latest.rows[0];
  const now = row ? await currentBindings(pool, input.dealId) : null;
  return {
    job: job.rows[0] ?? null,
    assessment: row
      ? {
          output: row.output,
          modelId: row.model_id,
          promptVersion: row.prompt_version,
          createdAt: row.created_at,
          stale:
            now?.messageCursor !== Number(row.message_cursor) ||
            now?.agreementVersionNo !== row.agreement_version_no ||
            now?.packageVersionNo !== row.package_version_no,
        }
      : null,
    aiMayRead: conversation.aiMayRead,
    budgetLeft: Math.max(0, ASSESSMENT_BUDGET - used.rows[0].n),
  };
}
