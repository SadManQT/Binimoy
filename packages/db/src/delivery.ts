import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@lp/contracts";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Terms } from "./agreements";
import {
  createAggregate,
  lockDeal,
  systemTransition,
  transitionWithin,
} from "./commands";
import type { Pool } from "./index";
import {
  createAuthorization,
  hasOpenDispute,
  heldMinor,
  invalidateAuthorization,
} from "./settlement";

// Spec B5 steps 5 to 7 and INV-06: submitting, inspecting, accepting and
// paying are separate recorded events. None of them implies the next.

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

// Asks the vault homeserver whether this event exists in the deal's vault
// room, is encrypted, and was sent by the seller. Supplied by the caller so
// this module needs no network access of its own.
export type VerifyVaultEvent = (
  dealId: string,
  eventId: string,
  sellerId: string,
) => Promise<boolean>;

type Context = {
  dealId: string;
  role: "buyer" | "seller" | null;
  sellerId: string;
  agreementId: string;
  agreementState: string;
  versionNo: number;
  termsHash: string;
  terms: Terms;
  funded: boolean;
};

async function loadContext(
  client: Pool | PoolClient,
  dealId: string,
  userId: string,
): Promise<Context | null> {
  if (!z.uuid().safeParse(dealId).success) return null;
  const { rows } = await client.query(
    `select a.id as agreement_id, a.state, v.version_no, v.terms_hash, v.terms,
       (select role from deal_party where deal_id = $1 and user_id = $2) as role,
       (select user_id from deal_party where deal_id = $1 and role = 'seller') as seller_id,
       exists (select 1 from funding_invoice f join aggregate fa on fa.id = f.invoice_id
               where f.deal_id = $1 and fa.state = 'CONFIRMED') as funded
     from aggregate a
     join lateral (select * from agreement_version where agreement_id = a.id
                   order by version_no desc limit 1) v on true
     where a.deal_id = $1 and a.type = 'agreement'`,
    [dealId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    dealId,
    role: row.role,
    sellerId: row.seller_id,
    agreementId: row.agreement_id,
    agreementState: row.state,
    versionNo: row.version_no,
    termsHash: row.terms_hash,
    terms: row.terms,
    funded: row.funded,
  };
}

const submission = z.array(
  z.object({
    itemId: z.string(),
    vaultEventId: z.string().min(1).max(255).optional(),
    declared: z.boolean().optional(),
  }),
);

async function currentPackage(client: Pool | PoolClient, dealId: string) {
  const { rows } = await client.query(
    `select p.package_id, p.version_no, a.state from delivery_package p
     join aggregate a on a.id = p.package_id
     where p.deal_id = $1 order by p.version_no desc limit 1`,
    [dealId],
  );
  return rows[0] as
    | { package_id: string; version_no: number; state: string }
    | undefined;
}

// B5 step 5. The seller hands over a versioned package. This starts
// inspection. It moves no money (B5 step 7).
export async function submitDelivery(
  pool: Pool,
  verify: VerifyVaultEvent,
  input: { userId: string; dealId: string; items: unknown },
): Promise<
  | { ok: true; packageId: string; versionNo: number }
  | Failure<
      | "NOT_AUTHORIZED"
      | "VALIDATION_FAILED"
      | "ILLEGAL_TRANSITION"
      | "INCOMPLETE_DELIVERY"
      | "VAULT_INVALID"
    >
> {
  const context = await loadContext(pool, input.dealId, input.userId);
  if (context?.role !== "seller") return fail("NOT_AUTHORIZED");
  if (context.agreementState !== "ACCEPTED" || !context.funded) {
    return fail("ILLEGAL_TRANSITION");
  }
  const parsed = submission.safeParse(input.items);
  if (!parsed.success) return fail("VALIDATION_FAILED");
  const given = new Map(parsed.data.map((i) => [i.itemId, i]));
  const sellerItems = context.terms.items.filter((i) =>
    i.submissionRoles.includes("seller"),
  );
  if (
    [...given.keys()].some((id) => !sellerItems.some((i) => i.itemId === id))
  ) {
    return fail("VALIDATION_FAILED");
  }
  // B7: a package with a mandatory part missing is not a delivery.
  for (const item of sellerItems) {
    const entry = given.get(item.itemId);
    const provided =
      item.dataClass === "vault_secret"
        ? Boolean(entry?.vaultEventId)
        : entry?.declared === true;
    if (item.mandatory && !provided) return fail("INCOMPLETE_DELIVERY");
  }
  // Checked against the homeserver before anything is recorded.
  for (const item of sellerItems) {
    const eventId = given.get(item.itemId)?.vaultEventId;
    if (item.dataClass !== "vault_secret" || !eventId) continue;
    if (!(await verify(context.dealId, eventId, context.sellerId))) {
      return fail("VAULT_INVALID");
    }
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockDeal(client, context.dealId);
    // V7-11: if the no-delivery refund already won the lock, there is no
    // second workflow. Any authorization at all means delivery is over.
    const settled = await client.query(
      `select 1 from settlement_authorization s
       join aggregate a on a.id = s.authorization_id
       where s.deal_id = $1 and a.state not in ('INVALIDATED', 'EXPIRED')
         and (s.path = 'NO_DELIVERY_REFUND' or a.state in ('DISPATCH_COMMITTED', 'CONSUMED'))`,
      [context.dealId],
    );
    if (settled.rowCount !== 0) {
      await client.query("rollback");
      return fail("ILLEGAL_TRANSITION");
    }
    const causationId = randomUUID();
    const principal = `user:${input.userId}`;
    const previous = await currentPackage(client, context.dealId);

    // INV-07: a replacement invalidates what depended on the old version and
    // keeps the old records.
    if (previous?.state === "SUBMITTED") {
      await systemTransition(client, {
        aggregateId: previous.package_id,
        command: "ReplaceDelivery",
        causationId,
      });
      const old = await client.query(
        `select i.inspection_id from inspection_item i
         join aggregate a on a.id = i.inspection_id
         where i.package_id = $1 and a.state in ('PENDING', 'PASSED', 'FAILED', 'UNKNOWN')`,
        [previous.package_id],
      );
      for (const row of old.rows) {
        await systemTransition(client, {
          aggregateId: row.inspection_id,
          command: "InvalidateInspection",
          causationId,
        });
      }
      const unsent = await client.query(
        "select authorization_id from settlement_authorization where package_id = $1",
        [previous.package_id],
      );
      for (const row of unsent.rows) {
        await invalidateAuthorization(
          client,
          row.authorization_id,
          causationId,
        );
      }
    }

    const packageId = await createAggregate(client, {
      type: "delivery",
      dealId: context.dealId,
    });
    const versionNo = (previous?.version_no ?? 0) + 1;
    await client.query(
      `insert into delivery_package (package_id, deal_id, version_no, agreement_id,
         agreement_version_no, terms_hash, submitted_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        packageId,
        context.dealId,
        versionNo,
        context.agreementId,
        context.versionNo,
        context.termsHash,
        input.userId,
      ],
    );
    await transitionWithin(client, {
      aggregateId: packageId,
      command: "SubmitDelivery",
      roles: ["seller"],
      principal,
      causationId,
      data: { versionNo },
    });

    for (const item of context.terms.items) {
      const entry = given.get(item.itemId);
      if (item.submissionRoles.includes("seller")) {
        await client.query(
          "insert into delivery_item (package_id, item_id, vault_event_id, seller_declared) values ($1, $2, $3, $4)",
          [
            packageId,
            item.itemId,
            entry?.vaultEventId ?? null,
            entry?.declared === true,
          ],
        );
      }
      const inspectionId = await createAggregate(client, {
        type: "inspection_item",
        dealId: context.dealId,
      });
      await client.query(
        "insert into inspection_item (inspection_id, deal_id, package_id, item_id, mandatory) values ($1, $2, $3, $4, $5)",
        [inspectionId, context.dealId, packageId, item.itemId, item.mandatory],
      );
      await systemTransition(client, {
        aggregateId: inspectionId,
        command: "StartInspection",
        causationId,
      });
      // What the system can settle by itself, each with its honest proof type.
      const auto =
        item.predicate === "seller_declares" && entry?.declared
          ? (["PASSED", "seller_statement"] as const)
          : item.predicate === "vault.package_bound" && entry?.vaultEventId
            ? (["PASSED", "independent_fact"] as const)
            : null;
      if (auto) {
        await systemTransition(client, {
          aggregateId: inspectionId,
          command: "RecordInspection",
          to: auto[0],
          causationId,
        });
        await client.query(
          "insert into inspection_result (inspection_id, outcome, proof_type, recorded_by) values ($1, $2, $3, 'system:delivery')",
          [inspectionId, auto[0], auto[1]],
        );
      }
    }
    await client.query(
      "update deal_deadline set inspection_due_at = now() + make_interval(hours => $2) where deal_id = $1",
      [context.dealId, context.terms.timing.inspectionHours],
    );
    await client.query("commit");
    return { ok: true, packageId, versionNo };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const OUTCOMES = ["PASSED", "FAILED", "UNKNOWN"] as const;

// B5 step 6: the buyer reports what they found for one item. "Cannot check"
// is UNKNOWN, which is neither a pass nor an accusation (INV-13).
export async function recordInspection(
  pool: Pool,
  input: {
    userId: string;
    inspectionId: string;
    outcome: string;
    note?: string;
  },
): Promise<
  | { ok: true; state: string }
  | Failure<
      | "NOT_AUTHORIZED"
      | "VALIDATION_FAILED"
      | "VERSION_CONFLICT"
      | "ILLEGAL_TRANSITION"
      | "INCOMPLETE_DELIVERY"
    >
> {
  const outcome = OUTCOMES.find((o) => o === input.outcome);
  if (!outcome || !z.uuid().safeParse(input.inspectionId).success) {
    return fail("VALIDATION_FAILED");
  }
  const found = await pool.query(
    "select deal_id, package_id, item_id from inspection_item where inspection_id = $1",
    [input.inspectionId],
  );
  const target = found.rows[0];
  if (!target) return fail("NOT_AUTHORIZED");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const done = async <T>(value: T, commit = false) => {
      await client.query(commit ? "commit" : "rollback");
      return value;
    };
    await lockDeal(client, target.deal_id);
    const context = await loadContext(client, target.deal_id, input.userId);
    if (context?.role !== "buyer") return done(fail("NOT_AUTHORIZED"));
    const item = context.terms.items.find((i) => i.itemId === target.item_id);
    // Only items whose proof is the buyer's own test are the buyer's to record.
    if (item?.predicate !== "buyer_confirms")
      return done(fail("NOT_AUTHORIZED"));

    const current = await currentPackage(client, target.deal_id);
    if (
      current?.package_id !== target.package_id ||
      current?.state !== "SUBMITTED"
    ) {
      return done(fail("VERSION_CONFLICT"));
    }
    const accepted = await client.query(
      "select 1 from delivery_acceptance where package_id = $1",
      [target.package_id],
    );
    if (accepted.rowCount !== 0) return done(fail("ILLEGAL_TRANSITION"));

    if (outcome === "PASSED" && item.dependsOn.length > 0) {
      const blocked = await client.query(
        `select 1 from inspection_item i join aggregate a on a.id = i.inspection_id
         where i.package_id = $1 and i.item_id = any($2) and a.state <> 'PASSED'`,
        [target.package_id, item.dependsOn],
      );
      if (blocked.rowCount !== 0) return done(fail("INCOMPLETE_DELIVERY"));
    }

    const causationId = randomUUID();
    const principal = `user:${input.userId}`;
    const state = await client.query(
      "select state from aggregate where id = $1",
      [input.inspectionId],
    );
    // A retest starts a new attempt; the earlier result stays on record.
    if (state.rows[0].state !== "PENDING") {
      const restarted = await transitionWithin(client, {
        aggregateId: input.inspectionId,
        command: "StartInspection",
        roles: ["buyer"],
        principal,
        causationId,
      });
      if (!restarted.ok) return done(fail("ILLEGAL_TRANSITION"));
    }
    const recorded = await transitionWithin(client, {
      aggregateId: input.inspectionId,
      command: "RecordInspection",
      roles: ["buyer"],
      principal,
      causationId,
      to: outcome,
    });
    if (!recorded.ok) return done(fail("ILLEGAL_TRANSITION"));
    await client.query(
      "insert into inspection_result (inspection_id, outcome, proof_type, note, recorded_by) values ($1, $2, 'buyer_observation', $3, $4)",
      [
        input.inspectionId,
        outcome,
        (input.note ?? "").slice(0, 2000),
        principal,
      ],
    );
    return done({ ok: true as const, state: outcome }, true);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// B9 ACCEPTED_RELEASE: every mandatory check passed and the buyer accepts this
// exact package version. That authorizes the payout; the settlement engine
// dispatches it.
export async function acceptDelivery(
  pool: Pool,
  input: { userId: string; packageId: string },
): Promise<
  | { ok: true; authorizationId: string }
  | Failure<
      | "NOT_AUTHORIZED"
      | "VERSION_CONFLICT"
      | "INCOMPLETE_DELIVERY"
      | "DISPUTE_OPEN"
      | "INSUFFICIENT_HELD_FUNDS"
    >
> {
  if (!z.uuid().safeParse(input.packageId).success)
    return fail("NOT_AUTHORIZED");
  const found = await pool.query(
    "select deal_id from delivery_package where package_id = $1",
    [input.packageId],
  );
  if (!found.rows[0]) return fail("NOT_AUTHORIZED");
  const dealId: string = found.rows[0].deal_id;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const done = async <T>(value: T, commit = false) => {
      await client.query(commit ? "commit" : "rollback");
      return value;
    };
    await lockDeal(client, dealId);
    const context = await loadContext(client, dealId, input.userId);
    if (context?.role !== "buyer") return done(fail("NOT_AUTHORIZED"));

    // A repeated click returns the authorization the first click created.
    const already = await client.query(
      `select s.authorization_id from delivery_acceptance d
       join settlement_authorization s on s.package_id = d.package_id
       join aggregate a on a.id = s.authorization_id
       where d.package_id = $1 and a.state <> 'INVALIDATED'`,
      [input.packageId],
    );
    if (already.rows[0]) {
      return done({
        ok: true as const,
        authorizationId: already.rows[0].authorization_id as string,
      });
    }
    // Acceptance of anything but the current version is refused.
    const current = await currentPackage(client, dealId);
    if (
      current?.package_id !== input.packageId ||
      current?.state !== "SUBMITTED"
    ) {
      return done(fail("VERSION_CONFLICT"));
    }
    if (await hasOpenDispute(client, dealId)) return done(fail("DISPUTE_OPEN"));
    const failing = await client.query(
      `select 1 from inspection_item i join aggregate a on a.id = i.inspection_id
       where i.package_id = $1 and i.mandatory and a.state <> 'PASSED'`,
      [input.packageId],
    );
    if (failing.rowCount !== 0) return done(fail("INCOMPLETE_DELIVERY"));

    const held = await heldMinor(client, dealId);
    if (held !== BigInt(context.terms.amountMinor)) {
      return done(fail("INSUFFICIENT_HELD_FUNDS"));
    }
    await client.query(
      "insert into delivery_acceptance (package_id, accepted_by) values ($1, $2) on conflict do nothing",
      [input.packageId, input.userId],
    );
    const authorizationId = await createAuthorization(client, {
      dealId,
      path: "ACCEPTED_RELEASE",
      toSellerMinor: held,
      toBuyerMinor: 0n,
      packageId: input.packageId,
      causationId: randomUUID(),
    });
    if (!authorizationId) return done(fail("INSUFFICIENT_HELD_FUNDS"));
    return done({ ok: true as const, authorizationId }, true);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type DeliveryView = {
  deliveryDueAt: Date | null;
  inspectionDueAt: Date | null;
  package: {
    packageId: string;
    versionNo: number;
    state: string;
    accepted: boolean;
    inspections: {
      inspectionId: string;
      itemId: string;
      mandatory: boolean;
      state: string;
    }[];
  } | null;
  settlement: {
    path: string;
    state: string;
    operations: { kind: string; amountMinor: string; state: string }[];
  } | null;
  dispute: { claim: string; state: string; afterDispatch: boolean } | null;
};

// What both parties see. Callers check deal membership first.
export async function getDeliveryView(
  pool: Pool,
  dealId: string,
): Promise<DeliveryView> {
  const deadline = await pool.query(
    "select delivery_due_at, inspection_due_at from deal_deadline where deal_id = $1",
    [dealId],
  );
  const current = await currentPackage(pool, dealId);
  const inspections = current
    ? await pool.query(
        `select i.inspection_id, i.item_id, i.mandatory, a.state
         from inspection_item i join aggregate a on a.id = i.inspection_id
         where i.package_id = $1 order by a.created_at, i.item_id`,
        [current.package_id],
      )
    : null;
  const accepted = current
    ? await pool.query(
        "select 1 from delivery_acceptance where package_id = $1",
        [current.package_id],
      )
    : null;
  const settlement = await pool.query(
    `select s.authorization_id, s.path, a.state from settlement_authorization s
     join aggregate a on a.id = s.authorization_id
     where s.deal_id = $1 order by s.created_at desc limit 1`,
    [dealId],
  );
  const operations = settlement.rows[0]
    ? await pool.query(
        `select o.kind, o.amount_minor::text as amount, a.state
         from adapter_operation o join aggregate a on a.id = o.operation_id
         where o.authorization_id = $1 order by o.kind`,
        [settlement.rows[0].authorization_id],
      )
    : null;
  const dispute = await pool.query(
    `select d.claim, d.after_dispatch, a.state from dispute d
     join aggregate a on a.id = d.dispute_id
     where d.deal_id = $1 order by d.opened_at desc limit 1`,
    [dealId],
  );
  return {
    deliveryDueAt: deadline.rows[0]?.delivery_due_at ?? null,
    inspectionDueAt: deadline.rows[0]?.inspection_due_at ?? null,
    package: current
      ? {
          packageId: current.package_id,
          versionNo: current.version_no,
          state: current.state,
          accepted: accepted?.rowCount === 1,
          inspections: (inspections?.rows ?? []).map((r) => ({
            inspectionId: r.inspection_id,
            itemId: r.item_id,
            mandatory: r.mandatory,
            state: r.state,
          })),
        }
      : null,
    settlement: settlement.rows[0]
      ? {
          path: settlement.rows[0].path,
          state: settlement.rows[0].state,
          operations: (operations?.rows ?? []).map((r) => ({
            kind: r.kind,
            amountMinor: r.amount,
            state: r.state,
          })),
        }
      : null,
    dispute: dispute.rows[0]
      ? {
          claim: dispute.rows[0].claim,
          state: dispute.rows[0].state,
          afterDispatch: dispute.rows[0].after_dispatch,
        }
      : null,
  };
}
