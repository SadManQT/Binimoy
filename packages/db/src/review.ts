import { randomUUID } from "node:crypto";
import { type ErrorCode, parseMoney } from "@lp/contracts";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Terms } from "./agreements";
import { lockDeal, transitionWithin } from "./commands";
import { type DeliveryView, getDeliveryView } from "./delivery";
import type { Pool } from "./index";
import { type Balances, dealBalances } from "./ledger";
import {
  createAuthorization,
  heldMinor,
  invalidateAuthorization,
} from "./settlement";

// Spec B9, B10 and D.6: how a dispute ends. Three ways exist here:
//   - both parties agree an exact split (MUTUAL_RESOLUTION),
//   - a scoped reviewer decides, subject to appeal (REVIEWED_RESOLUTION),
//   - nobody can establish the facts and the case closes unresolved.
// None of them lets a reviewer or anyone else move money directly: every
// outcome becomes an authorization for the settlement engine.

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

// How long an AI-only dispute stays open before it closes unresolved (B15).
const AI_ONLY_BUDGET_DAYS = 7;

type Tx<T> = (
  client: PoolClient,
  done: <V>(value: V, commit?: boolean) => Promise<V>,
) => Promise<T>;

// Runs `work` in a transaction under the deal lock. `done(value, true)`
// commits; `done(value)` rolls back.
async function underDealLock<T>(
  pool: Pool,
  dealId: string,
  work: Tx<T>,
): Promise<T | Failure<"NOT_AUTHORIZED">> {
  if (!z.uuid().safeParse(dealId).success) return fail("NOT_AUTHORIZED");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const done = async <V>(value: V, commit = false) => {
      await client.query(commit ? "commit" : "rollback");
      return value;
    };
    if (!(await lockDeal(client, dealId))) return done(fail("NOT_AUTHORIZED"));
    return await work(client, done);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const partyRole = async (client: PoolClient, dealId: string, userId: string) =>
  (
    await client.query(
      "select role from deal_party where deal_id = $1 and user_id = $2",
      [dealId, userId],
    )
  ).rows[0]?.role as "buyer" | "seller" | undefined;

async function latestDispute(client: PoolClient | Pool, dealId: string) {
  const { rows } = await client.query(
    `select d.dispute_id, a.state from dispute d
     join aggregate a on a.id = d.dispute_id
     where d.deal_id = $1 order by d.opened_at desc limit 1`,
    [dealId],
  );
  return rows[0] as { dispute_id: string; state: string } | undefined;
}

const dealTerms = async (client: PoolClient | Pool, dealId: string) =>
  (
    await client.query(
      `select v.terms from aggregate a
       join lateral (select terms from agreement_version where agreement_id = a.id
                     order by version_no desc limit 1) v on true
       where a.deal_id = $1 and a.type = 'agreement'`,
      [dealId],
    )
  ).rows[0]?.terms as Terms;

// D.2: an active staff role, and never on a deal the reviewer is party to.
async function mayReview(
  client: PoolClient | Pool,
  reviewerId: string,
  dealId: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `select exists (select 1 from staff_role
                    where user_id = $1 and role = 'reviewer' and revoked_at is null)
        and not exists (select 1 from deal_party where deal_id = $2 and user_id = $1) as ok`,
    [reviewerId, dealId],
  );
  return rows[0].ok;
}

const releaseAssignments = (client: PoolClient, disputeId: string) =>
  client.query(
    "update review_assignment set released_at = now() where dispute_id = $1 and released_at is null",
    [disputeId],
  );

const MID_REVIEW = ["OPEN", "QUEUED", "ASSIGNED", "REVIEWING"];

// --- Mutual resolution -----------------------------------------------------

