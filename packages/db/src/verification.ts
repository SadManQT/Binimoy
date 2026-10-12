import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@lp/contracts";
import { PREDICATES } from "@lp/templates";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Terms } from "./agreements";
import { lockDeal, systemTransition } from "./commands";
import type { Pool } from "./index";
import {
  createAuthorization,
  hasOpenDispute,
  heldMinor,
  invalidateAuthorization,
} from "./settlement";

// Spec D.1, INV-08, INV-13 and B9. The synthetic provider answers from facts
// a tester sets for one deal. With no fact it answers UNKNOWN: an absent or
// unreachable provider is never a pass and never an accusation.

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

const isMock = (predicate: string) =>
  PREDICATES[predicate]?.capability?.startsWith("mock_") ?? false;
const same = (a: string | null | undefined, b: string | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

const RECORDER = "adapter:mock_verifier";

async function loadTerms(
  client: Pool | PoolClient,
  dealId: string,
): Promise<Terms | null> {
  const { rows } = await client.query(
    `select v.terms from aggregate a
     join lateral (select terms from agreement_version where agreement_id = a.id
                   order by version_no desc limit 1) v on true
     where a.deal_id = $1 and a.type = 'agreement'`,
    [dealId],
  );
  return rows[0]?.terms ?? null;
}

// Caller holds the deal lock. Re-asks the provider about every item it can
// prove on the current package, records what changed or went stale, and
// withdraws an unsent authorization that rested on a proof that no longer
// holds (INV-07). Returns how many results were recorded.
export async function verifyPackage(
  client: PoolClient,
  dealId: string,
  terms: Terms,
): Promise<number> {
  const current = await client.query(
    `select p.package_id from delivery_package p join aggregate a on a.id = p.package_id
     where p.deal_id = $1 and a.state = 'SUBMITTED'
       and p.version_no = (select max(version_no) from delivery_package where deal_id = $1)
       -- Money that has left is not re-litigated by a later provider answer.
       and not exists (
         select 1 from settlement_authorization s join aggregate sa on sa.id = s.authorization_id
         where s.package_id = p.package_id and sa.state in ('DISPATCH_COMMITTED', 'CONSUMED'))`,
    [dealId],
  );
  const packageId: string | undefined = current.rows[0]?.package_id;
  if (!packageId || !terms.items.some((i) => isMock(i.predicate))) return 0;

  const facts = new Map(
    (
      await client.query(
        "select predicate, outcome, bound_to, detail from mock_provider_fact where deal_id = $1",
        [dealId],
      )
    ).rows.map((f) => [f.predicate as string, f]),
  );
  const inspections = await client.query(
    `select i.inspection_id, i.item_id, a.state,
       (select max(r.recorded_at) from inspection_result r
        where r.inspection_id = i.inspection_id) as last_at
     from inspection_item i join aggregate a on a.id = i.inspection_id
     where i.package_id = $1`,
    [packageId],
  );
  const byItem = new Map(inspections.rows.map((r) => [r.item_id as string, r]));
  const causationId = randomUUID();
  let recorded = 0;
  let lostProof = false;

  // Items are listed after what they depend on, so one pass is enough.
  for (const item of terms.items) {
    if (!isMock(item.predicate)) continue;
    const row = byItem.get(item.itemId);
    if (!row) continue;
    if (item.dependsOn.some((id) => byItem.get(id)?.state !== "PASSED")) {
      continue;
    }
    const fact = facts.get(item.predicate);
    const field = PREDICATES[item.predicate]?.bindsField;
    // A fulfillment the provider reports for some other destination is a
    // failure of this agreement, whatever the provider calls it.
    const outcome: "PASSED" | "FAILED" | "UNKNOWN" = !fact
      ? "UNKNOWN"
      : fact.outcome === "PASSED" &&
          field &&
          !same(fact.bound_to, terms.product[field])
        ? "FAILED"
        : fact.outcome;
    const fresh =
      row.last_at !== null &&
      (item.freshnessHours === null ||
        Date.now() - (row.last_at as Date).getTime() <
          item.freshnessHours * 3_600_000);
    if (row.state === outcome && fresh) continue;

    if (row.state === "PASSED") {
      await systemTransition(client, {
        aggregateId: row.inspection_id,
        command: "InvalidateInspection",
        causationId,
      });
      if (outcome !== "PASSED") lostProof = true;
    }
    if (row.state !== "PENDING") {
      await systemTransition(client, {
        aggregateId: row.inspection_id,
        command: "StartInspection",
        causationId,
      });
    }
    await systemTransition(client, {
      aggregateId: row.inspection_id,
      command: "RecordInspection",
      to: outcome,
      causationId,
    });
    await client.query(
      `insert into inspection_result (inspection_id, outcome, proof_type, note, recorded_by)
       values ($1, $2, 'independent_fact', $3, $4)`,
      [
        row.inspection_id,
        outcome,
        // Codes, not sentences: the page words them in the reader's language.
        !fact
          ? "NO_RECORD"
          : outcome !== fact.outcome
            ? `OTHER_DESTINATION ${fact.bound_to ?? ""}`.slice(0, 250)
            : "",
        RECORDER,
      ],
    );
    row.state = outcome;
    recorded += 1;
  }

  if (lostProof) {
    const unsent = await client.query(
      "select authorization_id from settlement_authorization where package_id = $1",
      [packageId],
    );
    for (const row of unsent.rows) {
      await invalidateAuthorization(client, row.authorization_id, causationId);
    }
  }
  return recorded;
}

// B9 OBJECTIVE_RELEASE. Caller holds the deal lock and has just run
// verifyPackage, so every proof read here is fresh. Opens the challenge
// window when every mandatory item is independently proven, closes it when
// that stops being true or a dispute opens, and authorizes the payout once
// the window has run out unchallenged.
async function objectiveStep(
  client: PoolClient,
  dealId: string,
  terms: Terms,
): Promise<boolean> {
  const hours = terms.timing.objectiveChallengeHours;
  if (!terms.objectiveRelease || hours === null) return false;
  const { rows } = await client.query(
    `select p.package_id,
       not exists (select 1 from inspection_item i join aggregate ia on ia.id = i.inspection_id
                   where i.package_id = p.package_id and i.mandatory and ia.state <> 'PASSED') as proven,
       exists (select 1 from settlement_authorization s join aggregate sa on sa.id = s.authorization_id
               where s.deal_id = p.deal_id and sa.state not in ('INVALIDATED', 'EXPIRED')) as authorized,
       (select w.due_at <= now() from objective_window w where w.package_id = p.package_id) as due
     from delivery_package p join aggregate a on a.id = p.package_id
     where p.deal_id = $1 and a.state = 'SUBMITTED'
       and p.version_no = (select max(version_no) from delivery_package where deal_id = $1)`,
    [dealId],
  );
  const row = rows[0];
  if (!row || row.authorized) return false;
  if (!row.proven || (await hasOpenDispute(client, dealId))) {
    // INV-09: an objection or a lost proof stops the clock; it restarts from
    // zero if the proof returns.
    await client.query("delete from objective_window where package_id = $1", [
      row.package_id,
    ]);
    return false;
  }
  if (row.due === null) {
    await client.query(
      "insert into objective_window (package_id, due_at) values ($1, now() + make_interval(hours => $2))",
      [row.package_id, hours],
    );
    return false;
  }
  if (!row.due) return false;
  const held = await heldMinor(client, dealId);
  if (held !== BigInt(terms.amountMinor)) return false;
  const authorizationId = await createAuthorization(client, {
    dealId,
    path: "OBJECTIVE_RELEASE",
    toSellerMinor: held,
    toBuyerMinor: 0n,
    packageId: row.package_id,
    causationId: randomUUID(),
  });
  return authorizationId !== null;
}

// Verification and the objective-release step for one deal, in one
// transaction under the deal lock. Returns true when anything changed.
export async function verifyDeal(pool: Pool, dealId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockDeal(client, dealId);
    const terms = await loadTerms(client, dealId);
    if (!terms) {
      await client.query("rollback");
      return false;
    }
    const recorded = await verifyPackage(client, dealId, terms);
    const authorized = await objectiveStep(client, dealId, terms);
    await client.query("commit");
    return recorded > 0 || authorized;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Run by the worker: every delivery still under inspection whose agreement
// has an item the synthetic provider can prove.
// ponytail: re-checks up to 200 open deliveries per tick. Give deliveries a
// next-check time if the number of open deals ever makes this slow.
export async function sweepVerifications(pool: Pool): Promise<number> {
  const { rows } = await pool.query(
    `select p.deal_id from delivery_package p
     join aggregate a on a.id = p.package_id
     join agreement_version v on v.agreement_id = p.agreement_id
       and v.version_no = p.agreement_version_no
     where a.state = 'SUBMITTED'
       and p.version_no = (select max(version_no) from delivery_package where deal_id = p.deal_id)
       and p.submitted_at > now() - interval '60 days'
       and not exists (
         select 1 from settlement_authorization s join aggregate sa on sa.id = s.authorization_id
         where s.package_id = p.package_id and sa.state in ('DISPATCH_COMMITTED', 'CONSUMED'))
       and exists (select 1 from jsonb_array_elements(v.terms -> 'items') i
                   where i ->> 'predicate' like 'mock\\_%')
     order by p.submitted_at limit 200`,
  );
  let changed = 0;
  for (const row of rows) {
    if (await verifyDeal(pool, row.deal_id)) changed += 1;
  }
  return changed;
}

const factInput = z.object({
  predicate: z.string(),
  outcome: z.enum(["PASSED", "FAILED", "UNKNOWN"]),
  boundTo: z.string().trim().max(200).optional(),
  detail: z.string().trim().max(500).optional(),
});

// The Scenario Lab's control: a party to the deal plays the fictional
// provider. Only facts this agreement's checklist actually uses can be set.
export async function setMockFact(
  pool: Pool,
  input: { userId: string; dealId: string; fact: unknown },
): Promise<{ ok: true } | Failure<"NOT_AUTHORIZED" | "VALIDATION_FAILED">> {
  if (!z.uuid().safeParse(input.dealId).success) return fail("NOT_AUTHORIZED");
  const party = await pool.query(
    "select 1 from deal_party where deal_id = $1 and user_id = $2",
    [input.dealId, input.userId],
  );
  if (party.rowCount !== 1) return fail("NOT_AUTHORIZED");
  const parsed = factInput.safeParse(input.fact);
  const terms = await loadTerms(pool, input.dealId);
  if (
    !parsed.success ||
    !isMock(parsed.data.predicate) ||
    !terms?.items.some((i) => i.predicate === parsed.data.predicate)
  ) {
    return fail("VALIDATION_FAILED");
  }
  const fact = parsed.data;
  await pool.query(
    `insert into mock_provider_fact (deal_id, predicate, outcome, bound_to, detail, set_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (deal_id, predicate) do update set outcome = excluded.outcome,
       bound_to = excluded.bound_to, detail = excluded.detail,
       set_by = excluded.set_by, set_at = now()`,
    [
      input.dealId,
      fact.predicate,
      fact.outcome,
      fact.boundTo || null,
      fact.detail ?? "",
      input.userId,
    ],
  );
  await verifyDeal(pool, input.dealId);
  return { ok: true };
}

export async function getMockFacts(pool: Pool, dealId: string) {
  const { rows } = await pool.query(
    "select predicate, outcome, bound_to, detail from mock_provider_fact where deal_id = $1",
    [dealId],
  );
  return rows.map((r) => ({
    predicate: r.predicate as string,
    outcome: r.outcome as "PASSED" | "FAILED" | "UNKNOWN",
    boundTo: r.bound_to as string | null,
    detail: r.detail as string,
  }));
}