// The proposer names what the seller gets; the buyer gets the rest of the
// held amount. Proposing changes nothing but the open proposal.
export function proposeResolution(
  pool: Pool,
  input: { userId: string; dealId: string; toSellerMinor: string },
) {
  return underDealLock(pool, input.dealId, async (client, done) => {
    if (!(await partyRole(client, input.dealId, input.userId))) {
      return done(fail("NOT_AUTHORIZED"));
    }
    let toSeller: bigint;
    try {
      toSeller = parseMoney(input.toSellerMinor);
    } catch {
      return done(fail("VALIDATION_FAILED"));
    }
    const held = await heldMinor(client, input.dealId);
    if (held <= 0n) return done(fail("INSUFFICIENT_HELD_FUNDS"));
    if (toSeller > held) return done(fail("VALIDATION_FAILED"));
    // Once a reviewer has decided, the decision and its appeal govern.
    const dispute = await latestDispute(client, input.dealId);
    if (
      dispute &&
      !MID_REVIEW.includes(dispute.state) &&
      dispute.state !== "RESOLVED" &&
      dispute.state !== "UNRESOLVED_CLOSED"
    ) {
      return done(fail("ILLEGAL_TRANSITION"));
    }
    await client.query(
      "update resolution_proposal set closed_at = now() where deal_id = $1 and closed_at is null",
      [input.dealId],
    );
    const { rows } = await client.query(
      `insert into resolution_proposal (deal_id, proposed_by, to_seller_minor, to_buyer_minor)
       values ($1, $2, $3, $4) returning id`,
      [
        input.dealId,
        input.userId,
        toSeller.toString(),
        (held - toSeller).toString(),
      ],
    );
    return done({ ok: true as const, proposalId: rows[0].id as string }, true);
  });
}

// The other party accepts that exact proposal. Both consents are then on
// record, bound to one allocation (B9).
export async function acceptResolutionProposal(
  pool: Pool,
  input: { userId: string; proposalId: string },
) {
  if (!z.uuid().safeParse(input.proposalId).success)
    return fail("NOT_AUTHORIZED");
  const found = await pool.query(
    "select deal_id from resolution_proposal where id = $1",
    [input.proposalId],
  );
  if (!found.rows[0]) return fail("NOT_AUTHORIZED");
  const dealId: string = found.rows[0].deal_id;

  return underDealLock(pool, dealId, async (client, done) => {
    const role = await partyRole(client, dealId, input.userId);
    if (!role) return done(fail("NOT_AUTHORIZED"));
    const { rows } = await client.query(
      `select proposed_by, to_seller_minor::text as seller, to_buyer_minor::text as buyer,
         closed_at is null as open
       from resolution_proposal where id = $1`,
      [input.proposalId],
    );
    const proposal = rows[0];
    // Replaced or already used: the consent on screen is stale.
    if (!proposal.open) return done(fail("VERSION_CONFLICT"));
    // One party cannot supply both consents.
    if (proposal.proposed_by === input.userId)
      return done(fail("NOT_AUTHORIZED"));

    const causationId = randomUUID();
    // An accepted-release authorization that has not been dispatched gives
    // way to what both parties now agree.
    const unsent = await client.query(
      `select s.authorization_id from settlement_authorization s
       join aggregate a on a.id = s.authorization_id
       where s.deal_id = $1 and a.state in ('CREATED', 'RESERVED')`,
      [dealId],
    );
    for (const row of unsent.rows) {
      await invalidateAuthorization(client, row.authorization_id, causationId);
    }
    const toSeller = BigInt(proposal.seller);
    const toBuyer = BigInt(proposal.buyer);
    // The held amount changed since the proposal was written.
    if ((await heldMinor(client, dealId)) !== toSeller + toBuyer) {
      return done(fail("VERSION_CONFLICT"));
    }
    const dispute = await latestDispute(client, dealId);
    if (dispute && MID_REVIEW.includes(dispute.state)) {
      // D.6: a mutual resolution resolves the open dispute and clears its hold.
      await transitionWithin(client, {
        aggregateId: dispute.dispute_id,
        command: "AcceptResolution",
        roles: [role],
        principal: `user:${input.userId}`,
        causationId,
        to: "RESOLVED",
        data: { proposalId: input.proposalId },
      });
      await releaseAssignments(client, dispute.dispute_id);
    } else if (
      dispute &&
      !["RESOLVED", "UNRESOLVED_CLOSED"].includes(dispute.state)
    ) {
      return done(fail("ILLEGAL_TRANSITION"));
    }
    const authorizationId = await createAuthorization(client, {
      dealId,
      path: "MUTUAL_RESOLUTION",
      toSellerMinor: toSeller,
      toBuyerMinor: toBuyer,
      packageId: null,
      causationId,
    });
    if (!authorizationId) return done(fail("INSUFFICIENT_HELD_FUNDS"));
    await client.query(
      "update resolution_proposal set closed_at = now(), accepted_by = $2 where id = $1",
      [input.proposalId, input.userId],
    );
    return done({ ok: true as const, authorizationId }, true);
  });
}

// --- Human review ----------------------------------------------------------

export function requestReview(
  pool: Pool,
  input: { userId: string; dealId: string },
) {
  return underDealLock(pool, input.dealId, async (client, done) => {
    const role = await partyRole(client, input.dealId, input.userId);
    if (!role) return done(fail("NOT_AUTHORIZED"));
    // B2: in AI-only mode both parties agreed there is no human review.
    if ((await dealTerms(client, input.dealId)).mode === "ai_only") {
      return done(fail("REVIEW_UNAVAILABLE"));
    }
    const dispute = await latestDispute(client, input.dealId);
    if (!dispute) return done(fail("ILLEGAL_TRANSITION"));
    const result = await transitionWithin(client, {
      aggregateId: dispute.dispute_id,
      command: "RequestReview",
      roles: [role],
      principal: `user:${input.userId}`,
      causationId: randomUUID(),
    });
    if (!result.ok) return done(fail("ILLEGAL_TRANSITION"));
    return done({ ok: true as const, state: result.state }, true);
  });
}

async function disputeDeal(
  pool: Pool,
  disputeId: string,
): Promise<string | null> {
  if (!z.uuid().safeParse(disputeId).success) return null;
  const { rows } = await pool.query(
    "select deal_id from dispute where dispute_id = $1",
    [disputeId],
  );
  return rows[0]?.deal_id ?? null;
}

// A reviewer takes a queued case, or an appeal. The unique index allows one
// active reviewer per case and kind, so a race has exactly one winner.
export async function claimReview(
  pool: Pool,
  input: { reviewerId: string; disputeId: string },
) {
  const dealId = await disputeDeal(pool, input.disputeId);
  if (!dealId) return fail("NOT_AUTHORIZED");
  return underDealLock(pool, dealId, async (client, done) => {
    if (!(await mayReview(client, input.reviewerId, dealId))) {
      return done(fail("NOT_AUTHORIZED"));
    }
    const state = (
      await client.query("select state from aggregate where id = $1", [
        input.disputeId,
      ])
    ).rows[0].state as string;
    const kind =
      state === "QUEUED" ? "review" : state === "APPEALED" ? "appeal" : null;
    if (!kind) return done(fail("ILLEGAL_TRANSITION"));
    if (kind === "appeal") {
      // B10: nobody decides an appeal against their own decision.
      const original = await client.query(
        "select 1 from review_decision where dispute_id = $1 and reviewer_id = $2",
        [input.disputeId, input.reviewerId],
      );
      if (original.rowCount !== 0) return done(fail("NOT_AUTHORIZED"));
    }
    const taken = await client.query(
      `insert into review_assignment (dispute_id, reviewer_id, kind) values ($1, $2, $3)
       on conflict (dispute_id, kind) where released_at is null do nothing`,
      [input.disputeId, input.reviewerId, kind],
    );
    if (taken.rowCount !== 1) return done(fail("VERSION_CONFLICT"));
    if (kind === "review") {
      const causationId = randomUUID();
      for (const command of ["ClaimReview", "StartReview"]) {
        await transitionWithin(client, {
          aggregateId: input.disputeId,
          command,
          roles: ["reviewer"],
          principal: `user:${input.reviewerId}`,
          causationId,
        });
      }
    }
    return done({ ok: true as const, kind }, true);
  });
}

const decisionInput = z.object({
  outcome: z.enum(["ALLOCATE", "UNRESOLVED"]),
  toSellerMinor: z.string().optional(),
  rule: z.string().trim().min(1).max(2000),
  facts: z.string().trim().min(1).max(8000),
  rejectedInferences: z.string().trim().max(8000).default(""),
  reasoning: z.string().trim().min(1).max(8000),
});

// B10: the assigned reviewer records the rule applied, the facts established,
// the inferences rejected and the reasoning. An allocation must account for
// exactly the held amount. A first decision waits out the appeal window; an
// appeal decision is final.
export async function decide(
  pool: Pool,
  input: { reviewerId: string; disputeId: string; decision: unknown },
) {
  const dealId = await disputeDeal(pool, input.disputeId);
  if (!dealId) return fail("NOT_AUTHORIZED");
  const parsed = decisionInput.safeParse(input.decision);
  return underDealLock(pool, dealId, async (client, done) => {
    const assignment = await client.query(
      `select kind from review_assignment
       where dispute_id = $1 and reviewer_id = $2 and released_at is null`,
      [input.disputeId, input.reviewerId],
    );
    const kind = assignment.rows[0]?.kind as "review" | "appeal" | undefined;
    // A revoked staff role ends the right to decide, even mid-case (V7-18).
    if (!kind || !(await mayReview(client, input.reviewerId, dealId))) {
      return done(fail("NOT_AUTHORIZED"));
    }
    if (!parsed.success) return done(fail("VALIDATION_FAILED"));
    const d = parsed.data;
    const held = await heldMinor(client, dealId);
    let toSeller = 0n;
    if (d.outcome === "ALLOCATE") {
      try {
        toSeller = parseMoney(d.toSellerMinor ?? "");
      } catch {
        return done(fail("VALIDATION_FAILED"));
      }
      // A reviewer allocates what is held: no more, no less, no new fees (D.4).
      if (held <= 0n || toSeller > held)
        return done(fail("INSUFFICIENT_HELD_FUNDS"));
    }
    const toBuyer = d.outcome === "ALLOCATE" ? held - toSeller : 0n;
    const terms = await dealTerms(client, dealId);
    const causationId = randomUUID();
    const principal = `user:${input.reviewerId}`;

    const command =
      d.outcome === "UNRESOLVED" && kind === "review"
        ? {
            name: "CloseUnresolved",
            to: "UNRESOLVED_CLOSED",
            role: "reviewer" as const,
          }
        : kind === "review"
          ? {
              name: "ProposeResolution",
              to: "DECIDED_AWAITING_APPEAL",
              role: "reviewer" as const,
            }
          : {
              name: "DecideAppeal",
              to: d.outcome === "ALLOCATE" ? "RESOLVED" : "UNRESOLVED_CLOSED",
              role: "appeal_reviewer" as const,
            };
    const moved = await transitionWithin(client, {
      aggregateId: input.disputeId,
      command: command.name,
      roles: [command.role],
      principal,
      causationId,
      to: command.to,
      data: { outcome: d.outcome },
    });
    if (!moved.ok) return done(fail("ILLEGAL_TRANSITION"));

    const awaitsAppeal = command.to === "DECIDED_AWAITING_APPEAL";
    await client.query(
      `insert into review_decision (dispute_id, kind, reviewer_id, outcome, to_seller_minor,
         to_buyer_minor, rule, facts, rejected_inferences, reasoning, appeal_deadline)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         case when $11 then now() + make_interval(hours => $12) end)`,
      [
        input.disputeId,
        kind,
        input.reviewerId,
        d.outcome,
        toSeller.toString(),
        toBuyer.toString(),
        d.rule,
        d.facts,
        d.rejectedInferences,
        d.reasoning,
        awaitsAppeal,
        terms.timing.appealHours,
      ],
    );
    if (command.to === "RESOLVED") {
      await createAuthorization(client, {
        dealId,
        path: "REVIEWED_RESOLUTION",
        toSellerMinor: toSeller,
        toBuyerMinor: toBuyer,
        packageId: null,
        causationId,
      });
    }
    if (!awaitsAppeal) await releaseAssignments(client, input.disputeId);
    return done({ ok: true as const, state: command.to }, true);
  });
}

const latestDecision = async (client: PoolClient | Pool, disputeId: string) =>
  (
    await client.query(
      `select id, outcome, to_seller_minor::text as seller, to_buyer_minor::text as buyer,
         appeal_deadline, appeal_deadline > now() as appealable
       from review_decision where dispute_id = $1 order by created_at desc limit 1`,
      [disputeId],
    )
  ).rows[0];

// D.6: a timely appeal holds the money and goes to a different reviewer.
export function appealDecision(
  pool: Pool,
  input: { userId: string; dealId: string },
) {
  return underDealLock(pool, input.dealId, async (client, done) => {
    const role = await partyRole(client, input.dealId, input.userId);
    if (!role) return done(fail("NOT_AUTHORIZED"));
    const dispute = await latestDispute(client, input.dealId);
    if (dispute?.state !== "DECIDED_AWAITING_APPEAL") {
      return done(fail("ILLEGAL_TRANSITION"));
    }
    const decision = await latestDecision(client, dispute.dispute_id);
    if (!decision?.appealable) return done(fail("APPEAL_WINDOW_CLOSED"));
    await transitionWithin(client, {
      aggregateId: dispute.dispute_id,
      command: "AppealDecision",
      roles: [role],
      principal: `user:${input.userId}`,
      causationId: randomUUID(),
    });
    // The original reviewer's access ends; they may not decide the appeal.
    await releaseAssignments(client, dispute.dispute_id);
    return done({ ok: true as const }, true);
  });
}

// Turns a standing decision into an authorization. Caller holds the lock and
// has checked that the appeal rule is satisfied.
async function finalize(
  client: PoolClient,
  dealId: string,
  disputeId: string,
): Promise<boolean> {
  const decision = await latestDecision(client, disputeId);
  const toSeller = BigInt(decision.seller);
  const toBuyer = BigInt(decision.buyer);
  // If the held amount no longer matches, nothing is forced through.
  if ((await heldMinor(client, dealId)) !== toSeller + toBuyer) return false;
  const causationId = randomUUID();
  const moved = await transitionWithin(client, {
    aggregateId: disputeId,
    command: "FinalizeDecision",
    roles: ["system"],
    principal: "system:review",
    causationId,
  });
  if (!moved.ok) return false;
  await createAuthorization(client, {
    dealId,
    path: "REVIEWED_RESOLUTION",
    toSellerMinor: toSeller,
    toBuyerMinor: toBuyer,
    packageId: null,
    causationId,
  });
  await releaseAssignments(client, disputeId);
  return true;
}

// Both parties may each give up the rest of their own appeal window. When
// both have, the decision takes effect at once.
export function waiveAppeal(
  pool: Pool,
  input: { userId: string; dealId: string },
) {
  return underDealLock(pool, input.dealId, async (client, done) => {
    if (!(await partyRole(client, input.dealId, input.userId))) {
      return done(fail("NOT_AUTHORIZED"));
    }
    const dispute = await latestDispute(client, input.dealId);
    if (dispute?.state !== "DECIDED_AWAITING_APPEAL") {
      return done(fail("ILLEGAL_TRANSITION"));
    }
    const decision = await latestDecision(client, dispute.dispute_id);
    await client.query(
      "insert into decision_waiver (decision_id, user_id) values ($1, $2) on conflict do nothing",
      [decision.id, input.userId],
    );
    const waivers = await client.query(
      `select count(*)::int as n from decision_waiver w
       join deal_party p on p.deal_id = $2 and p.user_id = w.user_id
       where w.decision_id = $1`,
      [decision.id, input.dealId],
    );
    const finalized =
      waivers.rows[0].n === 2 &&
      (await finalize(client, input.dealId, dispute.dispute_id));
    return done({ ok: true as const, finalized }, true);
  });
}

// Run by the worker: decisions whose appeal window has passed unchallenged.
export async function finalizeDecisions(pool: Pool): Promise<number> {
  const due = await pool.query(
    `select d.deal_id, d.dispute_id from dispute d
     join aggregate a on a.id = d.dispute_id
     where a.state = 'DECIDED_AWAITING_APPEAL'
       and (select appeal_deadline from review_decision r
            where r.dispute_id = d.dispute_id order by created_at desc limit 1) <= now()`,
  );
  let count = 0;
  for (const row of due.rows) {
    const result = await underDealLock(
      pool,
      row.deal_id,
      async (client, done) => {
        const dispute = await latestDispute(client, row.deal_id);
        if (dispute?.state !== "DECIDED_AWAITING_APPEAL") return done(false);
        const decision = await latestDecision(client, row.dispute_id);
        if (decision.appealable) return done(false);
        const ok = await finalize(client, row.deal_id, row.dispute_id);
        return done(ok, ok);
      },
    );
    if (result === true) count++;
  }
  return count;
}

// B15: in AI-only mode an irreducible disagreement ends as unresolved. The
// held money stays held. Nobody is declared the winner.
export async function closeUnresolvedAiOnly(pool: Pool): Promise<number> {
  const due = await pool.query(
    `select d.deal_id, d.dispute_id from dispute d
     join aggregate a on a.id = d.dispute_id
     where a.state = 'OPEN'
       -- Counted from the last change to the case, so reopening it on new
       -- evidence starts a fresh budget instead of closing again at once.
       and coalesce(
             (select max(e.occurred_at) from event e where e.aggregate_id = d.dispute_id),
             d.opened_at
           ) <= now() - make_interval(days => $1)`,
    [AI_ONLY_BUDGET_DAYS],
  );
  let count = 0;
  for (const row of due.rows) {
    const result = await underDealLock(
      pool,
      row.deal_id,
      async (client, done) => {
        if ((await dealTerms(client, row.deal_id)).mode !== "ai_only")
          return done(false);
        const moved = await transitionWithin(client, {
          aggregateId: row.dispute_id,
          command: "CloseUnresolved",
          roles: ["system"],
          principal: "system:review",
          causationId: randomUUID(),
        });
        return done(moved.ok, moved.ok);
      },
    );
    if (result === true) count++;
  }
  return count;
}

// New material evidence may reopen an unresolved case (B15).
export function reopenDispute(
  pool: Pool,
  input: { userId: string; dealId: string },
) {
  return underDealLock(pool, input.dealId, async (client, done) => {
    const role = await partyRole(client, input.dealId, input.userId);
    if (!role) return done(fail("NOT_AUTHORIZED"));
    const dispute = await latestDispute(client, input.dealId);
    if (!dispute) return done(fail("ILLEGAL_TRANSITION"));
    const moved = await transitionWithin(client, {
      aggregateId: dispute.dispute_id,
      command: "ReopenDispute",
      roles: [role],
      principal: `user:${input.userId}`,
      causationId: randomUUID(),
    });
    if (!moved.ok) return done(fail("ILLEGAL_TRANSITION"));
    return done({ ok: true as const }, true);
  });
}

// B2 human-from-start: a reviewer joins the deal before it can be funded.
export function claimDeal(
  pool: Pool,
  input: { reviewerId: string; dealId: string },
) {
  return underDealLock(pool, input.dealId, async (client, done) => {
    if (!(await mayReview(client, input.reviewerId, input.dealId))) {
      return done(fail("NOT_AUTHORIZED"));
    }
    const terms = await dealTerms(client, input.dealId);
    const agreement = await client.query(
      "select state from aggregate where deal_id = $1 and type = 'agreement'",
      [input.dealId],
    );
    if (
      terms?.mode !== "human_from_start" ||
      agreement.rows[0]?.state !== "ACCEPTED"
    ) {
      return done(fail("ILLEGAL_TRANSITION"));
    }
    const taken = await client.query(
      "insert into deal_reviewer (deal_id, reviewer_id) values ($1, $2) on conflict do nothing",
      [input.dealId, input.reviewerId],
    );
    if (taken.rowCount !== 1) return done(fail("VERSION_CONFLICT"));
    return done({ ok: true as const }, true);
  });
}

// --- Views -----------------------------------------------------------------

export type Decision = {
  kind: "review" | "appeal";
  outcome: "ALLOCATE" | "UNRESOLVED";
  toSellerMinor: string;
  toBuyerMinor: string;
  rule: string;
  facts: string;
  rejectedInferences: string;
  reasoning: string;
  appealDeadline: Date | null;
  createdAt: Date;
};

export type DisputeView = {
  disputeId: string;
  state: string;
  decisions: Decision[];
  proposal: {
    proposalId: string;
    proposedByMe: boolean;
    toSellerMinor: string;
    toBuyerMinor: string;
  } | null;
  iWaived: boolean;
  appealable: boolean;
};

const decisionsOf = async (
  pool: Pool,
  disputeId: string,
): Promise<Decision[]> =>
  (
    await pool.query(
      `select kind, outcome, to_seller_minor::text as seller, to_buyer_minor::text as buyer,
         rule, facts, rejected_inferences, reasoning, appeal_deadline, created_at
       from review_decision where dispute_id = $1 order by created_at`,
      [disputeId],
    )
  ).rows.map((r) => ({
    kind: r.kind,
    outcome: r.outcome,
    toSellerMinor: r.seller,
    toBuyerMinor: r.buyer,
    rule: r.rule,
    facts: r.facts,
    rejectedInferences: r.rejected_inferences,
    reasoning: r.reasoning,
    appealDeadline: r.appeal_deadline,
    createdAt: r.created_at,
  }));

// For a party. Callers check deal membership first.
export async function getDisputeView(
  pool: Pool,
  userId: string,
  dealId: string,
): Promise<{ dispute: DisputeView | null; proposal: DisputeView["proposal"] }> {
  const open = await pool.query(
    `select id, proposed_by, to_seller_minor::text as seller, to_buyer_minor::text as buyer
     from resolution_proposal where deal_id = $1 and closed_at is null`,
    [dealId],
  );
  const proposal = open.rows[0]
    ? {
        proposalId: open.rows[0].id as string,
        proposedByMe: open.rows[0].proposed_by === userId,
        toSellerMinor: open.rows[0].seller as string,
        toBuyerMinor: open.rows[0].buyer as string,
      }
    : null;
  const dispute = await latestDispute(pool, dealId);
  if (!dispute) return { dispute: null, proposal };
  const decisions = await decisionsOf(pool, dispute.dispute_id);
  const latest = await latestDecision(pool, dispute.dispute_id);
  const waived = latest
    ? await pool.query(
        "select 1 from decision_waiver where decision_id = $1 and user_id = $2",
        [latest.id, userId],
      )
    : null;
  return {
    proposal,
    dispute: {
      disputeId: dispute.dispute_id,
      state: dispute.state,
      decisions,
      proposal,
      iWaived: waived?.rowCount === 1,
      appealable:
        dispute.state === "DECIDED_AWAITING_APPEAL" &&
        Boolean(latest?.appealable),
    },
  };
}

export type QueueEntry = {
  disputeId: string;
  dealId: string;
  title: string;
  claim: string;
  state: string;
  mine: boolean;
};

// What a staff reviewer may see in the queue: cases waiting, appeals they did
// not decide, and their own active cases. Never a deal they are party to.
export async function reviewQueue(
  pool: Pool,
  reviewerId: string,
): Promise<{
  cases: QueueEntry[];
  deals: { dealId: string; title: string }[];
} | null> {
  const staff = await pool.query(
    "select 1 from staff_role where user_id = $1 and role = 'reviewer' and revoked_at is null",
    [reviewerId],
  );
  if (staff.rowCount !== 1) return null;
  const cases = await pool.query(
    `select d.dispute_id, d.deal_id, dl.title, d.claim, a.state,
       exists (select 1 from review_assignment r where r.dispute_id = d.dispute_id
               and r.reviewer_id = $1 and r.released_at is null) as mine
     from dispute d
     join aggregate a on a.id = d.dispute_id
     join deal dl on dl.id = d.deal_id
     where not exists (select 1 from deal_party p where p.deal_id = d.deal_id and p.user_id = $1)
       and (
         a.state = 'QUEUED'
         or (a.state = 'APPEALED'
             and not exists (select 1 from review_decision x
                             where x.dispute_id = d.dispute_id and x.reviewer_id = $1))
         or exists (select 1 from review_assignment r where r.dispute_id = d.dispute_id
                    and r.reviewer_id = $1 and r.released_at is null)
       )
     order by d.opened_at`,
    [reviewerId],
  );
  const deals = await pool.query(
    `select d.id, d.title from deal d
     join aggregate a on a.deal_id = d.id and a.type = 'agreement' and a.state = 'ACCEPTED'
     join lateral (select terms from agreement_version where agreement_id = a.id
                   order by version_no desc limit 1) v on true
     where v.terms->>'mode' = 'human_from_start'
       and not exists (select 1 from deal_reviewer r where r.deal_id = d.id)
       and not exists (select 1 from deal_party p where p.deal_id = d.id and p.user_id = $1)
     order by d.created_at`,
    [reviewerId],
  );
  return {
    cases: cases.rows.map((r) => ({
      disputeId: r.dispute_id,
      dealId: r.deal_id,
      title: r.title,
      claim: r.claim,
      state: r.state,
      mine: r.mine,
    })),
    deals: deals.rows.map((r) => ({ dealId: r.id, title: r.title })),
  };
}

export type CaseView = {
  disputeId: string;
  dealId: string;
  title: string;
  state: string;
  kind: "review" | "appeal";
  claim: string;
  detail: string;
  afterDispatch: boolean;
  openedBy: "buyer" | "seller";
  parties: { role: string; name: string }[];
  terms: Terms;
  delivery: DeliveryView;
  balances: Balances;
  decisions: Decision[];
};

// D.2: only the reviewer currently assigned to this case can read it. There
// is no vault content here to show: the server never had it.
export async function getCase(
  pool: Pool,
  reviewerId: string,
  disputeId: string,
): Promise<CaseView | null> {
  const dealId = await disputeDeal(pool, disputeId);
  if (!dealId || !(await mayReview(pool, reviewerId, dealId))) return null;
  const { rows } = await pool.query(
    `select r.kind, d.claim, d.detail, d.after_dispatch, a.state, dl.title,
       (select role from deal_party p where p.deal_id = d.deal_id and p.user_id = d.opened_by) as opened_by
     from review_assignment r
     join dispute d on d.dispute_id = r.dispute_id
     join aggregate a on a.id = d.dispute_id
     join deal dl on dl.id = d.deal_id
     where r.dispute_id = $1 and r.reviewer_id = $2 and r.released_at is null`,
    [disputeId, reviewerId],
  );
  const row = rows[0];
  if (!row) return null;
  const parties = await pool.query(
    `select p.role, u.name from deal_party p join app_user u on u.id = p.user_id
     where p.deal_id = $1 order by p.role`,
    [dealId],
  );
  return {
    disputeId,
    dealId,
    title: row.title,
    state: row.state,
    kind: row.kind,
    claim: row.claim,
    detail: row.detail,
    afterDispatch: row.after_dispatch,
    openedBy: row.opened_by,
    parties: parties.rows,
    terms: await dealTerms(pool, dealId),
    delivery: await getDeliveryView(pool, dealId),
    balances: await dealBalances(pool, dealId),
    decisions: await decisionsOf(pool, disputeId),
  };
}
